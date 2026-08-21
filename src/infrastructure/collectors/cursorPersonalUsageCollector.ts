import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import {
  ProviderSnapshot,
  UsageCollector,
  UsageRecord,
} from '../../domain/usage';

const CURSOR_USAGE_URL = new URL(
  'https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage',
);
const TOKEN_STORAGE_KEY = 'cursorAuth/accessToken';
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 1024 * 1024;

type CursorTokenReadResult =
  | { readonly kind: 'found'; readonly token: string }
  | { readonly kind: 'missing' }
  | { readonly kind: 'unavailable' };

type CursorUsageRequest = (token: string) => Promise<unknown>;

export interface CursorPersonalUsageCollectorOptions {
  readonly isEnabled: () => boolean;
  readonly isCursorInstalled?: () => boolean;
  readonly readToken?: () => Promise<CursorTokenReadResult>;
  readonly requestUsage?: CursorUsageRequest;
  readonly now?: () => Date;
}

interface ParsedCursorUsage {
  readonly enabled: boolean;
  readonly records: readonly UsageRecord[];
}

type CursorAdapterErrorKind = 'authentication' | 'network' | 'schema';

class CursorAdapterError extends Error {
  public constructor(public readonly kind: CursorAdapterErrorKind) {
    super(`Cursor adapter error: ${kind}`);
  }
}

/**
 * Opt-in personal-plan adapter for Cursor's private local integration.
 *
 * The access token is read from Cursor's application database for each
 * refresh, held only in memory, and sent only to Cursor's HTTPS API. Cursor's
 * contract is private and may change, so all parsing is strict and failures
 * return an explicit unavailable state instead of guessed usage.
 */
export class CursorPersonalUsageCollector implements UsageCollector {
  public readonly tool = 'cursor' as const;

  private readonly readToken: () => Promise<CursorTokenReadResult>;
  private readonly requestUsage: CursorUsageRequest;
  private readonly now: () => Date;
  private readonly isCursorInstalled: () => boolean;

  public constructor(
    private readonly options: CursorPersonalUsageCollectorOptions,
  ) {
    this.readToken = options.readToken ?? readCursorAccessToken;
    this.requestUsage = options.requestUsage ?? requestCursorUsage;
    this.now = options.now ?? (() => new Date());
    this.isCursorInstalled =
      options.isCursorInstalled ??
      (() => existsSync(getCursorStateDatabasePath()));
  }

  public async collect(): Promise<ProviderSnapshot> {
    if (!this.options.isEnabled()) {
      if (!this.isCursorInstalled()) {
        return {
          tool: this.tool,
          state: 'unsupported',
          records: [],
          message:
            'Cursor was not detected. Personal-plan usage is unavailable on this installation.',
        };
      }

      return {
        tool: this.tool,
        state: 'setup-required',
        records: [],
        message:
          'Not connected. Enable the experimental/private Cursor adapter to read personal-plan usage.',
      };
    }

    const tokenResult = await this.readToken();
    if (tokenResult.kind === 'missing') {
      return {
        tool: this.tool,
        state: 'authentication-required',
        records: [],
        message: 'Sign in to Cursor, then refresh AgentMeter.',
      };
    }

    if (tokenResult.kind === 'unavailable') {
      return {
        tool: this.tool,
        state: 'unsupported',
        records: [],
        message:
          'Cursor local authentication data could not be read on this installation.',
      };
    }

    try {
      const payload = await this.requestUsage(tokenResult.token);
      const parsed = parseCursorUsagePayload(payload, this.now());

      if (!parsed) {
        throw new CursorAdapterError('schema');
      }

      if (!parsed.enabled) {
        return {
          tool: this.tool,
          state: 'unsupported',
          records: [],
          message: 'Cursor usage is unavailable for this plan.',
        };
      }

      if (parsed.records.length === 0) {
        throw new CursorAdapterError('schema');
      }

      return {
        tool: this.tool,
        state: 'available',
        records: parsed.records,
        message:
          'Experimental/private integration. Data is read locally and requested directly from Cursor over HTTPS.',
      };
    } catch (error) {
      const kind =
        error instanceof CursorAdapterError ? error.kind : 'network';

      return {
        tool: this.tool,
        state:
          kind === 'authentication'
            ? 'authentication-required'
            : 'unavailable',
        records: [],
        message:
          kind === 'authentication'
            ? 'Cursor rejected the local session. Sign in to Cursor again.'
            : kind === 'schema'
              ? 'Cursor changed its private usage format. No usage is shown.'
              : 'Cursor personal usage could not be reached. No usage is shown.',
      };
    }
  }
}

