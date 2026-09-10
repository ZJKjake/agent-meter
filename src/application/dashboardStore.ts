import { AiToolId, DashboardModel, UsageCardModel } from '../domain/usage';
import { UsageService } from './usageService';

export type DashboardStoreEvent =
  | {
      readonly type: 'updated';
      readonly dashboard: DashboardModel;
    }
  | {
      readonly type: 'error';
      readonly message: string;
    };

export type DashboardStoreListener = (event: DashboardStoreEvent) => void;

export interface StoreSubscription {
  dispose(): void;
}

/**
 * Coordinates dashboard refreshes for every presentation surface.
 *
 * A single in-flight refresh is shared by callers so the sidebar, status bar,
 * and commands never trigger duplicate provider collection.
 */
export class DashboardStore {
  private readonly listeners = new Set<DashboardStoreListener>();
  private dashboard: DashboardModel | undefined;
  private refreshPromise: Promise<DashboardModel> | undefined;
  private readonly previousReadings = new Map<AiToolId, { card: UsageCardModel; readAt: number }>();

  public constructor(
    private readonly usageService: UsageService,
    private readonly now: () => number = () => Date.now(),
    private readonly historyLifetimeMs = 30 * 60_000,
  ) {}

  public clearPreviousUsage(tool: AiToolId): void {
    this.previousReadings.delete(tool);
  }

  public getSnapshot(): DashboardModel | undefined {
    return this.dashboard;
  }

  public subscribe(listener: DashboardStoreListener): StoreSubscription {
    this.listeners.add(listener);

    if (this.dashboard) {
      listener({
        type: 'updated',
        dashboard: this.dashboard,
      });
    }

    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  }

  public refresh(): Promise<DashboardModel> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.usageService
      .getDashboard()
      .then((next) => {
        const dashboard = { ...next, cards: next.cards.map((card) => this.retainPreviousReading(card)) };
        this.dashboard = dashboard;
        this.notify({
          type: 'updated',
          dashboard,
        });
        return dashboard;
      })
      .catch((error: unknown) => {
        const message = 'Unable to load usage right now. Try refreshing again.';
        if (this.dashboard) {
          this.dashboard = {
            ...this.dashboard,
            refreshError: message,
            cards: this.dashboard.cards.map((card) => card.quotas.length
              ? this.retainPreviousReading({
                ...card, providerState: 'unavailable', quotas: [], updatedAt: null,
                isPreviousReading: false, status: 'unknown', message,
              })
              : card),
          };
          this.notify({ type: 'updated', dashboard: this.dashboard });
        } else {
          this.notify({ type: 'error', message });
        }
        throw error;
      })
      .finally(() => {
        this.refreshPromise = undefined;
      });

    return this.refreshPromise;
  }

  private retainPreviousReading(card: UsageCardModel): UsageCardModel {
    if (card.providerState !== 'unavailable') {
      // An authoritative sign-out, setup change, or empty response invalidates
      // history. Never persist readings or borrow them from another host.
      if ((card.providerState === 'available' || card.providerState === 'stale') && card.quotas.length) {
        this.previousReadings.set(card.tool, { card, readAt: this.now() });
      } else {
        this.previousReadings.delete(card.tool);
      }
      return card;
    }
    const previous = this.previousReadings.get(card.tool);
    if (!previous) { return card; }
    if (previous.card.location !== card.location || previous.card.locationLabel !== card.locationLabel ||
        this.now() - previous.readAt >= this.historyLifetimeMs) {
      this.previousReadings.delete(card.tool);
      return card;
    }
    return {
      ...previous.card,
      isPreviousReading: true,
      providerState: 'stale',
      status: 'attention',
      message: 'Last known usage from the previous connection. AgentMeter is reconnecting; current account usage is not yet confirmed.',
    };
  }

  private notify(event: DashboardStoreEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
