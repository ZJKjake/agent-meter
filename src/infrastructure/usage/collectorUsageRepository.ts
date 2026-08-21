import {
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
  public constructor(private readonly collectors: readonly UsageCollector[]) {}

  public async getUsage(): Promise<readonly ProviderSnapshot[]> {
    const results = await Promise.allSettled(
      this.collectors.map((collector) => collector.collect()),
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
        message: 'The usage collector failed to return data.',
      };
    });
  }
}
