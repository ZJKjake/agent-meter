import { describe, expect, it } from 'vitest';
import { UsageService } from '../src/application/usageService';
import { CollectorUsageRepository } from '../src/infrastructure/usage/collectorUsageRepository';
import {
  ProviderSnapshot,
  UsageCollector,
  UsageRecord,
  UsageRepository,
} from '../src/domain/usage';

class InMemoryUsageRepository implements UsageRepository {
  public constructor(private readonly snapshots: readonly ProviderSnapshot[]) {}

  public async getUsage(): Promise<readonly ProviderSnapshot[]> {
    return this.snapshots;
  }
}

class FailingUsageCollector implements UsageCollector {
  public constructor(public readonly tool: 'codex') {}

  public async collect(): Promise<ProviderSnapshot> {
    throw new Error('collector failed');
  }
}

function usageSnapshot(
  values: Partial<UsageRecord> & Pick<UsageRecord, 'tool' | 'used' | 'limit'>,
): ProviderSnapshot {
  const record: UsageRecord = {
    id: 'primary',
    unit: 'credits',
    periodLabel: 'Monthly usage',
    resetAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-19T00:00:00.000Z'),
    source: 'local',
    ...values,
  };

  return {
    tool: record.tool,
    state: 'available',
    records: [record],
    message: null,
  };
}

describe('UsageService', () => {
  it('normalizes usage records into ordered dashboard cards', async () => {
    const service = new UsageService(
      new InMemoryUsageRepository([
        usageSnapshot({ tool: 'codex', used: 25, limit: 50 }),
        usageSnapshot({ tool: 'cursor', used: 25, limit: 100 }),
      ]),
    );

    const dashboard = await service.getDashboard();

    expect(dashboard.cards).toHaveLength(3);
    expect(dashboard.cards[0]).toMatchObject({
      tool: 'cursor',
      quotas: [
        {
          remaining: 75,
          usedPercentage: 25,
          remainingPercentage: 75,
        },
      ],
      status: 'healthy',
      sourceLabel: 'Local collector',
    });
    expect(dashboard.cards[2]).toMatchObject({
      tool: 'codex',
      providerState: 'available',
      quotas: [
        {
          remaining: 25,
          usedPercentage: 50,
          remainingPercentage: 50,
        },
      ],
    });
  });

  it('marks high usage and exhausted quotas clearly', async () => {
    const service = new UsageService(
      new InMemoryUsageRepository([
        usageSnapshot({ tool: 'cursor', used: 80, limit: 100 }),
        usageSnapshot({ tool: 'claude-code', used: 105, limit: 100 }),
      ]),
    );

    const dashboard = await service.getDashboard();

    expect(dashboard.cards[0].status).toBe('attention');
    expect(dashboard.cards[1]).toMatchObject({
      quotas: [
        {
          remaining: 0,
          usedPercentage: 100,
          remainingPercentage: 0,
        },
      ],
      status: 'exhausted',
    });
  });

  it('represents unlimited and unknown quotas without marking them exhausted', async () => {
    const service = new UsageService(
      new InMemoryUsageRepository([
        usageSnapshot({ tool: 'cursor', used: 80, limit: 'unlimited' }),
        usageSnapshot({ tool: 'claude-code', used: null, limit: null }),
        usageSnapshot({ tool: 'codex', used: -1, limit: 100 }),
      ]),
    );

    const dashboard = await service.getDashboard();

    expect(dashboard.cards[0]).toMatchObject({
      quotas: [
        {
          remaining: 'unlimited',
          usedPercentage: null,
          remainingPercentage: null,
        },
      ],
      status: 'healthy',
    });
    expect(dashboard.cards[1]).toMatchObject({
      quotas: [
        {
          remaining: null,
          usedPercentage: null,
          remainingPercentage: null,
        },
      ],
      status: 'unknown',
    });
    expect(dashboard.cards[2].quotas[0].status).toBe('unknown');
  });

  it('shows provider failures and duplicate collectors explicitly', async () => {
    const repository = new CollectorUsageRepository([
      new FailingUsageCollector('codex'),
    ]);
    const service = new UsageService(
      new InMemoryUsageRepository([
        usageSnapshot({ tool: 'cursor', used: 20, limit: 100 }),
        usageSnapshot({ tool: 'cursor', used: 30, limit: 100 }),
      ]),
    );

    const failedDashboard = await new UsageService(repository).getDashboard();
    const duplicateDashboard = await service.getDashboard();

    expect(failedDashboard.cards[2]).toMatchObject({
      providerState: 'unavailable',
      status: 'unknown',
    });
    expect(duplicateDashboard.cards[0]).toMatchObject({
      providerState: 'unavailable',
      message: 'Multiple collectors returned data for this provider.',
    });
  });
});
