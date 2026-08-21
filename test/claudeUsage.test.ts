import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createClaudeUsageCache,
  parseClaudeStatuslineInput,
  readClaudeUsageCache,
  writeClaudeUsageCache,
} from '../src/infrastructure/claude/claudeUsage';
import { runClaudeStatuslineBridge } from '../src/infrastructure/claude/claudeStatuslineBridge';

describe('Claude statusline usage', () => {
  it('parses valid five-hour and seven-day rate limits', () => {
    const result = parseClaudeStatuslineInput({
      cwd: '/private/project',
      session_id: 'secret-session-id',
      rate_limits: {
        five_hour: {
          used_percentage: 23.5,
          resets_at: 1_738_425_600,
        },
        seven_day: {
          used_percentage: 41.2,
          resets_at: 1_738_857_600,
        },
      },
    });

    expect(result).toEqual({
      state: 'rate-limits',
      windows: [
        {
          id: 'five-hour',
          usedPercentage: 23.5,
          resetAt: '2025-02-01T16:00:00.000Z',
        },
        {
          id: 'seven-day',
          usedPercentage: 41.2,
          resetAt: '2025-02-06T16:00:00.000Z',
        },
      ],
    });
  });

  it('ignores malformed or out-of-range windows without inventing data', () => {
    const result = parseClaudeStatuslineInput({
      rate_limits: {
        five_hour: { used_percentage: 101, resets_at: 'tomorrow' },
        seven_day: { used_percentage: 50 },
      },
    });

    expect(result).toEqual({
      state: 'rate-limits',
      windows: [
        {
          id: 'seven-day',
          usedPercentage: 50,
          resetAt: null,
        },
      ],
    });
  });

  it('represents absent rate limits explicitly', () => {
    expect(parseClaudeStatuslineInput({ model: { display_name: 'Opus' } })).toEqual({
      state: 'no-rate-limits',
      windows: [],
    });
  });

  it('writes only sanitized quota data to the local cache', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'agentmeter-claude-'));
    const cachePath = join(directory, 'claude-code-usage.json');
    const now = new Date('2026-08-20T12:00:00.000Z');

    try {
      const output = await runClaudeStatuslineBridge(
        JSON.stringify({
          cwd: '/private/project',
          transcript_path: '/private/project/secret.jsonl',
          session_id: 'secret-session-id',
          rate_limits: {
            five_hour: { used_percentage: 23.5, resets_at: 1_738_425_600 },
          },
        }),
        cachePath,
        now,
      );

      const contents = await readFile(cachePath, 'utf8');
      const parsed = JSON.parse(contents) as Record<string, unknown>;

      expect(output).toBe('AgentMeter Claude | 5h: 76% left');
      expect(parsed).toMatchObject({
        version: 1,
        provider: 'claude-code',
        state: 'rate-limits',
        updatedAt: now.toISOString(),
      });
      expect(contents).not.toContain('secret-session-id');
      expect(contents).not.toContain('transcript_path');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects missing and malformed cache files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'agentmeter-claude-'));
    const missingPath = join(directory, 'missing.json');
    const invalidPath = join(directory, 'invalid.json');

    try {
      expect(await readClaudeUsageCache(missingPath)).toEqual({ kind: 'missing' });
      await writeFile(invalidPath, '{"version": 1, "windows": [}', 'utf8');
      expect(await readClaudeUsageCache(invalidPath)).toEqual({ kind: 'invalid' });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
