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
      tooltip: 'No usage data is available yet.',
      severity: 'unknown',
    };
  }

  const summaries = dashboard.cards.map((card) => {
    const quota = getPrimaryQuota(card);

    if (!quota || !isReportingState(card.providerState)) {
      return `${card.name} —`;
    }

    const hint = formatHeadlineHint(card, quota);
    return `${card.name} ${formatPercentage(quota.remainingPercentage)}${hint}`;
  });

  return {
    text: `$(agentmeter-logo) AgentMeter · ${summaries.join(' · ')}`,
    tooltip: formatTooltip(dashboard),
    severity: getDashboardSeverity(dashboard),
  };
}

/**
 * Collectors mark the record that represents the provider, so the compact
 * value never depends on the order a provider happens to return quotas in.
 */
export function getPrimaryQuota(
  card: UsageCardModel,
): UsageQuotaModel | undefined {
  return card.quotas.find((quota) => quota.isHeadline) ?? card.quotas[0];
}

/**
 * The status bar already carries one percentage per provider, so the tooltip
 * spends its space on the detail behind it: every quota the provider reports,
 * rather than only the one the compact value came from.
 */
function formatTooltip(dashboard: DashboardModel): string {
  const lines: string[] = [];

  for (const card of dashboard.cards) {
    // The status bar item the hover belongs to already reads "AgentMeter",
    // so the tooltip opens on the first provider rather than repeating it.
    if (lines.length > 0) {
      lines.push('');
    }

    lines.push(`**${card.name}**`, ...formatCardDetail(card));
  }

  lines.push('', 'Click to open the AgentMeter dashboard.');
  return joinMarkdownLines(lines);
}

/**
 * The status bar renders its tooltip as Markdown, which folds a lone newline
 * into a space and would run every quota of a provider onto one line. Two
 * trailing spaces make the break a hard one. Blank lines are left untouched,
 * since a line of only whitespace is not reliably read as a paragraph break.
 */
function joinMarkdownLines(lines: readonly string[]): string {
  return lines.map((line) => (line === '' ? line : `${line}  `)).join('\n');
}

function formatCardDetail(card: UsageCardModel): readonly string[] {
  if (!isReportingState(card.providerState) || card.quotas.length === 0) {
    // The state names the situation and the message names the fix, so a
    // message that repeats the state would say the same thing twice.
    const state = getProviderStateLabel(card.providerState);
    return [card.message ? `${state} · ${card.message}` : state];
  }

  // Plain text gives a row no visual grouping to lean on, so each one carries
  // its own countdown even where the sidebar shows a shared one once.
  return card.quotas.map((quota) => formatQuotaDetail(quota, card.quotas));
}

function formatQuotaDetail(
  quota: UsageQuotaModel,
  quotas: readonly UsageQuotaModel[],
): string {
  const parts = [
    formatQuotaName(quota, quotas),
    formatQuotaValue(quota),
    formatReset(quota.resetAt),
  ];

  if (quota.isStale) {
    parts.push('last read before it reset');
  }

  return parts.join(' · ');
}

/**
 * Names a quota by the one label that sets it apart from its siblings: the
 * pool where a provider splits one window across pools, the window otherwise.
 * Both are used only when a pool spans several windows and neither alone
 * would tell two rows apart.
 */
function formatQuotaName(
  quota: UsageQuotaModel,
  quotas: readonly UsageQuotaModel[],
): string {
  if (!quota.scopeLabel) {
    return quota.periodLabel;
  }

  const scopeRepeats =
    quotas.filter((candidate) => candidate.scopeLabel === quota.scopeLabel)
      .length > 1;

  return scopeRepeats
    ? `${quota.scopeLabel} · ${quota.periodLabel}`
    : quota.scopeLabel;
}

function formatQuotaValue(quota: UsageQuotaModel): string {
  if (quota.remaining === 'unlimited') {
    return 'unlimited';
  }

  return quota.remainingPercentage === null
    ? 'remaining unknown'
    : `${formatPercentage(quota.remainingPercentage)} left`;
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

/**
 * Names the quota behind the compact percentage whenever a provider reports
 * more than one, since the value shows whichever is closest to running out
 * and so can change which quota it describes between refreshes. Naming it
 * keeps a number that moved for that reason from reading as usage that
 * suddenly jumped. A provider reporting one quota needs no hint.
 *
 * The hint uses whichever label distinguishes the card's quotas: the pool for
 * providers that split a window across pools, the window for providers that
 * meter one pool over several windows.
 */
function formatHeadlineHint(
  card: UsageCardModel,
  quota: UsageQuotaModel,
): string {
  if (card.quotas.length < 2) {
    return '';
  }

  const hasDistinctScopes = card.quotas.some(
    (candidate) => candidate.scopeLabel !== card.quotas[0]?.scopeLabel,
  );
  const label =
    hasDistinctScopes && quota.scopeLabel
      ? quota.scopeLabel
      : quota.periodLabel;

  return ` (${label.replace(/ (?:pool|window)$/, '')})`;
}

/**
 * Time left in the window, paired with the remaining percentage so the reader
 * can judge whether the remaining quota is comfortable or tight.
 */
function formatReset(value: string | null, now: Date = new Date()): string {
  if (!value) {
    return 'reset unavailable';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'reset unavailable';
  }

  const remainingMinutes = Math.floor(
    (date.getTime() - now.getTime()) / 60_000,
  );
  if (remainingMinutes <= 0) {
    return 'resets now';
  }
  if (remainingMinutes < 60) {
    return `resets in ${remainingMinutes}m`;
  }
  if (remainingMinutes < 1_440) {
    return `resets in ${Math.floor(remainingMinutes / 60)}h`;
  }

  return `resets in ${Math.floor(remainingMinutes / 1_440)}d`;
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
