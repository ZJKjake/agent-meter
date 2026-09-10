import { describe, expect, it } from 'vitest';
import { getWebviewContent } from '../src/presentation/sidebar/webviewContent';
import type { DashboardModel, UsageQuotaModel } from '../src/domain/usage';
import type * as vscode from 'vscode';

const WEBVIEW = {
  cspSource: 'vscode-webview://agentmeter',
} as vscode.Webview;

function quota(overrides: Partial<UsageQuotaModel>): UsageQuotaModel {
  return {
    id: 'codex:primary',
    used: 7,
    limit: 100,
    remaining: 93,
    unit: 'percent',
    scopeLabel: null,
    periodLabel: '1-week window',
    isHeadline: false,
    isStale: false,
    resetAt: '2026-09-12T06:39:05.000Z',
    updatedAt: '2026-09-05T06:39:05.000Z',
    usedPercentage: 7,
    remainingPercentage: 93,
    status: 'healthy',
    ...overrides,
  };
}

interface RenderedSidebar {
  readonly markup: string;
  /** Widths the script applied to each bar, in the order it found them. */
  readonly barWidths: readonly string[];
}

/**
 * Executes the webview's browser script against a minimal DOM so the rendered
 * card markup can be asserted, not just the template around it.
 *
 * The stub's `querySelectorAll` scans the markup for bars rather than parsing
 * it, which is enough to prove the script reads each bar's value and writes a
 * width. Widths cannot be asserted on the markup itself: the page's CSP
 * discards style attributes, so they are applied through the CSSOM.
 */
function renderSidebar(dashboard: DashboardModel): RenderedSidebar {
  const html = getWebviewContent(WEBVIEW, dashboard, 'logo.png');
  const script = /<script nonce="[^"]+">([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (!script) {
    throw new Error('The webview did not include an executable script.');
  }

  const bars: { style: { width: string } }[] = [];
  const createElement = () => ({
    textContent: '',
    innerHTML: '',
    disabled: false,
    classList: { toggle: () => undefined },
    setAttribute: () => undefined,
    addEventListener: () => undefined,
    querySelectorAll(): readonly unknown[] {
      const found = [...this.innerHTML.matchAll(/data-remaining="(\d+)"/g)];
      return found.map(([, remaining]) => {
        const bar = {
          style: { width: '' },
          getAttribute: () => remaining,
        };
        bars.push(bar);
        return bar;
      });
    },
  });
  const elements = new Map(
    ['cards', 'overview-value', 'overview-meta', 'refresh-button', 'configure-providers']
      .map((id) => [id, createElement()] as const),
  );
  elements.set('dashboard-data', {
    ...createElement(),
    textContent: JSON.stringify(dashboard),
  });

  new Function(
    'acquireVsCodeApi',
    'document',
    'window',
    script,
  )(
    () => ({ postMessage: () => undefined }),
    { getElementById: (id: string) => elements.get(id) ?? null },
    { addEventListener: () => undefined },
  );

  return {
    markup: elements.get('cards')?.innerHTML ?? '',
    barWidths: bars.map((bar) => bar.style.width),
  };
}

function renderCards(dashboard: DashboardModel): string {
  return renderSidebar(dashboard).markup;
}

