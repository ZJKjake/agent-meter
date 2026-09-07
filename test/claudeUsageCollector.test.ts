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
      message: 'Run AgentMeter: Configure Claude Code to show usage.',
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
                usedPercentage: 65,
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
          used: 65,
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

  it('hides a 5-hour window that is not close to binding', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'agentmeter-claude-'));
    const cachePath = join(directory, 'usage.json');

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
                usedPercentage: 40,
                resetAt: '2026-08-24T12:00:00.000Z',
              },
            ],
          },
          new Date('2026-08-20T12:00:00.000Z'),
        ),
      );

      const snapshot = await new ClaudeUsageCollector(
        cachePath,
        15 * 60 * 1_000,
        () => new Date('2026-08-20T12:05:00.000Z'),
      ).collect();

      expect(snapshot.records).toMatchObject([
        { id: 'claude-code:seven-day', isHeadline: true },
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('keeps a quiet 5-hour window when it is the only reading', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'agentmeter-claude-'));
    const cachePath = join(directory, 'usage.json');

    try {
      await writeClaudeUsageCache(
        cachePath,
        createClaudeUsageCache(
          {
            state: 'rate-limits',
            windows: [
              {
                id: 'five-hour',
                usedPercentage: 5,
                resetAt: '2026-08-20T15:00:00.000Z',
              },
            ],
          },
          new Date('2026-08-20T12:00:00.000Z'),
        ),
      );

      const snapshot = await new ClaudeUsageCollector(
        cachePath,
        15 * 60 * 1_000,
        () => new Date('2026-08-20T12:05:00.000Z'),
      ).collect();

      expect(snapshot.records).toMatchObject([
        { id: 'claude-code:five-hour', used: 5, isHeadline: true },
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('judges provider staleness across every window, not only the shown ones', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'agentmeter-claude-'));
    const cachePath = join(directory, 'usage.json');

    try {
      await writeClaudeUsageCache(
        cachePath,
        createClaudeUsageCache(
          {
            state: 'rate-limits',
            windows: [
              {
                id: 'five-hour',
                usedPercentage: 10,
                resetAt: '2026-08-24T15:00:00.000Z',
              },
              {
                id: 'seven-day',
                usedPercentage: 40,
                resetAt: '2026-08-24T12:00:00.000Z',
              },
            ],
          },
          new Date('2026-08-20T12:00:00.000Z'),
        ),
      );

      // The quiet 5-hour window is hidden but has not reset, so the provider
      // is still live even though the one shown window has rolled over.
      const snapshot = await new ClaudeUsageCollector(
        cachePath,
        15 * 60 * 1_000,
        () => new Date('2026-08-24T13:00:00.000Z'),
      ).collect();

      expect(snapshot).toMatchObject({ state: 'available', message: null });
      expect(snapshot.records).toMatchObject([
        { id: 'claude-code:seven-day', isStale: true },
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('hides a 5-hour window that has already reset', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'agentmeter-claude-'));
    const cachePath = join(directory, 'usage.json');

    try {
      await writeClaudeUsageCache(
        cachePath,
        createClaudeUsageCache(
          {
            state: 'rate-limits',
            windows: [
              {
                id: 'five-hour',
                usedPercentage: 80,
                resetAt: '2026-08-20T15:00:00.000Z',
              },
              {
                id: 'seven-day',
                usedPercentage: 40,
                resetAt: '2026-08-24T12:00:00.000Z',
              },
            ],
          },
          new Date('2026-08-20T12:00:00.000Z'),
        ),
      );

      // A day later the 5-hour window has rolled over, so its 80% describes
      // usage the window no longer holds and would raise a false alarm.
      const snapshot = await new ClaudeUsageCollector(
        cachePath,
        15 * 60 * 1_000,
        () => new Date('2026-08-21T12:00:00.000Z'),
      ).collect();

      expect(snapshot).toMatchObject({ state: 'available', message: null });
      expect(snapshot.records).toMatchObject([
        { id: 'claude-code:seven-day', isStale: false, isHeadline: true },
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('marks the provider stale once every window has reset', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'agentmeter-claude-'));
    const cachePath = join(directory, 'usage.json');

    try {
      await writeClaudeUsageCache(
        cachePath,
        createClaudeUsageCache(
          {
            state: 'rate-limits',
            windows: [
              {
                id: 'five-hour',
                usedPercentage: 80,
                resetAt: '2026-08-20T15:00:00.000Z',
              },
            ],
          },
          new Date('2026-08-20T12:00:00.000Z'),
        ),
      );

      await expect(
        new ClaudeUsageCollector(
          cachePath,
          15 * 60 * 1_000,
          () => new Date('2026-08-28T12:00:00.000Z'),
        ).collect(),
      ).resolves.toMatchObject({
        state: 'stale',
        message:
          'Every Claude Code window has reset since this was read. Open Claude Code to refresh it.',
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('keeps a cache older than the refresh interval usable', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'agentmeter-claude-'));
    const cachePath = join(directory, 'usage.json');

    try {
      await writeClaudeUsageCache(
        cachePath,
        createClaudeUsageCache(
          {
            state: 'rate-limits',
            windows: [
              {
                id: 'seven-day',
                usedPercentage: 40,
                resetAt: '2026-08-24T12:00:00.000Z',
              },
            ],
          },
          new Date('2026-08-20T12:00:00.000Z'),
        ),
      );

      // Claude only writes the cache while it renders a status line, so age
      // alone says nothing. Two hours on, the weekly figure still stands.
      await expect(
        new ClaudeUsageCollector(
          cachePath,
          15 * 60 * 1_000,
          () => new Date('2026-08-20T14:00:00.000Z'),
        ).collect(),
      ).resolves.toMatchObject({ state: 'available', message: null });
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
