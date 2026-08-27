import { describe, expect, it, vi } from 'vitest';
import {
  IntervalClock,
  RefreshScheduler,
} from '../src/application/refreshScheduler';

describe('RefreshScheduler', () => {
  it('refreshes on schedule and can restart with a new interval', async () => {
    const callbacks = new Map<unknown, () => void>();
    const delays: number[] = [];
    const cleared: unknown[] = [];
    let nextHandle = 0;
    const clock: IntervalClock = {
      setInterval: (callback, delayMs) => {
        const handle = ++nextHandle;
        callbacks.set(handle, callback);
        delays.push(delayMs);
        return handle;
      },
      clearInterval: (handle) => {
        callbacks.delete(handle);
        cleared.push(handle);
      },
    };
    const refresh = vi.fn(async () => undefined);
    const scheduler = new RefreshScheduler(refresh, 300_000, clock);

    callbacks.get(1)?.();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    scheduler.restart(600_000);
    expect(delays).toEqual([300_000, 600_000]);
    expect(cleared).toEqual([1]);

    callbacks.get(2)?.();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));

    scheduler.dispose();
    expect(cleared).toEqual([1, 2]);
  });

  it('swallows refresh failures and stops after disposal', async () => {
    let callback: (() => void) | undefined;
    const clock: IntervalClock = {
      setInterval: (nextCallback) => {
        callback = nextCallback;
        return 1;
      },
      clearInterval: () => undefined,
    };
    const refresh = vi.fn(async () => {
      throw new Error('provider unavailable');
    });
    const scheduler = new RefreshScheduler(refresh, 300_000, clock);

    callback?.();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    scheduler.dispose();
    scheduler.refreshNow();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
