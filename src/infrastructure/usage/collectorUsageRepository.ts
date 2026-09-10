import {
  AiToolId,
  ProviderSnapshot,
  UsageCollector,
  UsageRepository,
} from '../../domain/usage';

/**
 * Repository composition point for provider collectors.
 *
 * A collector failure is isolated so one unavailable provider does not hide
 * usage from the other tools.
 */
export class CollectorUsageRepository implements UsageRepository {
  private readonly pending = new Map<UsageCollector, Promise<ProviderSnapshot>>();

  public constructor(
    private readonly collectors: readonly UsageCollector[],
    // Finish before the outer host transport's 20-second deadline.
    private readonly timeoutMs = 18_000,
  ) {}

  public async getUsage(tools?: readonly AiToolId[]): Promise<readonly ProviderSnapshot[]> {
    const results = await Promise.allSettled(
      this.collectors.map((collector) => tools && !tools.includes(collector.tool)
        ? Promise.resolve<ProviderSnapshot>({
          tool: collector.tool, state: 'unsupported', records: [],
          message: 'Usage is collected in the active workspace.',
        })
        : this.collect(collector)),
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }

      const collector = this.collectors[index];
      return {
        tool: collector.tool,
        state: 'unavailable',
        records: [],
        message: 'Usage is temporarily unavailable. AgentMeter will retry automatically.',
      };
    });
  }

  private async collect(collector: UsageCollector): Promise<ProviderSnapshot> {
    let pending = this.pending.get(collector);
    if (!pending) {
      // Deferring also catches synchronous failures from a collector.
      pending = Promise.resolve().then(() => collector.collect()).finally(() => {
        this.pending.delete(collector);
      });
      this.pending.set(collector, pending);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        pending,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Provider collection timed out.')), this.timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}
