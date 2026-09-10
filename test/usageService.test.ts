import { describe, expect, it } from 'vitest';
import { UsageService } from '../src/application/usageService';
import { CollectorUsageRepository } from '../src/infrastructure/usage/collectorUsageRepository';
import {
  ProviderFirstReportedAt,
  ProviderOrderStore,
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
      sourceLabel: 'This computer',
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

  describe('card order', () => {
    class InMemoryOrderStore implements ProviderOrderStore {
      public constructor(private value: ProviderFirstReportedAt = {}) {}

      public read(): ProviderFirstReportedAt {
        return this.value;
      }

      public async write(next: ProviderFirstReportedAt): Promise<void> {
        this.value = next;
      }
    }

    async function toolOrder(
      snapshots: readonly ProviderSnapshot[],
      store = new InMemoryOrderStore(),
      now = 10_000,
    ): Promise<readonly string[]> {
      const dashboard = await new UsageService(
        new InMemoryUsageRepository(snapshots),
        store,
        () => now,
      ).getDashboard();

      return dashboard.cards.map((card) => card.tool);
    }

    it('falls back to Claude then Codex before any provider reports', async () => {
      await expect(toolOrder([])).resolves.toEqual([
        'cursor',
        'claude-code',
        'codex',
      ]);
    });

    it('lifts a reporting provider above one that has never reported', async () => {
      const order = await toolOrder([
        usageSnapshot({ tool: 'codex', used: 25, limit: 100 }),
      ]);

      expect(order).toEqual(['cursor', 'codex', 'claude-code']);
    });

    it('keeps the provider that reported first ahead of a later one', async () => {
      const order = await toolOrder(
        [
          usageSnapshot({ tool: 'claude-code', used: 25, limit: 100 }),
          usageSnapshot({ tool: 'codex', used: 25, limit: 100 }),
        ],
        new InMemoryOrderStore({ codex: 1_000 }),
      );

      expect(order).toEqual(['cursor', 'codex', 'claude-code']);
    });

    it('breaks a tie by declared order when both first report together', async () => {
      const order = await toolOrder([
        usageSnapshot({ tool: 'codex', used: 25, limit: 100 }),
        usageSnapshot({ tool: 'claude-code', used: 25, limit: 100 }),
      ]);

      expect(order).toEqual(['cursor', 'claude-code', 'codex']);
    });

    it('holds a card in place while its provider is not reporting', async () => {
      // Cards sit where the user's setup order put them. Reordering on the
      // current state would shuffle the panel whenever a provider briefly
      // failed, which reads as a fault rather than as information.
      const order = await toolOrder(
        [usageSnapshot({ tool: 'codex', used: 25, limit: 100 })],
        new InMemoryOrderStore({ 'claude-code': 1_000, codex: 2_000 }),
      );

      expect(order).toEqual(['cursor', 'claude-code', 'codex']);
    });

    it('records a provider once, so a later report cannot move it', async () => {
      const store = new InMemoryOrderStore();
      const claudeFirst = [
        usageSnapshot({ tool: 'claude-code', used: 25, limit: 100 }),
      ];
      const both = [
        ...claudeFirst,
        usageSnapshot({ tool: 'codex', used: 25, limit: 100 }),
      ];

      await toolOrder(claudeFirst, store, 1_000);
      const order = await toolOrder(both, store, 5_000);

      expect(store.read()).toEqual({ 'claude-code': 1_000, codex: 5_000 });
      expect(order).toEqual(['cursor', 'claude-code', 'codex']);
    });

    it('orders by declared list when no store is wired in', async () => {
      const dashboard = await new UsageService(
        new InMemoryUsageRepository([
          usageSnapshot({ tool: 'codex', used: 25, limit: 100 }),
        ]),
      ).getDashboard();

      expect(dashboard.cards.map((card) => card.tool)).toEqual([
        'cursor',
        'claude-code',
        'codex',
      ]);
    });
  });
});
