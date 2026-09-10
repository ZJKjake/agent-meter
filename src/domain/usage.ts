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
    description: 'Anthropic coding agent',
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
 *
 * A provider may report several independent quota pools, and each pool may
 * report several windows. `scopeLabel` names the pool and `periodLabel` names
 * the window, so two pools that share a window length stay distinguishable.
 */
export interface UsageRecord {
  readonly id: string;
  readonly tool: AiToolId;
  readonly used: number | null;
  readonly limit: QuotaLimit;
  readonly unit: UsageUnit;
  /**
   * The quota pool this window belongs to, such as a model-specific Codex
   * limit or a Cursor model pool. Null when the provider reports one pool.
   */
  readonly scopeLabel: string | null;
  readonly periodLabel: string;
  /**
   * Marks the single record that represents this provider in compact
   * surfaces. Collectors choose it from quota meaning so the presentation
   * layer never has to infer it from array order.
   */
  readonly isHeadline: boolean;
  /**
   * Set when the window this record describes has reset since the value was
   * read, which happens for providers that push usage instead of being
   * polled. The value is kept so the user still sees the last known figure,
   * but it no longer describes the window that is running now.
   */
  readonly isStale: boolean;
  readonly resetAt: Date | null;
  readonly updatedAt: Date;
  readonly source: 'experimental-local' | 'local' | 'mock';
}

export type UsageLocation = 'local' | 'workspace';

export interface ProviderSnapshot {
  readonly location?: UsageLocation;
  readonly locationLabel?: string;
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

/** When each provider was first seen reporting, as epoch milliseconds. */
export type ProviderFirstReportedAt = Readonly<Partial<Record<AiToolId, number>>>;

/**
 * Remembers when a provider first reported, so card order can follow the
 * order the user set their providers up in and stay put across sessions.
 */
export interface ProviderOrderStore {
  read(): ProviderFirstReportedAt;
  write(value: ProviderFirstReportedAt): Promise<void>;
}

export interface UsageQuotaModel {
  readonly id: string;
  readonly used: number | null;
  readonly limit: QuotaLimit;
  readonly remaining: number | 'unlimited' | null;
  readonly unit: UsageUnit;
  readonly scopeLabel: string | null;
  readonly periodLabel: string;
  readonly isHeadline: boolean;
  readonly isStale: boolean;
  readonly resetAt: string | null;
  readonly updatedAt: string | null;
  /** Percentage of the quota that has been consumed. */
  readonly usedPercentage: number | null;
  /** Percentage of the quota still available to the user. */
  readonly remainingPercentage: number | null;
  readonly status: UsageStatus;
}

export interface UsageCardModel {
  readonly location?: UsageLocation;
  readonly locationLabel?: string;
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
