import {
  AiToolId,
  ProviderSnapshot,
  QuotaLimit,
  UsageCollector,
  UsageUnit,
} from '../../domain/usage';

interface MockUsage {
  readonly tool: AiToolId;
  readonly used: number | null;
  readonly limit: QuotaLimit;
  readonly unit: UsageUnit;
  readonly periodLabel: string;
  readonly daysUntilReset: number;
}

export class MockUsageCollector implements UsageCollector {
  public readonly tool: AiToolId;

  public constructor(private readonly usage: MockUsage) {
    this.tool = usage.tool;
  }

  public async collect(): Promise<ProviderSnapshot> {
    const now = new Date();
    const resetAt = new Date(now);
    resetAt.setDate(resetAt.getDate() + this.usage.daysUntilReset);

    return {
      tool: this.usage.tool,
      state: 'mock',
      message: 'Development-only sample data. Never included in release wiring.',
      records: [
        {
          id: 'primary',
          tool: this.usage.tool,
          used: this.usage.used,
          limit: this.usage.limit,
          unit: this.usage.unit,
          periodLabel: this.usage.periodLabel,
          resetAt,
          updatedAt: now,
          source: 'mock',
        },
      ],
    };
  }
}
