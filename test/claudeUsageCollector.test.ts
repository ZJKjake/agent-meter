import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ClaudeUsageCollector } from '../src/infrastructure/collectors/claudeUsageCollector';
import {
  createClaudeUsageCache,
  writeClaudeUsageCache,
} from '../src/infrastructure/claude/claudeUsage';

describe('ClaudeUsageCollector', () => {
  it('returns a bridge-not-installed state when the cache is missing', async () => {
    const collector = new ClaudeUsageCollector(
      '/missing/claude-usage.json',
      undefined,
      undefined,
      () => true,
    );

    await expect(collector.collect()).resolves.toMatchObject({
      tool: 'claude-code',
      state: 'setup-required',
      records: [],
      message: 'Setup required. Run AgentMeter: Configure Claude Code.',
    });
  });

  it('explains when Claude Code itself is not detected', async () => {
    const collector = new ClaudeUsageCollector(
      '/missing/claude-usage.json',
      undefined,
      undefined,
      () => false,
    );

    await expect(collector.collect()).resolves.toMatchObject({
      state: 'setup-required',
      message:
        'Claude Code was not detected. Install it, sign in, then configure the AgentMeter bridge.',
    });
  });

  it('normalizes both cached quota windows', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'agentmeter-claude-'));
    const cachePath = join(directory, 'usage.json');
    const updatedAt = new Date('2026-08-20T12:00:00.000Z');

    try {
      await writeClaudeUsageCache(
        cachePath,
        createClaudeUsageCache(
          {
            state: 'rate-limits',
            windows: [
              {
                id: 'five-hour',
                usedPercentage: 25,
                resetAt: '2026-08-20T15:00:00.000Z',
              },
              {
                id: 'seven-day',
                usedPercentage: 50,
                resetAt: '2026-08-24T12:00:00.000Z',
              },
            ],
          },
          updatedAt,
        ),
      );

      const snapshot = await new ClaudeUsageCollector(
        cachePath,
        15 * 60 * 1_000,
        () => new Date('2026-08-20T12:05:00.000Z'),
      ).collect();

      expect(snapshot).toMatchObject({
        tool: 'claude-code',
        state: 'available',
        message: null,
      });
      expect(snapshot.records).toMatchObject([
        {
          id: 'claude-code:five-hour',
          used: 25,
          limit: 100,
          unit: 'percent',
          source: 'local',
        },
        {
          id: 'claude-code:seven-day',
          used: 50,
        },
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('marks old cache data as stale', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'agentmeter-claude-'));
    const cachePath = join(directory, 'usage.json');

    try {
      await writeClaudeUsageCache(
        cachePath,
        createClaudeUsageCache(
          {
            state: 'rate-limits',
            windows: [
              { id: 'five-hour', usedPercentage: 80, resetAt: null },
            ],
          },
          new Date('2026-08-20T10:00:00.000Z'),
        ),
      );

      await expect(
        new ClaudeUsageCollector(
          cachePath,
          15 * 60 * 1_000,
          () => new Date('2026-08-20T12:00:00.000Z'),
        ).collect(),
      ).resolves.toMatchObject({
        state: 'stale',
        message: 'Claude Code usage cache is stale. Open Claude Code to refresh it.',
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('handles users without subscription rate-limit data', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'agentmeter-claude-'));
    const cachePath = join(directory, 'usage.json');

    try {
      await writeClaudeUsageCache(
        cachePath,
        createClaudeUsageCache({ state: 'no-rate-limits', windows: [] }),
      );

      await expect(new ClaudeUsageCollector(cachePath).collect()).resolves.toMatchObject({
        state: 'available',
        records: [],
        message:
          'Claude Code did not expose subscription rate limits. API-key users may not have rate-limit data.',
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
