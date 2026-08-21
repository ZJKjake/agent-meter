import { MockUsageCollector } from '../collectors/mockUsageCollector';
import { AiToolId, UsageCollector } from '../../domain/usage';
import { CollectorUsageRepository } from './collectorUsageRepository';

/**
 * Development/test-only data source. Production wiring must never import it.
 */
export class MockUsageRepository extends CollectorUsageRepository {
  public constructor() {
    super(createMockCollectors());
  }
}

export function createMockCollectors(
  tools: readonly AiToolId[] = ['cursor', 'claude-code', 'codex'],
): readonly UsageCollector[] {
  const usageByTool = {
    cursor: {
      tool: 'cursor' as const,
      used: 19,
      limit: 100,
      unit: 'credits' as const,
      periodLabel: 'Monthly usage',
      daysUntilReset: 12,
    },
    'claude-code': {
      tool: 'claude-code' as const,
      used: 68,
      limit: 100,
      unit: 'messages' as const,
      periodLabel: 'Monthly usage',
      daysUntilReset: 12,
    },
    codex: {
      tool: 'codex' as const,
      used: 23,
      limit: 50,
      unit: 'tasks' as const,
      periodLabel: 'Weekly usage',
      daysUntilReset: 5,
    },
  };

  return tools.flatMap((tool) => {
    const usage = usageByTool[tool];
    return usage ? [new MockUsageCollector(usage)] : [];
  });
}
