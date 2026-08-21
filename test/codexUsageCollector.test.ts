import { describe, expect, it } from 'vitest';
import {
  CodexUsageCollector,
  parseRateLimitRecords,
} from '../src/infrastructure/collectors/codexUsageCollector';

describe('parseRateLimitRecords', () => {
  it('normalizes primary and secondary rate-limit windows', () => {
    const records = parseRateLimitRecords({
      rateLimits: {
        primary: {
          usedPercent: 25,
          windowDurationMins: 300,
          resetsAt: 1_800_000_000,
        },
        secondary: {
          usedPercent: 80,
          windowDurationMins: 10_080,
          resetsAt: 1_800_600_000,
        },
      },
    });

    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      id: 'codex:primary',
      used: 25,
      limit: 100,
      unit: 'percent',
      periodLabel: '5-hour window',
    });
    expect(records[1]).toMatchObject({
      id: 'codex:secondary',
      used: 80,
      periodLabel: '1-week window',
    });
  });

  it('supports the multi-bucket response and ignores malformed windows', () => {
    const records = parseRateLimitRecords({
      rateLimitsByLimitId: {
        codex: {
          primary: {
            usedPercent: 10,
            windowDurationMins: 60,
            resetsAt: 1_800_000_000,
          },
        },
        malformed: {
          primary: {
            usedPercent: 'unknown',
          },
        },
      },
    });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      id: 'codex:primary',
      periodLabel: '1-hour window',
    });
  });

  it('reports a missing Codex CLI as unsupported', async () => {
    const snapshot = await new CodexUsageCollector(
      '/agent-meter/missing-codex-cli',
    ).collect();

    expect(snapshot).toMatchObject({
      tool: 'codex',
      state: 'unsupported',
      records: [],
    });
  });
});
