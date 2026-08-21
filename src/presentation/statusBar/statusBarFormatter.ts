import {
  DashboardModel,
  UsageCardModel,
  UsageQuotaModel,
} from '../../domain/usage';

export type StatusBarSeverity =
  | 'healthy'
  | 'attention'
  | 'exhausted'
  | 'unknown';

export interface StatusBarViewModel {
  readonly text: string;
  readonly tooltip: string;
  readonly severity: StatusBarSeverity;
}

export function formatStatusBar(dashboard: DashboardModel): StatusBarViewModel {
  if (dashboard.cards.length === 0) {
    return {
      text: '$(agentmeter-logo) AgentMeter',
      tooltip: 'AgentMeter\n\nNo usage data is available yet.',
      severity: 'unknown',
    };
  }

  const summaries = dashboard.cards.map((card) => {
    const quota = getPrimaryQuota(card);

    if (!quota || !isReportingState(card.providerState)) {
      return `${card.name} —`;
    }

    return `${card.name} ${formatPercentage(quota.remainingPercentage)}`;
  });

  return {
    text: `$(agentmeter-logo) AgentMeter · ${summaries.join(' · ')}`,
    tooltip: formatTooltip(dashboard),
    severity: getDashboardSeverity(dashboard),
  };
}

export function getPrimaryQuota(
  card: UsageCardModel,
): UsageQuotaModel | undefined {
  return (
    card.quotas.find((quota) => quota.id.endsWith(':primary')) ??
    card.quotas.find((quota) => quota.id === 'primary') ??
    card.quotas[0]
  );
}

function formatTooltip(dashboard: DashboardModel): string {
  const lines = ['AgentMeter usage', ''];

  for (const card of dashboard.cards) {
    const quota = getPrimaryQuota(card);
    lines.push(`${card.name}: ${formatCardSummary(card, quota)}`);

    if (quota) {
      lines.push(`  ${quota.periodLabel} · ${formatReset(quota.resetAt)}`);
    } else if (card.message) {
      lines.push(`  ${card.message}`);
    }

    lines.push(`  Source: ${card.sourceLabel}`);
  }

  lines.push('', 'Click to open the AgentMeter dashboard.');
  return lines.join('\n');
}

function formatCardSummary(
  card: UsageCardModel,
  quota: UsageQuotaModel | undefined,
): string {
  if (!isReportingState(card.providerState)) {
    return getProviderStateLabel(card.providerState);
  }

  if (!quota || quota.remainingPercentage === null) {
    return quota?.remaining === 'unlimited'
      ? 'Unlimited quota'
      : 'Quota unknown';
  }

  const freshness = card.providerState === 'stale' ? ' (stale)' : '';
  const development = card.providerState === 'mock' ? ' (mock)' : '';
  return `${formatPercentage(quota.remainingPercentage)} remaining${freshness}${development}`;
}

function getDashboardSeverity(
  dashboard: DashboardModel,
): StatusBarSeverity {
  const statuses = dashboard.cards.map((card) => {
    if (card.providerState === 'stale') {
      return 'attention' as const;
    }

    if (!isReportingState(card.providerState)) {
      return 'unknown' as const;
    }

    return card.status;
  });

  if (statuses.includes('exhausted')) {
    return 'exhausted';
  }

  if (statuses.includes('attention')) {
    return 'attention';
  }

  if (statuses.includes('unknown')) {
    return 'unknown';
  }

  return 'healthy';
}

function formatPercentage(percentage: number | null): string {
  return percentage === null ? '—' : `${percentage}%`;
}

function formatReset(value: string | null): string {
  if (!value) {
    return 'reset unavailable';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'reset unavailable';
  }

  return `resets ${date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

function getProviderStateLabel(
  state: UsageCardModel['providerState'],
): string {
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

function isReportingState(
  state: UsageCardModel['providerState'],
): boolean {
  return state === 'available' || state === 'mock' || state === 'stale';
}
