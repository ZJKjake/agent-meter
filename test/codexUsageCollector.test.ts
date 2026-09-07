import { describe, expect, it } from 'vitest';
import { UsageRecord } from '../src/domain/usage';
import {
  CodexUsageCollector,
  parseRateLimitRecords,
} from '../src/infrastructure/collectors/codexUsageCollector';
import { createCodexRateLimitsResponse } from './fixtures/codexRateLimits';

/** `updatedAt` is wall-clock time, so it is excluded from order comparisons. */
function toComparable(records: readonly UsageRecord[]) {
  return records.map(({ updatedAt: _updatedAt, ...record }) => ({
    ...record,
    resetAt: record.resetAt?.toISOString() ?? null,
  }));
}

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
      scopeLabel: null,
      periodLabel: '5-hour window',
      isStale: false,
    });
    expect(records[1]).toMatchObject({
      id: 'codex:secondary',
      used: 80,
      periodLabel: '1-week window',
    });
  });

  it('headlines the window closest to running out', () => {
    const build = (primaryUsed: number, secondaryUsed: number) =>
      parseRateLimitRecords({
        rateLimits: {
          primary: {
            usedPercent: primaryUsed,
            windowDurationMins: 300,
            resetsAt: 1_800_000_000,
          },
          secondary: {
            usedPercent: secondaryUsed,
            windowDurationMins: 10_080,
            resetsAt: 1_800_600_000,
          },
        },
      });

    // The weekly window binds first here, so a 5-hour window that just reset
    // must not present the provider as healthier than it is.
    expect(build(25, 80).find((record) => record.isHeadline)).toMatchObject({
      id: 'codex:secondary',
    });
    expect(build(90, 12).find((record) => record.isHeadline)).toMatchObject({
      id: 'codex:primary',
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
      isHeadline: true,
    });
  });

  it('reports only the general limit while model limits are untouched', () => {
    const records = parseRateLimitRecords(createCodexRateLimitsResponse());

    expect(records.map((record) => record.id)).toEqual(['codex:primary']);
    expect(records[0]).toMatchObject({
      scopeLabel: null,
      periodLabel: '1-week window',
      isHeadline: true,
    });
  });

  it('never reports a model limit, even once it is exhausted', () => {
    const response = createCodexRateLimitsResponse();
    const byLimitId = response.rateLimitsByLimitId as Record<string, any>;
    byLimitId.codex_bengalfox = {
      ...byLimitId.codex_bengalfox,
      primary: { ...byLimitId.codex_bengalfox.primary, usedPercent: 100 },
      secondary: { ...byLimitId.codex_bengalfox.secondary, usedPercent: 100 },
    };

    // A model limit is a sub-limit of the general allowance, so it never
    // becomes a bar of its own however depleted it is.
    expect(parseRateLimitRecords(response).map((record) => record.id)).toEqual([
      'codex:primary',
    ]);
  });

  it('reports the general limit as the headline when a model limit is first', () => {
    const records = parseRateLimitRecords(
      createCodexRateLimitsResponse('model-first'),
    );
    const headline = records.filter((record) => record.isHeadline);

    expect(headline).toHaveLength(1);
    expect(headline[0]).toMatchObject({ id: 'codex:primary', used: 7 });
  });

  it('produces identical records when buckets arrive in reverse order', () => {
    expect(
      toComparable(
        parseRateLimitRecords(createCodexRateLimitsResponse('model-first')),
      ),
    ).toEqual(
      toComparable(
        parseRateLimitRecords(createCodexRateLimitsResponse('general-first')),
      ),
    );
  });

  it('falls back to one deterministic pool when no general limit is reported', () => {
    const buildResponse = (reversed: boolean) => {
      const zebra = {
        limitId: 'zebra',
        limitName: 'Zebra',
        primary: { usedPercent: 30, windowDurationMins: 300, resetsAt: 1 },
      };
      const alpha = {
        limitId: 'alpha',
        limitName: 'Alpha',
        primary: { usedPercent: 60, windowDurationMins: 300, resetsAt: 1 },
      };

      return {
        rateLimitsByLimitId: reversed
          ? { zebra, alpha }
          : { alpha, zebra },
      };
    };

    // Codex always sends a general limit in practice. If it ever stops, one
    // pool stands in rather than every pool arriving at once, and which one
    // cannot depend on the order the response happened to use.
    for (const reversed of [false, true]) {
      const records = parseRateLimitRecords(buildResponse(reversed));

      expect(records.map((record) => record.id)).toEqual(['alpha:primary']);
      expect(records[0].isHeadline).toBe(true);
    }
  });

  it('names the stand-in pool by its id when Codex omits a limit name', () => {
    const records = parseRateLimitRecords({
      rateLimitsByLimitId: {
        codex_unnamed: {
          primary: { usedPercent: 95, windowDurationMins: 10_080, resetsAt: 1 },
        },
      },
    });

    expect(records.map((record) => record.scopeLabel)).toEqual([
      'codex_unnamed',
    ]);
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
