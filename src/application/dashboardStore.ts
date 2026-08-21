import { DashboardModel } from '../domain/usage';
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

  public constructor(private readonly usageService: UsageService) {}

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
      .then((dashboard) => {
        this.dashboard = dashboard;
        this.notify({
          type: 'updated',
          dashboard,
        });
        return dashboard;
      })
      .catch((error: unknown) => {
        this.notify({
          type: 'error',
          message: 'Unable to load usage right now. Try refreshing again.',
        });
        throw error;
      })
      .finally(() => {
        this.refreshPromise = undefined;
      });

    return this.refreshPromise;
  }

  private notify(event: DashboardStoreEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