export function getCursorStateDatabasePath(
  platform: NodeJS.Platform = process.platform,
  homeDirectory: string = homedir(),
  environment: NodeJS.ProcessEnv = process.env,
): string {
  if (platform === 'win32') {
    const appData = environment.APPDATA ??
      join(homeDirectory, 'AppData', 'Roaming');
    return join(appData, 'Cursor', 'User', 'globalStorage', 'state.vscdb');
  }

  if (platform === 'darwin') {
    return join(
      homeDirectory,
      'Library',
      'Application Support',
      'Cursor',
      'User',
      'globalStorage',
      'state.vscdb',
    );
  }

  const configDirectory = environment.XDG_CONFIG_HOME ??
    join(homeDirectory, '.config');
  return join(
    configDirectory,
    'Cursor',
    'User',
    'globalStorage',
    'state.vscdb',
  );
}

export async function readCursorAccessToken(
  databasePath = getCursorStateDatabasePath(),
): Promise<CursorTokenReadResult> {
  if (!existsSync(databasePath)) {
    return { kind: 'unavailable' };
  }

  const sqliteCommand = resolveSqliteCommand();
  if (sqliteCommand) {
    try {
      const token = await readTokenWithSqliteCli(sqliteCommand, databasePath);
      return token ? { kind: 'found', token } : { kind: 'missing' };
    } catch {
      // Modern extension hosts may still provide node:sqlite as a safe,
      // read-only fallback when the sqlite3 command is unavailable or fails.
    }
  }

  try {
    const token = readTokenWithNodeSqlite(databasePath);
    return token ? { kind: 'found', token } : { kind: 'missing' };
  } catch {
    return { kind: 'unavailable' };
  }
}

export function parseCursorUsagePayload(
  value: unknown,
  updatedAt: Date = new Date(),
): ParsedCursorUsage | null {
  const response = asObject(value);
  if (!response || typeof response.enabled !== 'boolean') {
    return null;
  }

  if (!response.enabled) {
    return { enabled: false, records: [] };
  }

  const planUsage = asObject(response.planUsage);
  if (!planUsage) {
    return null;
  }

  const resetAt = parseEpochDate(response.billingCycleEnd);
  const records: UsageRecord[] = [];
  const apiPercentUsed = asPercentage(planUsage.apiPercentUsed);
  const autoPercentUsed = asPercentage(planUsage.autoPercentUsed);
  const totalPercentUsed = asPercentage(planUsage.totalPercentUsed);

  if (apiPercentUsed !== null) {
    records.push(
      percentageRecord(
        'cursor:primary',
        'Other Models pool',
        apiPercentUsed,
        resetAt,
        updatedAt,
      ),
    );
  } else if (totalPercentUsed !== null) {
    records.push(
      percentageRecord(
        'cursor:primary',
        'Included plan usage',
        totalPercentUsed,
        resetAt,
        updatedAt,
      ),
    );
  } else if (autoPercentUsed !== null) {
    records.push(
      percentageRecord(
        'cursor:primary',
        'Cursor Models pool',
        autoPercentUsed,
        resetAt,
        updatedAt,
      ),
    );
  }

  if (autoPercentUsed !== null && records[0]?.periodLabel !== 'Cursor Models pool') {
    records.push(
      percentageRecord(
        'cursor:cursor-models',
        'Cursor Models pool',
        autoPercentUsed,
        resetAt,
        updatedAt,
      ),
    );
  }

  if (totalPercentUsed !== null && records[0]?.periodLabel !== 'Included plan usage') {
    records.push(
      percentageRecord(
        'cursor:overall',
        'Included plan usage',
        totalPercentUsed,
        resetAt,
        updatedAt,
      ),
    );
  }

  return { enabled: true, records };
}

