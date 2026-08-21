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

function quota(
  overrides: Partial<UsageQuotaModel> = {},
): UsageQuotaModel {
  return {
    id: 'primary',
    used: 40,
    limit: 100,
    remaining: 60,
    unit: 'percent',
    periodLabel: 'Primary window',
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
    expect(view.tooltip).toContain('Cursor: 81% remaining');
    expect(view.tooltip).toContain('Claude Code: 32% remaining');
    expect(view.severity).toBe('healthy');
  });

  it('prefers a primary quota over a secondary quota', () => {
    const cardWithWindows = card('codex', {
      quotas: [
        quota({ id: 'codex:secondary', remainingPercentage: 10 }),
        quota({ id: 'codex:primary', remainingPercentage: 80 }),
      ],
    });

    expect(getPrimaryQuota(cardWithWindows)?.remainingPercentage).toBe(80);
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
    expect(view.tooltip).toContain('Claude Code: Unsupported');
    expect(view.severity).toBe('unknown');
  });

  it('shows the last known remaining value while labeling stale data', () => {
    const view = formatStatusBar(
      dashboard([
        card('claude-code', {
          providerState: 'stale',
          quotas: [quota({ remainingPercentage: 32 })],
          sourceLabel: 'Local collector',
        }),
      ]),
    );

    expect(view.text).toBe('$(agentmeter-logo) AgentMeter · Claude Code 32%');
    expect(view.tooltip).toContain('32% remaining (stale)');
    expect(view.severity).toBe('attention');
  });
});
