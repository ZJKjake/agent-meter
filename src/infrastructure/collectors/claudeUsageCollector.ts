import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import {
  ProviderSnapshot,
  UsageCollector,
  UsageRecord,
} from '../../domain/usage';
import {
  ClaudeUsageWindow,
  DEFAULT_CLAUDE_CACHE_STALE_AFTER_MS,
  getClaudeUsageCachePath,
  readClaudeUsageCache,
} from '../claude/claudeUsage';
import { markHeadline } from './quotaHeadline';

/**
 * How much of the 5-hour window must be spent before it is worth showing
 * beside the weekly figure. Usage here can climb fast, so this sits low
 * enough to leave room to react rather than to confirm a limit already hit.
 */
const FIVE_HOUR_SHOWN_USED_PERCENT = 50;

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
        // The provider state already reads "Setup required" everywhere this
        // is shown, so the message only carries the action.
        this.isInstalled()
          ? 'Run AgentMeter: Configure Claude Code to show usage.'
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
    const now = this.now();

    if (cache.state === 'no-rate-limits') {
      const age = now.getTime() - new Date(cache.updatedAt).getTime();
      const isStale = !Number.isFinite(age) || age > this.staleAfterMs;

      return {
        tool: this.tool,
        state: isStale ? 'stale' : 'available',
        records: [],
        message: isStale
          ? 'Claude Code usage cache is stale. Open Claude Code to refresh it.'
          : 'Claude Code did not expose subscription rate limits. API-key users may not have rate-limit data.',
      };
    }

    const reported = cache.windows.map((window): UsageRecord => {
      const resetAt = window.resetAt ? new Date(window.resetAt) : null;

      return {
        id: getRecordId(window.id),
        tool: this.tool,
        used: window.usedPercentage,
        limit: 100,
        unit: 'percent',
        scopeLabel: null,
        periodLabel:
          window.id === 'five-hour' ? '5-hour window' : '7-day window',
        isHeadline: false,
        isStale: resetAt !== null && now.getTime() >= resetAt.getTime(),
        resetAt,
        updatedAt: new Date(cache.updatedAt),
        source: 'local',
      };
    });

    // Claude pushes usage only while it renders a status line, so a cached
    // window keeps describing the window it was read in until that window
    // resets. The provider is only stale once every window it reports has
    // rolled over, which is the point at which no figure describes now.
    // Judged across every window, not only the shown ones, so hiding a quiet
    // window cannot make a live provider look stale.
    const isStale = reported.every((record) => record.isStale);
    const records = markHeadline(getShownRecords(reported));

    return {
      tool: this.tool,
      state: isStale ? 'stale' : 'available',
      records,
      message: isStale
        ? 'Every Claude Code window has reset since this was read. Open Claude Code to refresh it.'
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

function getRecordId(windowId: ClaudeUsageWindow['id']): string {
  return `claude-code:${windowId}`;
}

/**
 * The weekly window drains slowly enough to read days ahead, so it is always
 * shown. The 5-hour window only earns its space once it is close enough to
 * bind, since below that it competes with the figure that matters. A window
 * that has already reset is hidden too: it reports usage the window no longer
 * holds, so a high reading there would raise a false alarm.
 */
function getShownRecords(
  records: readonly UsageRecord[],
): readonly UsageRecord[] {
  const shown = records.filter((record) => {
    if (record.id !== getRecordId('five-hour')) {
      return true;
    }

    return (
      !record.isStale &&
      record.used !== null &&
      record.used >= FIVE_HOUR_SHOWN_USED_PERCENT
    );
  });

  // A card with no bars says less than one showing a quiet window, so the
  // filter never removes the last reading a provider has.
  return shown.length > 0 ? shown : records;
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
