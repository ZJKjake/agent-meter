import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import * as readline from 'node:readline';
import { posix, win32 } from 'node:path';
import {
  ProviderSnapshot,
  UsageCollector,
  UsageRecord,
} from '../../domain/usage';
import { markHeadline } from './quotaHeadline';

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_CANONICAL_LIMIT_ID = 'codex';
const WINDOW_IDS = ['primary', 'secondary'] as const;

interface JsonRpcResponse {
  readonly id?: number;
  readonly result?: unknown;
  readonly error?: {
    readonly message?: string;
  };
}

interface PendingRequest {
  readonly resolve: (response: JsonRpcResponse) => void;
  readonly reject: (error: Error) => void;
  readonly timeout: NodeJS.Timeout;
}

type JsonObject = Record<string, unknown>;

/** One Codex rate-limit pool, such as the general limit or a model limit. */
interface RateLimitBucket {
  readonly id: string;
  readonly name: string | null;
  readonly value: JsonObject;
  readonly isCanonical: boolean;
}

export class CodexUsageCollector implements UsageCollector {
  public readonly tool = 'codex' as const;

  public constructor(
    private readonly command?: string,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
    private readonly clientVersion = 'unknown',
  ) {}

  public async collect(): Promise<ProviderSnapshot> {
    let client: JsonRpcClient | undefined;

    try {
      const launch = getCodexLaunch(this.command ?? resolveCodexCommand());
      const process = spawn(launch.command, launch.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        windowsVerbatimArguments: launch.windowsVerbatimArguments,
      });
      client = new JsonRpcClient(process, this.timeoutMs);

      await client.request(0, 'initialize', {
        clientInfo: {
          name: 'agentmeter',
          title: 'AgentMeter',
          version: this.clientVersion,
        },
      });
      client.notify('initialized', {});

      const response = await client.request(1, 'account/rateLimits/read', {});
      const records = parseRateLimitRecords(response.result);

      return {
        tool: this.tool,
        state: 'available',
        records,
        message:
          records.length > 0
            ? null
            : 'Codex is connected but did not report rate limits.',
      };
    } catch (error) {
      const state = isCommandMissing(error)
        ? 'unsupported'
        : isAuthenticationError(error)
          ? 'authentication-required'
          : 'unavailable';

      return {
        tool: this.tool,
        state,
        records: [],
        message: getCollectorErrorMessage(state),
      };
    } finally {
      client?.dispose();
    }
  }
}

/**
 * GUI-launched VS Code processes often do not inherit the user's shell PATH.
 * Try that PATH first, then common native installation locations before
 * falling back to the bare command so the normal OS lookup still applies.
 */
export function resolveCodexCommand(
  pathValue: string | undefined = process.env.PATH,
  platform: NodeJS.Platform = process.platform,
  fileExists: (path: string) => boolean = existsSync,
  homeDirectory: string = homedir(),
): string {
  const executable = platform === 'win32' ? 'codex.exe' : 'codex';
  const pathJoin = platform === 'win32' ? win32.join : posix.join;
  const pathDelimiter = platform === 'win32' ? ';' : ':';
  const pathCandidates = (pathValue ?? '')
    .split(pathDelimiter)
    .filter(Boolean)
    .flatMap((directory) => platform === 'win32'
      ? ['codex.exe', 'codex.cmd'].map((name) => pathJoin(directory, name))
      : [pathJoin(directory, executable)]);
  const nativeCandidates =
    platform === 'darwin'
      ? ['/opt/homebrew/bin/codex', '/usr/local/bin/codex']
      : platform === 'linux'
        ? [
            '/home/linuxbrew/.linuxbrew/bin/codex',
            '/usr/local/bin/codex',
            '/usr/bin/codex',
          ]
        : [pathJoin(homeDirectory, 'AppData', 'Roaming', 'npm', 'codex.cmd')];

  const userCandidates = platform === 'win32' ? [] : [
    pathJoin(homeDirectory, '.local', 'bin', executable),
    pathJoin(homeDirectory, '.npm-global', 'bin', executable),
    pathJoin(homeDirectory, '.volta', 'bin', executable),
    pathJoin(homeDirectory, '.local', 'share', 'mise', 'shims', executable),
  ];
  return [...pathCandidates, ...userCandidates, ...nativeCandidates].find(fileExists) ?? executable;
}