async function requestCursorUsage(
  token: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<unknown> {
  if (
    CURSOR_USAGE_URL.protocol !== 'https:' ||
    CURSOR_USAGE_URL.hostname !== 'api2.cursor.sh'
  ) {
    throw new CursorAdapterError('network');
  }

  const body = '{}';

  return new Promise<unknown>((resolve, reject) => {
    const request = httpsRequest(
      CURSOR_USAGE_URL,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Connect-Protocol-Version': '1',
          'Content-Length': Buffer.byteLength(body),
          'Content-Type': 'application/json',
          'User-Agent': 'AgentMeter/0.1.1',
        },
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        const chunks: Buffer[] = [];
        let size = 0;

        response.on('data', (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += buffer.length;
          if (size > MAX_RESPONSE_BYTES) {
            request.destroy(new CursorAdapterError('schema'));
            return;
          }
          chunks.push(buffer);
        });

        response.once('end', () => {
          if (statusCode === 401 || statusCode === 403) {
            reject(new CursorAdapterError('authentication'));
            return;
          }

          if (statusCode < 200 || statusCode >= 300) {
            reject(new CursorAdapterError('network'));
            return;
          }

          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown);
          } catch {
            reject(new CursorAdapterError('schema'));
          }
        });
      },
    );

    request.setTimeout(timeoutMs, () => {
      request.destroy(new CursorAdapterError('network'));
    });
    request.once('error', (error) => {
      reject(
        error instanceof CursorAdapterError
          ? error
          : new CursorAdapterError('network'),
      );
    });
    request.end(body);
  });
}

function resolveSqliteCommand(
  pathValue: string | undefined = process.env.PATH,
  platform: NodeJS.Platform = process.platform,
): string | null {
  const executable = platform === 'win32' ? 'sqlite3.exe' : 'sqlite3';
  const pathDelimiter = platform === 'win32' ? ';' : delimiter;
  const pathCandidates = (pathValue ?? '')
    .split(pathDelimiter)
    .filter(Boolean)
    .map((directory) => join(directory, executable));
  const nativeCandidates =
    platform === 'darwin'
      ? ['/usr/bin/sqlite3', '/opt/homebrew/bin/sqlite3']
      : platform === 'linux'
        ? ['/usr/bin/sqlite3', '/usr/local/bin/sqlite3']
        : [];

  return [...pathCandidates, ...nativeCandidates].find(existsSync) ?? null;
}

function readTokenWithSqliteCli(
  sqliteCommand: string,
  databasePath: string,
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    execFile(
      sqliteCommand,
      [
        '-readonly',
        databasePath,
        `SELECT value FROM ItemTable WHERE key = '${TOKEN_STORAGE_KEY}' LIMIT 1;`,
      ],
      {
        encoding: 'utf8',
        maxBuffer: 64 * 1024,
        timeout: 4_000,
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(normalizeToken(stdout));
      },
    );
  });
}

function readTokenWithNodeSqlite(databasePath: string): string | null {
  type Database = {
    close(): void;
    prepare(sql: string): { get(): unknown };
  };
  type NodeSqlite = {
    DatabaseSync: new (
      location: string,
      options: { readonly readOnly: boolean },
    ) => Database;
  };

  // node:sqlite exists in modern Cursor/VS Code extension hosts. The require
  // is intentionally guarded so older hosts fall back without activation
  // failure.
  const sqlite = require('node:sqlite') as NodeSqlite;
  const database = new sqlite.DatabaseSync(databasePath, { readOnly: true });

  try {
    const row = database
      .prepare(
        `SELECT value FROM ItemTable WHERE key = '${TOKEN_STORAGE_KEY}' LIMIT 1`,
      )
      .get();
    const value = asObject(row)?.value;
    return typeof value === 'string' ? normalizeToken(value) : null;
  } finally {
    database.close();
  }
}

function normalizeToken(value: string): string | null {
  const token = value.trim();
  return token && token !== 'null' ? token : null;
}

function percentageRecord(
  id: string,
  periodLabel: string,
  used: number,
  resetAt: Date | null,
  updatedAt: Date,
): UsageRecord {
  return {
    id,
    tool: 'cursor',
    used,
    limit: 100,
    unit: 'percent',
    periodLabel,
    resetAt,
    updatedAt,
    source: 'experimental-local',
  };
}

function parseEpochDate(value: unknown): Date | null {
  const numeric =
    typeof value === 'string' && value.trim()
      ? Number(value)
      : typeof value === 'number'
        ? value
        : Number.NaN;
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  const milliseconds = numeric < 1_000_000_000_000 ? numeric * 1_000 : numeric;
  const date = new Date(milliseconds);
  return Number.isFinite(date.getTime()) ? date : null;
}

function asPercentage(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.min(100, value);
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}
