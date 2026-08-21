import {
  DashboardModel,
  TOOL_DEFINITIONS,
  UsageCardModel,
  UsageQuotaModel,
  UsageRecord,
  ProviderSnapshot,
  ProviderState,
  UsageRepository,
  UsageStatus,
} from '../domain/usage';

const ATTENTION_REMAINING_THRESHOLD = 20;

export class UsageService {
  public constructor(private readonly repository: UsageRepository) {}

  public async getDashboard(): Promise<DashboardModel> {
    const snapshots = await this.repository.getUsage();
    const snapshotsByTool = new Map<string, ProviderSnapshot>();

    for (const snapshot of snapshots) {
      if (snapshotsByTool.has(snapshot.tool)) {
        snapshotsByTool.set(snapshot.tool, {
          tool: snapshot.tool,
          state: 'unavailable',
          records: [],
          message: 'Multiple collectors returned data for this provider.',
        });
        continue;
      }

      snapshotsByTool.set(snapshot.tool, snapshot);
    }

    const cards = TOOL_DEFINITIONS.map((definition) =>
      this.toCardModel(
        definition,
        snapshotsByTool.get(definition.id) ?? {
          tool: definition.id,
          state: 'unavailable',
          records: [],
          message: 'No collector is configured for this provider yet.',
        },
      ),
    );

    return {
      cards,
      generatedAt: new Date().toISOString(),
    };
  }

  private toCardModel(
    definition: (typeof TOOL_DEFINITIONS)[number],
    snapshot: ProviderSnapshot,
  ): UsageCardModel {
    const quotas = snapshot.records.map((record) => this.toQuotaModel(record));
    const providerState = this.getProviderState(snapshot);

    return {
      tool: definition.id,
      name: definition.name,
      description: definition.description,
      quotas,
      updatedAt: this.getLatestUpdatedAt(snapshot.records),
      status: this.getAggregateStatus(quotas),
      providerState,
      message: this.getSnapshotMessage(
        snapshot.message,
        providerState,
        quotas.length,
      ),
      sourceLabel:
        this.isReportingState(providerState) && snapshot.records.length > 0
          ? snapshot.records.every((record) => record.source === 'mock')
            ? 'Mock/development data'
            : snapshot.records.some(
                  (record) => record.source === 'experimental-local',
                )
              ? 'Experimental private adapter'
              : 'Local collector'
          : this.getProviderStateLabel(providerState),
    };
  }

  private toQuotaModel(record: UsageRecord): UsageQuotaModel {
    const metrics = this.getMetrics(record.used, record.limit);

    return {
      id: record.id,
      used: record.used,
      limit: record.limit,
      remaining: metrics.remaining,
      unit: record.unit,
      periodLabel: record.periodLabel,
      resetAt: this.toIsoString(record.resetAt),
      updatedAt: this.toIsoString(record.updatedAt),
      usedPercentage: metrics.usedPercentage,
      remainingPercentage: metrics.remainingPercentage,
      status: metrics.status,
    };
  }

  private getMetrics(
    used: number | null,
    limit: UsageRecord['limit'],
  ): {
    readonly remaining: number | 'unlimited' | null;
    readonly usedPercentage: number | null;
    readonly remainingPercentage: number | null;
    readonly status: UsageStatus;
  } {
    if (used === null || !Number.isFinite(used) || used < 0) {
      return {
        remaining: null,
        usedPercentage: null,
        remainingPercentage: null,
        status: 'unknown',
      };
    }

    if (limit === 'unlimited') {
      return {
        remaining: 'unlimited',
        usedPercentage: null,
        remainingPercentage: null,
        status: 'healthy',
      };
    }

    if (limit === null || !Number.isFinite(limit) || limit <= 0) {
      return {
        remaining: null,
        usedPercentage: null,
        remainingPercentage: null,
        status: 'unknown',
      };
    }

    const usedPercentage = Math.min(
      100,
      Math.max(0, Math.round((used / limit) * 100)),
    );
    const remainingPercentage = 100 - usedPercentage;

    return {
      remaining: Math.max(limit - used, 0),
      usedPercentage,
      remainingPercentage,
      status: this.getStatus(remainingPercentage),
    };
  }

  private getStatus(remainingPercentage: number): UsageStatus {
    if (remainingPercentage <= 0) {
      return 'exhausted';
    }

    if (remainingPercentage <= ATTENTION_REMAINING_THRESHOLD) {
      return 'attention';
    }

    return 'healthy';
  }

  private getProviderState(snapshot: ProviderSnapshot): ProviderState {
    return snapshot.state;
  }

  private getAggregateStatus(
    quotas: readonly UsageQuotaModel[],
  ): UsageStatus {
    if (quotas.some((quota) => quota.status === 'exhausted')) {
      return 'exhausted';
    }

    if (quotas.some((quota) => quota.status === 'attention')) {
      return 'attention';
    }

    if (quotas.length === 0 || quotas.some((quota) => quota.status === 'unknown')) {
      return 'unknown';
    }

    return 'healthy';
  }

  private getLatestUpdatedAt(records: readonly UsageRecord[]): string | null {
    const timestamps = records
      .map((record) => record.updatedAt)
      .filter((date) => Number.isFinite(date.getTime()))
      .sort((left, right) => right.getTime() - left.getTime());

    return this.toIsoString(timestamps[0]);
  }

  private getProviderStateLabel(state: ProviderState): string {
    switch (state) {
      case 'authentication-required':
        return 'Sign-in required';
      case 'mock':
        return 'Mock/development data';
      case 'setup-required':
        return 'Setup required';
      case 'stale':
        return 'Stale data';
      case 'unsupported':
        return 'Unsupported';
      case 'unavailable':
        return 'Unavailable';
      case 'available':
        return 'Connected';
    }
  }

  private getProviderMessage(state: ProviderState): string | null {
    switch (state) {
      case 'authentication-required':
        return 'Connect this provider to read usage.';
      case 'mock':
        return 'Development-only sample data is being shown.';
      case 'setup-required':
        return 'Configure this provider to read usage.';
      case 'stale':
        return 'Showing the last known usage.';
      case 'unsupported':
        return 'Usage collection is not supported yet.';
      case 'unavailable':
        return 'Usage data is not available right now.';
      case 'available':
        return null;
    }
  }

  private getSnapshotMessage(
    message: string | null,
    state: ProviderState,
    quotaCount: number,
  ): string | null {
    if (message) {
      return message;
    }

    if (this.isReportingState(state) && quotaCount === 0) {
      return 'The provider is connected but did not report quota details.';
    }

    return this.getProviderMessage(state);
  }

  private toIsoString(value: Date | null | undefined): string | null {
    if (!value || !Number.isFinite(value.getTime())) {
      return null;
    }

    return value.toISOString();
  }

  private isReportingState(state: ProviderState): boolean {
    return state === 'available' || state === 'mock' || state === 'stale';
  }
}
