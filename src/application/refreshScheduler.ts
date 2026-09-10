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
  private retrying = false;
  private intervalMs = 0;
  private inFlight = false;

  public constructor(
    private readonly refresh: () => Promise<unknown>,
    intervalMs: number,
    private readonly clock: IntervalClock = systemClock,
  ) {
    this.restart(intervalMs);
  }

  public restart(intervalMs: number): void {
    this.intervalMs = intervalMs;
    this.clearTimer();

    if (this.disposed || !Number.isFinite(intervalMs) || intervalMs <= 0) {
      return;
    }

    this.intervalHandle = this.clock.setInterval(
      () => this.refreshNow(),
      this.retrying ? Math.min(intervalMs, 30_000) : intervalMs,
    );
  }

  public setRetrying(retrying: boolean): void {
    if (this.retrying === retrying) { return; }
    this.retrying = retrying;
    this.restart(this.intervalMs);
  }

  public refreshNow(): void {
    if (this.disposed || this.inFlight) {
      return;
    }

    this.inFlight = true;
    void Promise.resolve().then(() => this.refresh()).catch(() => undefined)
      .finally(() => { this.inFlight = false; });
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