describe('AgentMeter sidebar HTML', () => {
  it('serializes remaining usage safely and includes onboarding actions', () => {
    const dashboard: DashboardModel = {
      generatedAt: '2026-08-21T16:00:00.000Z',
      cards: [
        {
          tool: 'cursor',
          name: 'Cursor',
          description: 'AI-first code editor',
          providerState: 'available',
          message: '</script><script>unsafe()</script>',
          sourceLabel: 'Cursor API',
          updatedAt: '2026-08-21T16:00:00.000Z',
          status: 'healthy',
          quotas: [
            quota({
              id: 'cursor:primary',
              used: 19,
              remaining: 81,
              scopeLabel: 'Other Models pool',
              periodLabel: 'Billing cycle',
              isHeadline: true,
              resetAt: null,
              usedPercentage: 19,
              remainingPercentage: 81,
            }),
          ],
        },
      ],
    };

    const html = getWebviewContent(
      WEBVIEW,
      dashboard,
      'vscode-webview://agentmeter/media/icon.png',
    );

    expect(html).toContain('Set up providers');
    expect(html).toContain('Your remaining AI quota, in one clean view.');
    expect(html).toContain('class="metric-value"');
    expect(html).toContain('class="provider-mark ');
    expect(html).toContain('class="brand-logo"');
    expect(html).toContain('img-src vscode-webview://agentmeter');
    expect(html).toContain('remainingPercentage');
    expect(html).toContain('Cursor API');
    expect(html).not.toContain('% used');
    expect(html).not.toContain('</script><script>unsafe()</script>');

    const executableScripts = Array.from(
      html.matchAll(/<script nonce="[^"]+">([\s\S]*?)<\/script>/g),
      (match) => match[1],
    );
    expect(executableScripts).toHaveLength(1);
    expect(() => new Function(executableScripts[0])).not.toThrow();
  });

  it('shows a deliberate loading state before the first provider snapshot', () => {
    const html = getWebviewContent(
      WEBVIEW,
      {
        generatedAt: '',
        cards: [],
      },
      'vscode-webview://agentmeter/media/icon.png',
    );

    expect(html).toContain('Checking providers…');
    expect(html).toContain('renderSkeletons');
    expect(html).not.toContain('No usage data available yet.');
  });

  function codexCard(sparkRemaining: number) {
    return {
      generatedAt: '2026-09-05T06:39:05.000Z',
      cards: [
        {
          tool: 'codex' as const,
          name: 'Codex',
          description: 'OpenAI coding agent',
          providerState: 'available' as const,
          message: null,
          sourceLabel: 'Local collector',
          updatedAt: '2026-09-05T06:39:05.000Z',
          status: 'healthy' as const,
          quotas: [
            quota({ id: 'codex:primary', isHeadline: true }),
            quota({
              id: 'codex_bengalfox:primary',
              scopeLabel: 'GPT-5.3-Codex-Spark',
              periodLabel: '5-hour window',
              remainingPercentage: 100,
            }),
            quota({
              id: 'codex_bengalfox:secondary',
              scopeLabel: 'GPT-5.3-Codex-Spark',
              periodLabel: '1-week window',
              remainingPercentage: sparkRemaining,
              status: sparkRemaining <= 20 ? ('attention' as const) : ('healthy' as const),
            }),
          ],
        },
      ],
    };
  }

  it('gives every supplied pool its own labeled bar', () => {
    const markup = renderCards({
      generatedAt: '2026-09-05T06:39:05.000Z',
      cards: [
        {
          tool: 'cursor',
          name: 'Cursor',
          description: 'AI-first code editor',
          providerState: 'available',
          message: null,
          sourceLabel: 'Cursor API',
          updatedAt: '2026-09-05T06:39:05.000Z',
          status: 'healthy',
          quotas: [
            quota({
              id: 'cursor:primary',
              scopeLabel: 'Other Models pool',
              periodLabel: 'Billing cycle',
              isHeadline: true,
              remainingPercentage: 81,
            }),
            quota({
              id: 'cursor:cursor-models',
              scopeLabel: 'Cursor Models pool',
              periodLabel: 'Billing cycle',
              remainingPercentage: 99,
            }),
            quota({
              id: 'cursor:overall',
              scopeLabel: 'Included plan usage',
              periodLabel: 'Billing cycle',
              remainingPercentage: 96,
            }),
          ],
        },
      ],
    });

    expect(markup).toContain('Other Models pool · Billing cycle');
    expect(markup).toContain('Cursor Models pool · Billing cycle');
    expect(markup).toContain('Included plan usage · Billing cycle');
    expect(markup.match(/class="progress-track"/g)).toHaveLength(3);
    expect(markup).toContain('data-remaining="81"');
    expect(markup).toContain('data-remaining="99"');
    // The note block is styled like a call-out, so a working provider must
    // not carry one. The footer already names where the numbers came from.
    expect(markup).not.toContain('provider-note');
    expect(markup).toContain('Cursor API');
    // Cursor bills every pool on one cycle, so one countdown covers the card.
    expect(markup.match(/title="Resets /g)).toHaveLength(1);
  });

  it('keeps a countdown on each row when windows reset at different times', () => {
    const markup = renderCards({
      generatedAt: '2026-09-05T06:39:05.000Z',
      cards: [
        {
          tool: 'codex',
          name: 'Codex',
          description: 'OpenAI coding agent',
          providerState: 'available',
          message: null,
          sourceLabel: 'Local collector',
          updatedAt: '2026-09-05T06:39:05.000Z',
          status: 'healthy',
          quotas: [
            quota({
              id: 'codex:primary',
              periodLabel: '5-hour window',
              isHeadline: true,
              resetAt: '2026-09-05T11:00:00.000Z',
            }),
            quota({
              id: 'codex:secondary',
              periodLabel: '1-week window',
              resetAt: '2026-09-12T06:39:05.000Z',
            }),
          ],
        },
      ],
    });

    expect(markup.match(/title="Resets /g)).toHaveLength(2);
  });

  it('draws each provider its own brand mark', () => {
    const markup = renderCards({
      generatedAt: '2026-09-05T06:39:05.000Z',
      cards: (['cursor', 'claude-code', 'codex'] as const).map((tool) => ({
        tool,
        name: tool,
        description: 'Test provider',
        providerState: 'available' as const,
        message: null,
        sourceLabel: 'Local collector',
        updatedAt: '2026-09-05T06:39:05.000Z',
        status: 'healthy' as const,
        quotas: [quota({ isHeadline: true })],
      })),
    });

    const marks = markup.match(/<span class="provider-mark [a-z-]+" aria-hidden="true"><svg/g);

    expect(marks).toHaveLength(3);
    // Distinct artwork per provider rather than one shape recolored.
    expect(new Set(markup.match(/viewBox="[^"]+"/g)).size).toBeGreaterThan(1);
  });

  it('groups several windows of one pool under a single heading', () => {
    const markup = renderCards(codexCard(12));

    expect(markup).toContain('<div class="quota-scope">GPT-5.3-Codex-Spark</div>');
    expect(markup.match(/class="quota-scope"/g)).toHaveLength(1);
    expect(markup.match(/1-week window/g)).toHaveLength(2);
    expect(markup).toContain('12% left');
  });

  it('draws the bar track in a neutral color so the filled share is legible', () => {
    const html = getWebviewContent(WEBVIEW, codexCard(100), 'logo.png');
    const track = /\.progress-track \{([^}]+)\}/.exec(html)?.[1] ?? '';

    // progressBar-background is VS Code's blue fill token; using it as the
    // track made every bar read as solid blue regardless of the percentage.
    expect(track).not.toContain('progressBar-background');
    expect(track).toContain('color-mix');
  });

  it('carries no style attribute the page CSP would discard', () => {
    const html = getWebviewContent(WEBVIEW, codexCard(63), 'logo.png');

    // style-src names a nonce and omits 'unsafe-inline', so a style attribute
    // in markup is dropped. A progress bar written that way lost its width
    // and stretched to fill its track, showing every quota as full.
    expect(html).toContain("style-src");
    expect(html).not.toContain("'unsafe-inline'");
    expect(html).not.toMatch(/<[^>]+\sstyle="/);
  });

  it('starts the bar empty so an unapplied width cannot read as a full quota', () => {
    const html = getWebviewContent(WEBVIEW, codexCard(63), 'logo.png');
    const bar = /\.progress-bar \{([^}]+)\}/.exec(html)?.[1] ?? '';

    expect(bar).toMatch(/width:\s*0/);
  });

  it('applies each bar width through the CSSOM after rendering cards', () => {
    const { markup, barWidths } = renderSidebar(codexCard(63));
    const declared = [...markup.matchAll(/data-remaining="(\d+)"/g)].map(
      ([, remaining]) => `${remaining}%`,
    );

    expect(declared).toContain('63%');
    // Every bar the markup declares is given a width, so none is left at the
    // stylesheet's empty default and none stretches to fill its track.
    expect(barWidths).toEqual(declared);
  });

  it('shows time left in the window and keeps the exact reset on hover', () => {
    const markup = renderCards(codexCard(100));

    expect(markup).toMatch(/title="Resets [A-Z][a-z]{2} \d+, [^"]+">Resets in \d+d</);
  });

  it('does not add a pool heading when a provider reports a single pool', () => {
    const markup = renderCards({
      generatedAt: '2026-09-05T06:39:05.000Z',
      cards: [
        {
          tool: 'claude-code',
          name: 'Claude Code',
          description: 'Agentic coding in your terminal',
          providerState: 'available',
          message: null,
          sourceLabel: 'Local collector',
          updatedAt: '2026-09-05T06:39:05.000Z',
          status: 'healthy',
          quotas: [
            quota({
              id: 'claude-code:five-hour',
              periodLabel: '5-hour window',
              isHeadline: true,
            }),
            quota({ id: 'claude-code:seven-day', periodLabel: '7-day window' }),
          ],
        },
      ],
    });

    expect(markup).not.toContain('quota-scope');
    expect(markup).toContain('7-day window');
  });

  it('marks a window that reset after its value was read', () => {
    const markup = renderCards({
      generatedAt: '2026-09-05T06:39:05.000Z',
      cards: [
        {
          tool: 'claude-code',
          name: 'Claude Code',
          description: 'Agentic coding in your terminal',
          providerState: 'available',
          message: null,
          sourceLabel: 'Local collector',
          updatedAt: '2026-09-05T06:39:05.000Z',
          status: 'healthy',
          quotas: [
            quota({
              id: 'claude-code:seven-day',
              periodLabel: '7-day window',
              isHeadline: true,
            }),
            quota({
              id: 'claude-code:five-hour',
              periodLabel: '5-hour window',
              isStale: true,
            }),
          ],
        },
      ],
    });

    // The value stays readable; only the badge says it no longer describes
    // the window that is running now.
    expect(markup.match(/class="quota-stale"/g)).toHaveLength(1);
    expect(markup).toContain('5-hour window<span class="quota-stale"');
  });
});

it('renders one setup action for the active provider without a host selector', () => {
  const dashboard: DashboardModel = {
    generatedAt: '2026-09-09T12:00:00Z',
    cards: [{
      tool: 'claude-code', name: 'Claude Code', description: 'Anthropic coding agent',
      location: 'workspace', locationLabel: 'SSH',
      quotas: [], updatedAt: null, status: 'unknown', providerState: 'setup-required',
      message: 'Connect this provider.', sourceLabel: 'Setup required',
    }],
  };
  const { markup } = renderSidebar(dashboard);
  expect(markup.match(/data-provider="claude-code"/g)).toHaveLength(1);
  expect(markup).not.toContain('data-location=');
});
