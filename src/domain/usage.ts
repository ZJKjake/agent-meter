export type AiToolId = 'cursor' | 'claude-code' | 'codex';

export type UsageUnit =
  | 'credits'
  | 'messages'
  | 'percent'
  | 'requests'
  | 'tasks'
  | 'tokens';

export type QuotaLimit = number | 'unlimited' | null;

export type ProviderState =
  | 'available'
  | 'authentication-required'
  | 'mock'
  | 'setup-required'
  | 'stale'
  | 'unavailable'
  | 'unsupported';

export type UsageStatus = 'healthy' | 'attention' | 'exhausted' | 'unknown';

export interface ToolDefinition {
  readonly id: AiToolId;
  readonly name: string;
  readonly description: string;
}

export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  {
    id: 'cursor',
    name: 'Cursor',
    description: 'AI-first code editor',
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    description: 'Agentic coding in your terminal',
  },
  {
    id: 'codex',
    name: 'Codex',
    description: 'OpenAI coding agent',
  },
];

/**
 * A normalized usage record. Collectors for each provider should map their
 * native quota response into this shape before it reaches the UI.
 */
export interface UsageRecord {
  readonly id: string;
  readonly tool: AiToolId;
  readonly used: number | null;
  readonly limit: QuotaLimit;
  readonly unit: UsageUnit;
  readonly periodLabel: string;
  readonly resetAt: Date | null;
  readonly updatedAt: Date;
  readonly source: 'experimental-local' | 'local' | 'mock';
}

export interface ProviderSnapshot {
  readonly tool: AiToolId;
  readonly state: ProviderState;
  readonly records: readonly UsageRecord[];
  readonly message: string | null;
}

export interface UsageCollector {
  readonly tool: AiToolId;
  collect(): Promise<ProviderSnapshot>;
}

export interface UsageRepository {
  getUsage(): Promise<readonly ProviderSnapshot[]>;
}

export interface UsageQuotaModel {
  readonly id: string;
  readonly used: number | null;
  readonly limit: QuotaLimit;
  readonly remaining: number | 'unlimited' | null;
  readonly unit: UsageUnit;
  readonly periodLabel: string;
  readonly resetAt: string | null;
  readonly updatedAt: string | null;
  /** Percentage of the quota that has been consumed. */
  readonly usedPercentage: number | null;
  /** Percentage of the quota still available to the user. */
  readonly remainingPercentage: number | null;
  readonly status: UsageStatus;
}

export interface UsageCardModel {
  readonly tool: AiToolId;
  readonly name: string;
  readonly description: string;
  readonly quotas: readonly UsageQuotaModel[];
  readonly updatedAt: string | null;
  readonly status: UsageStatus;
  readonly providerState: ProviderState;
  readonly message: string | null;
  readonly sourceLabel: string;
}

export interface DashboardModel {
  readonly cards: readonly UsageCardModel[];
  readonly generatedAt: string;
}
