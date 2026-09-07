import { describe, expect, it } from 'vitest';
import {
  DashboardModel,
  UsageCardModel,
  UsageQuotaModel,
} from '../src/domain/usage';
import {
  formatStatusBar,
  getPrimaryQuota,
} from '../src/presentation/statusBar/statusBarFormatter';

/**
 * The tooltip is Markdown, where a hard line break is two trailing spaces.
 * Dropping them lets an assertion read the way the rendered hover does,
 * instead of hiding the difference in invisible whitespace.
 */
function rendered(tooltip: string): string {
  return tooltip.replace(/ {2}\n/g, '\n');
}

function quota(
  overrides: Partial<UsageQuotaModel> = {},
): UsageQuotaModel {
  return {
    id: 'primary',
    used: 40,
    limit: 100,
    remaining: 60,
    unit: 'percent',
    scopeLabel: null,
    periodLabel: 'Primary window',
    isHeadline: true,
    isStale: false,
    resetAt: '2026-08-20T12:00:00.000Z',
    updatedAt: '2026-08-20T11:00:00.000Z',
    usedPercentage: 40,
    remainingPercentage: 60,
    status: 'healthy',
    ...overrides,
  };
}

function card(
  tool: UsageCardModel['tool'],
  overrides: Partial<UsageCardModel> = {},
): UsageCardModel {
  return {
    tool,
    name: tool === 'claude-code' ? 'Claude Code' : tool[0].toUpperCase() + tool.slice(1),
    description: 'Test provider',
    quotas: [quota()],
    updatedAt: '2026-08-20T11:00:00.000Z',
    status: 'healthy',
    providerState: 'available',
    message: null,
    sourceLabel: 'Local collector',
    ...overrides,
  };
}

function dashboard(cards: readonly UsageCardModel[]): DashboardModel {
  return {
    cards,
    generatedAt: '2026-08-20T11:00:00.000Z',
  };
}