export function getCodexLaunch(
  command: string,
  platform: NodeJS.Platform = process.platform,
): { command: string; args: string[]; windowsVerbatimArguments?: boolean } {
  if (platform !== 'win32' || !/\.cmd$/i.test(command)) {
    return { command, args: ['app-server', '--stdio'] };
  }
  // Percent expansion and quote/newline injection cannot be made safe by
  // wrapping a cmd.exe command in quotes. Reject such unusual shim paths.
  if (/["%\r\n]/.test(command)) {
    throw new Error('Unsupported Codex command path.');
  }
  return {
    command: 'cmd.exe',
    args: ['/d', '/s', '/v:off', '/c', `""${command}" app-server --stdio"`],
    windowsVerbatimArguments: true,
  };
}

class JsonRpcClient {
  private readonly pending = new Map<number, PendingRequest>();
  private readonly reader: readline.Interface;
  private terminalError: Error | undefined;

  public constructor(
    private readonly process: ChildProcessWithoutNullStreams,
    private readonly timeoutMs: number,
  ) {
    this.reader = readline.createInterface({ input: process.stdout });
    this.reader.on('line', (line) => this.handleLine(line));
    process.stderr.resume();
    process.once('error', (error) => this.fail(error));
    process.stdin.on('error', (error) => this.fail(error));
    process.stdout.on('error', (error) => this.fail(error));
    process.once('exit', () => this.fail(new Error('Codex app-server exited.')));
    let receivedBytes = 0;
    process.stdout.on('data', (chunk: Buffer) => {
      receivedBytes += chunk.length;
      if (receivedBytes > 1024 * 1024) {
        this.fail(new Error('Codex app-server response exceeded the size limit.'));
      }
    });
  }

  public request(
    id: number,
    method: string,
    params: JsonObject,
  ): Promise<JsonRpcResponse> {
    if (this.terminalError) { return Promise.reject(this.terminalError); }
    return new Promise<JsonRpcResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex request timed out: ${method}.`));
      }, this.timeoutMs);

      this.pending.set(id, { resolve, reject, timeout });
      this.process.stdin.write(
        `${JSON.stringify({ method, id, params })}\n`,
        (error) => {
          if (error) {
            this.pending.delete(id);
            clearTimeout(timeout);
            reject(error);
          }
        },
      );
    });
  }

  public notify(method: string, params: JsonObject): void {
    if (this.terminalError) { throw this.terminalError; }
    this.process.stdin.write(`${JSON.stringify({ method, params })}\n`, (error) => {
      if (error) { this.fail(error); }
    });
  }

  public dispose(): void {
    this.reader.close();
    this.fail(new Error('Codex app-server connection closed.'));
    if (!this.process.killed) {
      if (process.platform === 'win32' && this.process.pid) {
        // An npm .cmd shim starts a child Node process. Killing only cmd.exe
        // would leave that app-server running after every refresh.
        const killer = spawn('taskkill', ['/pid', String(this.process.pid), '/T', '/F'], {
          stdio: 'ignore', windowsHide: true,
        });
        killer.once('error', () => this.process.kill());
      } else {
        this.process.kill();
      }
    }
  }

  private handleLine(line: string): void {
    if (!line.trim()) {
      return;
    }

    let response: JsonRpcResponse;
    try {
      const parsed: unknown = JSON.parse(line);
      if (!asObject(parsed)) { throw new Error('Invalid JSON-RPC response.'); }
      response = parsed as JsonRpcResponse;
    } catch {
      this.fail(new Error('Codex app-server returned invalid JSON.'));
      return;
    }

    if (typeof response.id !== 'number') {
      return;
    }

    const request = this.pending.get(response.id);
    if (!request) {
      return;
    }

    this.pending.delete(response.id);
    clearTimeout(request.timeout);

    if (response.error) {
      request.reject(new Error(response.error.message ?? 'Codex request failed.'));
      return;
    }

    request.resolve(response);
  }

  private fail(error: Error): void {
    this.terminalError ??= error;
    this.rejectAll(error);
  }

  private rejectAll(error: Error): void {
    for (const [id, request] of this.pending) {
      clearTimeout(request.timeout);
      request.reject(error);
      this.pending.delete(id);
    }
  }
}

/**
 * Codex reports a general limit plus any number of model-specific limits, and
 * several of them can share a window length.
 *
 * Only the general limit is reported. A model limit is a sub-limit of that
 * same plan allowance rather than a budget of its own, so listing it beside
 * the general limit invites the reader to add up quotas that overlap. That
 * leaves Codex with the two windows it actually meters against.
 */
export function parseRateLimitRecords(value: unknown): readonly UsageRecord[] {
  const result = asObject(value);
  if (!result) {
    return [];
  }

  const canonicalLimitId = getCanonicalLimitId(result);
  const buckets = getBuckets(result, canonicalLimitId);
  const bucket =
    buckets.find((candidate) => candidate.isCanonical) ?? buckets[0];

  if (!bucket) {
    return [];
  }

  const updatedAt = new Date();
  const records = WINDOW_IDS.flatMap((windowId) => {
    const record = toRecord(bucket, windowId, updatedAt);
    return record ? [record] : [];
  });

  return markHeadline(records);
}

function getCanonicalLimitId(result: JsonObject): string {
  const rateLimits = asObject(result.rateLimits);
  return (
    asNonEmptyString(rateLimits?.limitId) ?? DEFAULT_CANONICAL_LIMIT_ID
  );
}

function getBuckets(
  result: JsonObject,
  canonicalLimitId: string,
): readonly RateLimitBucket[] {
  const byLimitId = asObject(result.rateLimitsByLimitId) ?? {};
  const buckets = new Map<string, RateLimitBucket>();

  for (const [id, value] of Object.entries(byLimitId)) {
    const bucket = asObject(value);
    if (bucket) {
      buckets.set(id, toBucket(id, bucket, canonicalLimitId));
    }
  }

  // Top-level `rateLimits` is the backward-compatible view of the canonical
  // limit. Overwriting the keyed copy keeps both views from rendering twice.
  const rateLimits = asObject(result.rateLimits);
  if (rateLimits) {
    buckets.set(
      canonicalLimitId,
      toBucket(canonicalLimitId, rateLimits, canonicalLimitId),
    );
  }

  return [...buckets.values()].sort(compareBuckets);
}

/**
 * Canonical limit first, then limit id. Never response order, so reordered
 * responses cannot change what the status bar shows.
 */
function compareBuckets(
  left: RateLimitBucket,
  right: RateLimitBucket,
): number {
  if (left.isCanonical !== right.isCanonical) {
    return left.isCanonical ? -1 : 1;
  }

  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function toBucket(
  id: string,
  value: JsonObject,
  canonicalLimitId: string,
): RateLimitBucket {
  return {
    id,
    name: asNonEmptyString(value.limitName),
    value,
    isCanonical: id === canonicalLimitId,
  };
}

function toRecord(
  bucket: RateLimitBucket,
  windowId: (typeof WINDOW_IDS)[number],
  updatedAt: Date,
): UsageRecord | null {
  const window = asObject(bucket.value[windowId]);
  const usedPercent = asFiniteNumber(window?.usedPercent);
  if (!window || usedPercent === null) {
    return null;
  }

  const durationMinutes = asFiniteNumber(window.windowDurationMins);
  const resetSeconds = asFiniteNumber(window.resetsAt);

  return {
    id: `${bucket.id}:${windowId}`,
    tool: 'codex',
    used: usedPercent,
    limit: 100,
    unit: 'percent',
    // The general limit is the only pool reported, so it needs no heading to
    // tell it apart. A name is only useful in the fallback below, where a
    // model limit stands in because Codex sent no general limit at all.
    scopeLabel: bucket.isCanonical ? null : (bucket.name ?? bucket.id),
    periodLabel: getWindowLabel(durationMinutes),
    isHeadline: false,
    isStale: false,
    resetAt:
      resetSeconds === null || resetSeconds <= 0
        ? null
        : new Date(resetSeconds * 1_000),
    updatedAt,
    source: 'local',
  };
}

function getWindowLabel(durationMinutes: number | null): string {
  if (durationMinutes === null || durationMinutes <= 0) {
    return 'Quota window';
  }

  if (durationMinutes % 10_080 === 0) {
    return `${durationMinutes / 10_080}-week window`;
  }

  if (durationMinutes % 1_440 === 0) {
    return `${durationMinutes / 1_440}-day window`;
  }

  if (durationMinutes % 60 === 0) {
    return `${durationMinutes / 60}-hour window`;
  }

  return `${durationMinutes}-minute window`;
}

function asObject(value: unknown): JsonObject | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isCommandMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

function isAuthenticationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return /auth|login|sign.?in|unauthorized|forbidden|credential/.test(message);
}

function getCollectorErrorMessage(
  state: 'authentication-required' | 'unavailable' | 'unsupported',
): string {
  switch (state) {
    case 'authentication-required':
      return 'Sign in to Codex to read rate limits.';
    case 'unsupported':
      return 'Codex CLI was not found on PATH.';
    case 'unavailable':
      return 'Codex rate limits could not be read right now.';
  }
}
