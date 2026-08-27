export interface IntervalClock {
  setInterval(callback: () => void, delayMs: number): unknown;
  clearInterval(handle: unknown): void;
}

const systemClock: IntervalClock = {
  setInterval: (callback, delayMs) => setInterval(callback, delayMs),
  clearInterval: (handle) =>
    clearInterval(handle as ReturnType<typeof setInterval>),
};

/** Keeps provider data current while ensuring refresh failures stay recoverable. */
export class RefreshScheduler {
  private intervalHandle: unknown;
  private disposed = false;

  public constructor(
    private readonly refresh: () => Promise<unknown>,
    intervalMs: number,
    private readonly clock: IntervalClock = systemClock,
  ) {
    this.restart(intervalMs);
  }

  public restart(intervalMs: number): void {
    this.clearTimer();

    if (this.disposed || !Number.isFinite(intervalMs) || intervalMs <= 0) {
      return;
    }

    this.intervalHandle = this.clock.setInterval(
      () => this.refreshNow(),
      intervalMs,
    );
  }

  public refreshNow(): void {
    if (this.disposed) {
      return;
    }

    void this.refresh().catch(() => undefined);
  }

  public dispose(): void {
    this.disposed = true;
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.intervalHandle !== undefined) {
      this.clock.clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
    }
  }
}
