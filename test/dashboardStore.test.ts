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
  it('preserves a recent reading on disconnect, labels it historical, and replaces it on recovery', async () => {
    const getUsage = vi.fn<UsageRepository['getUsage']>()
      .mockResolvedValueOnce([snapshot()])
      .mockResolvedValueOnce([{ ...snapshot(), state: 'unavailable', records: [] }])
      .mockResolvedValueOnce([{ ...snapshot(), records: [{ ...snapshot().records[0], used: 35 }] }]);
    const store = new DashboardStore(new UsageService({ getUsage }));
    const original = (await store.refresh()).cards.find((card) => card.tool === 'codex')!;
    const offline = (await store.refresh()).cards.find((card) => card.tool === 'codex')!;
    expect(offline).toMatchObject({ isPreviousReading: true, providerState: 'stale', updatedAt: original.updatedAt });
    expect(offline.quotas).toEqual(original.quotas);
    const restored = (await store.refresh()).cards.find((card) => card.tool === 'codex')!;
    expect(restored.isPreviousReading).toBeFalsy();
    expect(restored.quotas[0].remainingPercentage).toBe(65);
  });

  it.each(['authentication-required', 'setup-required', 'unsupported', 'available'] as const)(
    'discards history after an authoritative %s response with no quota', async (state) => {
      const getUsage = vi.fn<UsageRepository['getUsage']>()
        .mockResolvedValueOnce([snapshot()])
        .mockResolvedValueOnce([{ ...snapshot(), state, records: [] }])
        .mockResolvedValueOnce([{ ...snapshot(), state: 'unavailable', records: [] }]);
      const store = new DashboardStore(new UsageService({ getUsage }));
      await store.refresh();
      expect((await store.refresh()).cards.find((card) => card.tool === 'codex')?.quotas).toEqual([]);
      expect((await store.refresh()).cards.find((card) => card.tool === 'codex')?.quotas).toEqual([]);
    },
  );

  it('expires history from the original read rather than extending it on each failure', async () => {
    let now = 0;
    const getUsage = vi.fn<UsageRepository['getUsage']>()
      .mockResolvedValueOnce([snapshot()])
      .mockResolvedValue([{ ...snapshot(), state: 'unavailable', records: [] }]);
    const store = new DashboardStore(new UsageService({ getUsage }), () => now, 100);
    await store.refresh();
    now = 99;
    expect((await store.refresh()).cards.find((card) => card.tool === 'codex')?.isPreviousReading).toBe(true);
    now = 100;
    expect((await store.refresh()).cards.find((card) => card.tool === 'codex')?.quotas).toEqual([]);
  });

  it('never borrows historical readings from a different host', async () => {
    const getUsage = vi.fn<UsageRepository['getUsage']>()
      .mockResolvedValueOnce([{ ...snapshot(), location: 'local', locationLabel: 'This computer' }])
      .mockResolvedValueOnce([{ ...snapshot(), location: 'workspace', locationLabel: 'SSH', state: 'unavailable', records: [] }]);
    const store = new DashboardStore(new UsageService({ getUsage }));
    await store.refresh();
    expect((await store.refresh()).cards.find((card) => card.tool === 'codex')?.quotas).toEqual([]);
  });

  it('keeps error state and historical usage for reopened surfaces, then clears both on recovery', async () => {
    const getUsage = vi.fn<UsageRepository['getUsage']>()
      .mockResolvedValueOnce([snapshot()])
      .mockRejectedValueOnce(new Error('private failure'))
      .mockResolvedValueOnce([snapshot()]);
    const store = new DashboardStore(new UsageService({ getUsage }));
    await store.refresh();
    await expect(store.refresh()).rejects.toThrow('private failure');
    const listener = vi.fn();
    store.subscribe(listener);
    expect(listener).toHaveBeenCalledWith({ type: 'updated', dashboard: store.getSnapshot() });
    expect(store.getSnapshot()?.refreshError).toBeTruthy();
    expect(JSON.stringify(store.getSnapshot())).not.toContain('private failure');
    expect(store.getSnapshot()?.cards.find((card) => card.tool === 'codex')?.isPreviousReading).toBe(true);
    await store.refresh();
    expect(store.getSnapshot()?.refreshError).toBeUndefined();
    expect(store.getSnapshot()?.cards.find((card) => card.tool === 'codex')?.isPreviousReading).toBeFalsy();
  });

  it('clears history before provider configuration', async () => {
    const getUsage = vi.fn<UsageRepository['getUsage']>()
      .mockResolvedValueOnce([snapshot()])
      .mockResolvedValueOnce([{ ...snapshot(), state: 'unavailable', records: [] }]);
    const store = new DashboardStore(new UsageService({ getUsage }));
    await store.refresh();
    store.clearPreviousUsage('codex');
    expect((await store.refresh()).cards.find((card) => card.tool === 'codex')?.quotas).toEqual([]);
  });
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
