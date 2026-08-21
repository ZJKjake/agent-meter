import { describe, expect, it } from 'vitest';
import { getWebviewContent } from '../src/presentation/sidebar/webviewContent';
import type { DashboardModel } from '../src/domain/usage';
import type * as vscode from 'vscode';

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
          sourceLabel: 'Experimental private adapter',
          updatedAt: '2026-08-21T16:00:00.000Z',
          status: 'healthy',
          quotas: [
            {
              id: 'cursor:primary',
              used: 19,
              limit: 100,
              remaining: 81,
              unit: 'percent',
              periodLabel: 'Other Models pool',
              resetAt: null,
              updatedAt: '2026-08-21T16:00:00.000Z',
              usedPercentage: 19,
              remainingPercentage: 81,
              status: 'healthy',
            },
          ],
        },
      ],
    };
    const webview = {
      cspSource: 'vscode-webview://agentmeter',
    } as vscode.Webview;

    const html = getWebviewContent(
      webview,
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
    expect(html).toContain('Experimental private adapter');
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
    const webview = {
      cspSource: 'vscode-webview://agentmeter',
    } as vscode.Webview;

    const html = getWebviewContent(
      webview,
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
});