describe('status bar formatter', () => {
  it('formats one compact percentage per provider', () => {
    const view = formatStatusBar(
      dashboard([
        card('cursor', {
          quotas: [
            quota({
              used: 19,
              remaining: 81,
              usedPercentage: 19,
              remainingPercentage: 81,
            }),
          ],
        }),
        card('claude-code', {
          quotas: [
            quota({
              used: 68,
              remaining: 32,
              usedPercentage: 68,
              remainingPercentage: 32,
            }),
          ],
        }),
        card('codex', {
          quotas: [
            quota({ usedPercentage: null, remainingPercentage: null }),
          ],
        }),
      ]),
    );

    expect(view.text).toBe(
      '$(agentmeter-logo) AgentMeter · Cursor 81% · Claude Code 32% · Codex —',
    );
    expect(rendered(view.tooltip)).toContain(
      '**Cursor**\nPrimary window · 81% left',
    );
    expect(rendered(view.tooltip)).toContain(
      '**Claude Code**\nPrimary window · 32% left',
    );
    // The status bar item the hover belongs to already reads "AgentMeter".
    expect(rendered(view.tooltip).startsWith('**Cursor**')).toBe(true);
    expect(view.severity).toBe('healthy');
  });

  it('selects the headline quota regardless of quota order', () => {
    const cardWithWindows = card('codex', {
      quotas: [
        quota({
          id: 'gpt-5.3-codex-spark:primary',
          isHeadline: false,
          remainingPercentage: 10,
        }),
        quota({
          id: 'codex:primary',
          isHeadline: true,
          remainingPercentage: 80,
        }),
      ],
    });

    expect(getPrimaryQuota(cardWithWindows)?.remainingPercentage).toBe(80);
  });

  it('names the window behind the number when it is not the leading one', () => {
    const view = formatStatusBar(
      dashboard([
        card('codex', {
          quotas: [
            quota({
              id: 'codex:primary',
              periodLabel: '5-hour window',
              isHeadline: false,
              remainingPercentage: 96,
            }),
            quota({
              id: 'codex:secondary',
              periodLabel: '1-week window',
              isHeadline: true,
              remainingPercentage: 4,
            }),
          ],
        }),
      ]),
    );

    // Without the hint the number would appear to jump for no reason once the
    // weekly window overtakes the 5-hour one.
    expect(view.text).toBe('$(agentmeter-logo) AgentMeter · Codex 4% (1-week)');
  });

  it('names the pool instead of the window when pools are what differ', () => {
    const view = formatStatusBar(
      dashboard([
        card('cursor', {
          quotas: [
            quota({
              id: 'cursor:primary',
              scopeLabel: 'Other Models pool',
              periodLabel: 'Billing cycle',
              isHeadline: false,
              remainingPercentage: 88,
            }),
            quota({
              id: 'cursor:cursor-models',
              scopeLabel: 'Cursor Models pool',
              periodLabel: 'Billing cycle',
              isHeadline: true,
              remainingPercentage: 12,
            }),
          ],
        }),
      ]),
    );

    expect(view.text).toBe(
      '$(agentmeter-logo) AgentMeter · Cursor 12% (Cursor Models)',
    );
  });

  it('names the quota even when the leading one is the headline', () => {
    const view = formatStatusBar(
      dashboard([
        card('codex', {
          quotas: [
            quota({ periodLabel: '5-hour window', remainingPercentage: 20 }),
            quota({
              periodLabel: '1-week window',
              isHeadline: false,
              remainingPercentage: 70,
            }),
          ],
        }),
      ]),
    );

    // Which quota leads can change between refreshes, so the number says
    // which one it describes whenever there is more than one to choose from.
    expect(view.text).toBe('$(agentmeter-logo) AgentMeter · Codex 20% (5-hour)');
  });

  it('leaves the number unqualified when a provider reports one quota', () => {
    const view = formatStatusBar(
      dashboard([
        card('codex', {
          quotas: [
            quota({ periodLabel: '1-week window', remainingPercentage: 47 }),
          ],
        }),
      ]),
    );

    expect(view.text).toBe('$(agentmeter-logo) AgentMeter · Codex 47%');
  });

  it('flags a headline read before its window reset', () => {
    const view = formatStatusBar(
      dashboard([
        card('claude-code', {
          quotas: [quota({ isStale: true, periodLabel: '5-hour window' })],
        }),
      ]),
    );

    expect(view.tooltip).toContain('last read before it reset');
  });

  it('names a quota by the label that sets it apart from its siblings', () => {
    const view = formatStatusBar(
      dashboard([
        card('cursor', {
          quotas: [
            quota({
              scopeLabel: 'Other Models pool',
              periodLabel: 'Billing cycle',
              remainingPercentage: 70,
            }),
            quota({
              scopeLabel: 'Cursor Models pool',
              periodLabel: 'Billing cycle',
              isHeadline: false,
              remainingPercentage: 99,
            }),
          ],
        }),
      ]),
    );

    // Both pools share a window, so the pool alone tells the rows apart and
    // repeating "Billing cycle" on each would only add width.
    expect(view.tooltip).toContain('Other Models pool · 70% left');
    expect(view.tooltip).not.toContain('Billing cycle');
  });

  it('ends every quota row with a Markdown hard break', () => {
    const view = formatStatusBar(
      dashboard([
        card('cursor', {
          quotas: [
            quota({ scopeLabel: 'Other Models pool', remainingPercentage: 70 }),
            quota({
              scopeLabel: 'Cursor Models pool',
              isHeadline: false,
              remainingPercentage: 99,
            }),
          ],
        }),
      ]),
    );

    // Without the two trailing spaces the renderer folds these rows onto one
    // line, which is what the plain newlines used to do.
    const unbroken = view.tooltip
      .split('\n')
      .filter((line) => line !== '' && !line.endsWith('  '));

    expect(unbroken).toEqual([]);
  });

  it('adds the window when one pool spans several of them', () => {
    const view = formatStatusBar(
      dashboard([
        card('codex', {
          quotas: [
            quota({
              scopeLabel: 'GPT-5.3-Codex-Spark',
              periodLabel: '5-hour window',
              remainingPercentage: 60,
            }),
            quota({
              scopeLabel: 'GPT-5.3-Codex-Spark',
              periodLabel: '1-week window',
              isHeadline: false,
              remainingPercentage: 20,
            }),
          ],
        }),
      ]),
    );

    // Here the pool repeats, so without the window both rows would read alike.
    expect(view.tooltip).toContain('GPT-5.3-Codex-Spark · 5-hour window');
    expect(view.tooltip).toContain('GPT-5.3-Codex-Spark · 1-week window');
  });

  it('surfaces the most critical provider state', () => {
    const view = formatStatusBar(
      dashboard([
        card('cursor'),
        card('claude-code', {
          status: 'attention',
          quotas: [
            quota({
              usedPercentage: 85,
              remainingPercentage: 15,
              status: 'attention',
            }),
          ],
        }),
        card('codex', { status: 'exhausted' }),
      ]),
    );

    expect(view.severity).toBe('exhausted');
  });

  it('renders unavailable providers without inventing a percentage', () => {
    const view = formatStatusBar(
      dashboard([
        card('cursor'),
        card('claude-code', {
          quotas: [],
          providerState: 'unsupported',
          message: 'Collector not installed.',
          sourceLabel: 'Unsupported',
        }),
        card('codex'),
      ]),
    );

    expect(view.text).toBe(
      '$(agentmeter-logo) AgentMeter · Cursor 60% · Claude Code — · Codex 60%',
    );
    // The state names the situation once; the source line would repeat it.
    expect(rendered(view.tooltip)).toContain(
      '**Claude Code**\nUnsupported · Collector not installed.',
    );
    expect(view.tooltip).not.toContain('Source: Unsupported');
    expect(view.severity).toBe('unknown');
  });

  it('shows the last known remaining value while labeling stale data', () => {
    const view = formatStatusBar(
      dashboard([
        card('claude-code', {
          providerState: 'stale',
          quotas: [quota({ remainingPercentage: 32, isStale: true })],
          sourceLabel: 'Local collector',
        }),
      ]),
    );

    expect(view.text).toBe('$(agentmeter-logo) AgentMeter · Claude Code 32%');
    expect(view.tooltip).toContain('32% left');
    expect(view.tooltip).toContain('last read before it reset');
    expect(view.severity).toBe('attention');
  });
});
