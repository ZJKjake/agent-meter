import { existsSync } from 'node:fs';
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import * as readline from 'node:readline';
import { delimiter, join } from 'node:path';
import {
  ProviderSnapshot,
  UsageCollector,
  UsageRecord,
} from '../../domain/usage';

const DEFAULT_TIMEOUT_MS = 8_000;

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

export class CodexUsageCollector implements UsageCollector {
  public readonly tool = 'codex' as const;

  public constructor(
    private readonly command = resolveCodexCommand(),
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
    private readonly clientVersion = 'unknown',
  ) {}

  public async collect(): Promise<ProviderSnapshot> {
    let client: JsonRpcClient | undefined;

    try {
      const process = spawn(this.command, ['app-server', '--stdio'], {
        stdio: ['pipe', 'pipe', 'pipe'],
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
): string {
  const executable = platform === 'win32' ? 'codex.exe' : 'codex';
  const pathDelimiter = platform === 'win32' ? ';' : delimiter;
  const pathCandidates = (pathValue ?? '')
    .split(pathDelimiter)
    .filter(Boolean)
    .map((directory) => join(directory, executable));
  const nativeCandidates =
    platform === 'darwin'
      ? ['/opt/homebrew/bin/codex', '/usr/local/bin/codex']
      : platform === 'linux'
        ? [
            '/home/linuxbrew/.linuxbrew/bin/codex',
            '/usr/local/bin/codex',
            '/usr/bin/codex',
          ]
        : [];

  return [...pathCandidates, ...nativeCandidates].find(fileExists) ?? executable;
}

class JsonRpcClient {
  private readonly pending = new Map<number, PendingRequest>();
  private readonly reader: readline.Interface;

  public constructor(
    private readonly process: ChildProcessWithoutNullStreams,
    private readonly timeoutMs: number,
  ) {
    this.reader = readline.createInterface({ input: process.stdout });
    this.reader.on('line', (line) => this.handleLine(line));
    process.stderr.resume();
    process.once('error', (error) => this.rejectAll(error));
    process.once('exit', (code) => {
      if (code !== null && code !== 0) {
        this.rejectAll(new Error(`Codex app-server exited with code ${code}.`));
      }
    });
  }

  public request(
    id: number,
    method: string,
    params: JsonObject,
  ): Promise<JsonRpcResponse> {
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
    this.process.stdin.write(`${JSON.stringify({ method, params })}\n`);
  }

  public dispose(): void {
    this.reader.close();
    this.rejectAll(new Error('Codex app-server connection closed.'));
    if (!this.process.killed) {
      this.process.kill();
    }
  }

  private handleLine(line: string): void {
    if (!line.trim()) {
      return;
    }

    let response: JsonRpcResponse;
    try {
      response = JSON.parse(line) as JsonRpcResponse;
    } catch {
      this.rejectAll(new Error('Codex app-server returned invalid JSON.'));
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

  private rejectAll(error: Error): void {
    for (const [id, request] of this.pending) {
      clearTimeout(request.timeout);
      request.reject(error);
      this.pending.delete(id);
    }
  }
}

export function parseRateLimitRecords(value: unknown): readonly UsageRecord[] {
  const result = asObject(value);
  if (!result) {
    return [];
  }

  const buckets = getBuckets(result);
  const records: UsageRecord[] = [];

  for (const bucket of buckets) {
    appendWindow(records, bucket.id, 'primary', bucket.value.primary);
    appendWindow(records, bucket.id, 'secondary', bucket.value.secondary);
  }

  return records;
}

function getBuckets(result: JsonObject): readonly { id: string; value: JsonObject }[] {
  const byLimitId = asObject(result.rateLimitsByLimitId);
  if (byLimitId) {
    return Object.entries(byLimitId).flatMap(([id, value]) => {
      const bucket = asObject(value);
      return bucket ? [{ id, value: bucket }] : [];
    });
  }

  const rateLimits = asObject(result.rateLimits);
  return rateLimits ? [{ id: 'codex', value: rateLimits }] : [];
}

function appendWindow(
  records: UsageRecord[],
  bucketId: string,
  windowId: string,
  value: unknown,
): void {
  const window = asObject(value);
  const usedPercent = asFiniteNumber(window?.usedPercent);
  if (!window || usedPercent === null) {
    return;
  }

  const durationMinutes = asFiniteNumber(window.windowDurationMins);
  const resetSeconds = asFiniteNumber(window.resetsAt);

  records.push({
    id: `${bucketId}:${windowId}`,
    tool: 'codex',
    used: usedPercent,
    limit: 100,
    unit: 'percent',
    periodLabel: getWindowLabel(durationMinutes),
    resetAt:
      resetSeconds === null || resetSeconds <= 0
        ? null
        : new Date(resetSeconds * 1_000),
    updatedAt: new Date(),
    source: 'local',
  });
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
  return typeof value === 'object' && value !== null
    ? (value as JsonObject)
    : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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
