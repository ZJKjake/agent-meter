import { describe, expect, it, vi } from 'vitest';
import { DashboardStore } from '../src/application/dashboardStore';
import { UsageService } from '../src/application/usageService';
import {
  ProviderSnapshot,
  UsageRepository,
} from '../src/domain/usage';

function snapshot(): ProviderSnapshot {
  return {
    tool: 'codex',
    state: 'available',
    message: null,
    records: [
      {
        id: 'primary',
        tool: 'codex',
        used: 20,
        limit: 100,
        unit: 'percent',
        periodLabel: 'Primary window',
        resetAt: null,
        updatedAt: new Date('2026-08-20T11:00:00.000Z'),
        source: 'local',
      },
    ],
  };
}

describe('DashboardStore', () => {
  it('shares an in-flight refresh and publishes one snapshot', async () => {
    let resolveUsage:
      | ((snapshots: readonly ProviderSnapshot[]) => void)
      | undefined;
    const getUsage = vi.fn(
      () =>
        new Promise<readonly ProviderSnapshot[]>((resolve) => {
          resolveUsage = resolve;
        }),
    );
    const repository: UsageRepository = { getUsage };
    const store = new DashboardStore(new UsageService(repository));
    const events: string[] = [];

    store.subscribe((event) => {
      events.push(event.type);
    });

    const firstRefresh = store.refresh();
    const secondRefresh = store.refresh();

    expect(secondRefresh).toBe(firstRefresh);
    expect(getUsage).toHaveBeenCalledTimes(1);

    resolveUsage?.([snapshot()]);
    await firstRefresh;

    expect(events).toEqual(['updated']);
    expect(store.getSnapshot()?.cards).toHaveLength(3);
  });

  it('publishes a sanitized error event and allows retrying', async () => {
    const getUsage = vi
      .fn<UsageRepository['getUsage']>()
      .mockRejectedValueOnce(new Error('/secret/path/token=abc'))
      .mockResolvedValueOnce([snapshot()]);
    const store = new DashboardStore(
      new UsageService({ getUsage }),
    );
    const messages: string[] = [];

    store.subscribe((event) => {
      if (event.type === 'error') {
        messages.push(event.message);
      }
    });

    await expect(store.refresh()).rejects.toThrow('/secret/path/token=abc');
    await store.refresh();

    expect(messages).toEqual([
      'Unable to load usage right now. Try refreshing again.',
    ]);
    expect(getUsage).toHaveBeenCalledTimes(2);
  });
});
