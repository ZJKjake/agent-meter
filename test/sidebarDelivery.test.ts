import { describe, expect, it, vi } from 'vitest';
import { DashboardStore } from '../src/application/dashboardStore';
import { UsageService } from '../src/application/usageService';
import { AgentMeterViewProvider } from '../src/presentation/sidebar/agentMeterViewProvider';
import type * as vscode from 'vscode';

vi.mock('vscode', () => ({ Uri: { joinPath: () => ({ toString: () => 'logo.png' }) } }));

describe('Sidebar startup delivery', () => {
  it('delivers the latest snapshot when the browser starts after collection finishes', async () => {
    const store = new DashboardStore(new UsageService({ getUsage: async () => [] }));
    const provider = new AgentMeterViewProvider(store, {} as vscode.Uri);
    let ready = false;
    let receive: (message: { command: string }) => void = () => {};
    const delivered: unknown[] = [];
    const view = {
      webview: {
        cspSource: 'vscode-webview://test',
        asWebviewUri: () => ({ toString: () => 'logo.png' }),
        onDidReceiveMessage: (handler: typeof receive) => { receive = handler; },
        postMessage: async (value: unknown) => { if (ready) { delivered.push(value); } return ready; },
      },
      onDidDispose: () => {},
    };
    provider.resolveWebviewView(view as unknown as vscode.WebviewView);
    const dashboard = await store.refresh();
    expect(delivered).toEqual([]);
    ready = true;
    receive({ command: 'ready' });
    expect(delivered).toContainEqual({ type: 'dashboardUpdated', dashboard });
  });
});
