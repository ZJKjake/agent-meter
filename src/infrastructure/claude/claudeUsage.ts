import { randomUUID } from 'node:crypto';
import {
  chmod,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const CLAUDE_USAGE_CACHE_VERSION = 1;
export const DEFAULT_CLAUDE_CACHE_STALE_AFTER_MS = 15 * 60 * 1_000;

export type ClaudeCacheState = 'rate-limits' | 'no-rate-limits';

export interface ClaudeUsageWindow {
  readonly id: 'five-hour' | 'seven-day';
  readonly usedPercentage: number;
  readonly resetAt: string | null;
}

export interface ClaudeUsageCache {
  readonly version: typeof CLAUDE_USAGE_CACHE_VERSION;
  readonly provider: 'claude-code';
  readonly state: ClaudeCacheState;
  readonly updatedAt: string;
  readonly windows: readonly ClaudeUsageWindow[];
}

export interface ClaudeStatuslineParseResult {
  readonly state: ClaudeCacheState;
  readonly windows: readonly ClaudeUsageWindow[];
}

export type ClaudeCacheReadResult =
  | { readonly kind: 'missing' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'valid'; readonly cache: ClaudeUsageCache };

const WINDOW_DEFINITIONS = [
  { key: 'five_hour', id: 'five-hour' as const },
  { key: 'seven_day', id: 'seven-day' as const },
];

export function getClaudeUsageCachePath(
  homeDirectory: string = homedir(),
): string {
  return join(homeDirectory, '.agentmeter', 'claude-code-usage.json');
}

export function parseClaudeStatuslineInput(
  value: unknown,
  now: Date = new Date(),
): ClaudeStatuslineParseResult {
  const input = asObject(value);
  const rateLimits = asObject(input?.rate_limits);
  const windows = WINDOW_DEFINITIONS.flatMap(({ key, id }) => {
    const window = asObject(rateLimits?.[key]);
    const usedPercentage = asFiniteNumber(window?.used_percentage);

    if (
      usedPercentage === null ||
      usedPercentage < 0 ||
      usedPercentage > 100
    ) {
      return [];
    }

    return [
      {
        id,
        usedPercentage,
        resetAt: toIsoDate(window?.resets_at),
      },
    ];
  });

  return {
    state: windows.length > 0 ? 'rate-limits' : 'no-rate-limits',
    windows,
  };
}

export function createClaudeUsageCache(
  result: ClaudeStatuslineParseResult,
  updatedAt: Date = new Date(),
): ClaudeUsageCache {
  return {
    version: CLAUDE_USAGE_CACHE_VERSION,
    provider: 'claude-code',
    state: result.state,
    updatedAt: updatedAt.toISOString(),
    windows: result.windows,
  };
}

export async function readClaudeUsageCache(
  cachePath: string,
): Promise<ClaudeCacheReadResult> {
  let contents: string;
  try {
    contents = await readFile(cachePath, 'utf8');
  } catch (error) {
    if (isNodeErrorWithCode(error, 'ENOENT')) {
      return { kind: 'missing' };
    }

    return { kind: 'invalid' };
  }

  try {
    const value = JSON.parse(contents) as unknown;
    const cache = parseClaudeUsageCache(value);
    return cache ? { kind: 'valid', cache } : { kind: 'invalid' };
  } catch {
    return { kind: 'invalid' };
  }
}

export async function writeClaudeUsageCache(
  cachePath: string,
  cache: ClaudeUsageCache,
): Promise<void> {
  const directory = dirname(cachePath);
  const temporaryPath = join(
    directory,
    `.claude-code-usage.${process.pid}.${randomUUID()}.tmp`,
  );

  await mkdir(directory, { recursive: true, mode: 0o700 });

  try {
    await writeFile(
      temporaryPath,
      `${JSON.stringify(cache, null, 2)}\n`,
      { encoding: 'utf8', mode: 0o600 },
    );
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, cachePath);
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}

export function formatClaudeStatusline(
  result: ClaudeStatuslineParseResult,
): string {
  if (result.windows.length === 0) {
    return 'AgentMeter Claude | rate limits unavailable';
  }

  const values = result.windows.map((window) => {
    const label = window.id === 'five-hour' ? '5h' : '7d';
    const remainingPercentage = 100 - Math.round(window.usedPercentage);
    return `${label}: ${remainingPercentage}% left`;
  });

  return `AgentMeter Claude | ${values.join(' · ')}`;
}

function parseClaudeUsageCache(value: unknown): ClaudeUsageCache | null {
  const object = asObject(value);
  if (
    !object ||
    object.version !== CLAUDE_USAGE_CACHE_VERSION ||
    object.provider !== 'claude-code' ||
    (object.state !== 'rate-limits' && object.state !== 'no-rate-limits') ||
    typeof object.updatedAt !== 'string' ||
    !isValidDateString(object.updatedAt) ||
    !Array.isArray(object.windows)
  ) {
    return null;
  }

  const windows = object.windows.flatMap((value) => {
    const window = asObject(value);
    const id = window?.id;
    const usedPercentage = asFiniteNumber(window?.usedPercentage);
    const resetAt = window?.resetAt;

    if (
      (id !== 'five-hour' && id !== 'seven-day') ||
      usedPercentage === null ||
      usedPercentage < 0 ||
      usedPercentage > 100 ||
      (resetAt !== null &&
        (typeof resetAt !== 'string' || !isValidDateString(resetAt)))
    ) {
      return [];
    }

    return [
      {
        id: id as ClaudeUsageWindow['id'],
        usedPercentage,
        resetAt,
      },
    ];
  });

  if (windows.length !== object.windows.length) {
    return null;
  }

  return {
    version: CLAUDE_USAGE_CACHE_VERSION,
    provider: 'claude-code',
    state: object.state,
    updatedAt: object.updatedAt,
    windows,
  };
}

function toIsoDate(value: unknown): string | null {
  const seconds = asFiniteNumber(value);
  if (seconds === null || seconds <= 0) {
    return null;
  }

  const date = new Date(seconds * 1_000);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function isValidDateString(value: string): boolean {
  return Number.isFinite(new Date(value).getTime());
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isNodeErrorWithCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}
