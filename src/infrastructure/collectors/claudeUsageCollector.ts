import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import {
  ProviderSnapshot,
  UsageCollector,
  UsageRecord,
} from '../../domain/usage';
import {
  DEFAULT_CLAUDE_CACHE_STALE_AFTER_MS,
  getClaudeUsageCachePath,
  readClaudeUsageCache,
} from '../claude/claudeUsage';

export class ClaudeUsageCollector implements UsageCollector {
  public readonly tool = 'claude-code' as const;

  public constructor(
    private readonly cachePath = getClaudeUsageCachePath(),
    private readonly staleAfterMs = DEFAULT_CLAUDE_CACHE_STALE_AFTER_MS,
    private readonly now: () => Date = () => new Date(),
    private readonly isInstalled: () => boolean = isClaudeCodeInstalled,
  ) {}

  public async collect(): Promise<ProviderSnapshot> {
    const result = await readClaudeUsageCache(this.cachePath);

    if (result.kind === 'missing') {
      return this.unavailableSnapshot(
        this.isInstalled()
          ? 'Setup required. Run AgentMeter: Configure Claude Code.'
          : 'Claude Code was not detected. Install it, sign in, then configure the AgentMeter bridge.',
        'setup-required',
      );
    }

    if (result.kind === 'invalid') {
      return this.unavailableSnapshot(
        'Claude Code usage cache is invalid. Reconfigure the status line to repair it.',
        'unavailable',
      );
    }

    const cache = result.cache;
    const age = this.now().getTime() - new Date(cache.updatedAt).getTime();
    const isStale = !Number.isFinite(age) || age > this.staleAfterMs;

    if (cache.state === 'no-rate-limits') {
      return {
        tool: this.tool,
        state: isStale ? 'stale' : 'available',
        records: [],
        message: isStale
          ? 'Claude Code usage cache is stale. Open Claude Code to refresh it.'
          : 'Claude Code did not expose subscription rate limits. API-key users may not have rate-limit data.',
      };
    }

    const records = cache.windows.map((window): UsageRecord => ({
      id: `claude-code:${window.id}`,
      tool: this.tool,
      used: window.usedPercentage,
      limit: 100,
      unit: 'percent',
      periodLabel: window.id === 'five-hour' ? '5-hour window' : '7-day window',
      resetAt: window.resetAt ? new Date(window.resetAt) : null,
      updatedAt: new Date(cache.updatedAt),
      source: 'local',
    }));

    return {
      tool: this.tool,
      state: isStale ? 'stale' : 'available',
      records,
      message: isStale
        ? 'Claude Code usage cache is stale. Open Claude Code to refresh it.'
        : null,
    };
  }

  private unavailableSnapshot(
    message: string,
    state: 'setup-required' | 'unavailable',
  ): ProviderSnapshot {
    return {
      tool: this.tool,
      state,
      records: [],
      message,
    };
  }
}

export function isClaudeCodeInstalled(
  pathValue: string | undefined = process.env.PATH,
  platform: NodeJS.Platform = process.platform,
  homeDirectory: string = homedir(),
  fileExists: (path: string) => boolean = existsSync,
): boolean {
  const executable = platform === 'win32' ? 'claude.exe' : 'claude';
  const pathDelimiter = platform === 'win32' ? ';' : delimiter;
  const pathCandidates = (pathValue ?? '')
    .split(pathDelimiter)
    .filter(Boolean)
    .map((directory) => join(directory, executable));
  const nativeCandidates =
    platform === 'darwin'
      ? [
          '/opt/homebrew/bin/claude',
          '/usr/local/bin/claude',
          join(homeDirectory, '.local', 'bin', 'claude'),
        ]
      : platform === 'linux'
        ? [
            '/usr/local/bin/claude',
            '/usr/bin/claude',
            join(homeDirectory, '.local', 'bin', 'claude'),
          ]
        : [];

  return [...pathCandidates, ...nativeCandidates].some(fileExists);
}
