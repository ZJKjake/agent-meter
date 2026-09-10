import * as vscode from 'vscode';
import { DashboardStore } from './application/dashboardStore';
import { RefreshScheduler } from './application/refreshScheduler';
import { UsageService } from './application/usageService';
import {
  ProviderFirstReportedAt,
  ProviderOrderStore,
} from './domain/usage';
import { ClaudeUsageCollector } from './infrastructure/collectors/claudeUsageCollector';
import { CodexUsageCollector } from './infrastructure/collectors/codexUsageCollector';
import { configureClaudeCode, configureCodex } from './presentation/configuration/providerConfiguration';
import { HostUsageRepository } from './infrastructure/hosts/hostUsageRepository';
import { LOCAL_COLLECT_COMMAND, LOCAL_CONFIGURE_COMMAND } from './infrastructure/hosts/usageProtocol';
import { CollectorUsageRepository } from './infrastructure/usage/collectorUsageRepository';
import { AgentMeterViewProvider } from './presentation/sidebar/agentMeterViewProvider';
import { StatusBarManager } from './presentation/statusBar/statusBarManager';

export function activate(context: vscode.ExtensionContext): void {
  const extensionVersion = getExtensionVersion(context);
  const isRemote = Boolean(vscode.env.remoteName);
  const workspaceRepository = new CollectorUsageRepository([
    new ClaudeUsageCollector(),
    new CodexUsageCollector(undefined, undefined, extensionVersion),
  ]);
  const usageRepository = new HostUsageRepository(
    () => vscode.commands.executeCommand(LOCAL_COLLECT_COMMAND),
    isRemote ? workspaceRepository : undefined,
    getWorkspaceLabel(vscode.env.remoteName),
  );
  const usageService = new UsageService(
    usageRepository,
    createProviderOrderStore(context),
  );
  const dashboardStore = new DashboardStore(usageService);
  const viewProvider = new AgentMeterViewProvider(
    dashboardStore,
    context.extensionUri,
  );
  const statusBarManager = new StatusBarManager(dashboardStore);
  const refreshScheduler = new RefreshScheduler(
    () => dashboardStore.refresh(),
    getRefreshIntervalMs(),
  );

  context.subscriptions.push(
    statusBarManager,
    refreshScheduler,
    vscode.window.registerWebviewViewProvider(
      AgentMeterViewProvider.viewType,
      viewProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      },
    ),
    vscode.commands.registerCommand('agentmeter.refresh', () =>
      dashboardStore.refresh(),
    ),
    vscode.commands.registerCommand('agentmeter.focus', () =>
      vscode.commands.executeCommand('workbench.view.extension.agentmeter'),
    ),
    vscode.commands.registerCommand('agentmeter.configureClaudeCode', () =>
      configureProvider('claude-code', context, dashboardStore),
    ),
    vscode.commands.registerCommand('agentmeter.configureCursor', () =>
      configureProvider('cursor', context, dashboardStore),
    ),
    vscode.commands.registerCommand('agentmeter.configureCodex', () =>
      configureProvider('codex', context, dashboardStore),
    ),
    vscode.commands.registerCommand('agentmeter.configureProviders', () =>
      configureProviders(),
    ),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('agentmeter')) {
        if (event.affectsConfiguration('agentmeter.refreshIntervalMinutes')) {
          refreshScheduler.restart(getRefreshIntervalMs());
        }
        void dashboardStore.refresh().catch(() => undefined);
      }
    }),
    vscode.window.onDidChangeWindowState((state) => {
      if (state.focused) {
        refreshScheduler.refreshNow();
      }
    }),
  );

  void initializeDashboard(context, dashboardStore);
}

export function deactivate(): void {}

/**
 * Card order follows the order providers were set up in, so it is kept in
 * global state rather than per workspace: the same providers back every
 * window, and cards reshuffling between projects would read as a fault.
 */
function createProviderOrderStore(
  context: vscode.ExtensionContext,
): ProviderOrderStore {
  const key = 'agentmeter.providerOrder.v1';

  return {
    read: () => context.globalState.get<ProviderFirstReportedAt>(key, {}),
    write: async (value) => {
      await context.globalState.update(key, value);
    },
  };
}

function getExtensionVersion(context: vscode.ExtensionContext): string {
  const version = context.extension.packageJSON.version;
  return typeof version === 'string' && version.length > 0
    ? version
    : 'unknown';
}

function getRefreshIntervalMs(): number {
  const configuredMinutes = vscode.workspace
    .getConfiguration('agentmeter')
    .get<number>('refreshIntervalMinutes', 5);
  const minutes = Number.isFinite(configuredMinutes)
    ? Math.min(60, Math.max(1, configuredMinutes))
    : 5;
  return minutes * 60_000;
}

async function configureProviders(): Promise<void> {
  const selection = await vscode.window.showQuickPick(
    [
      {
        label: 'Cursor',
        description: 'Manage the experimental personal-plan adapter',
        command: 'agentmeter.configureCursor',
      },
      {
        label: 'Claude Code',
        description: 'Install the official status-line bridge',
        command: 'agentmeter.configureClaudeCode',
      },
      {
        label: 'Codex',
        description: 'Connect your Codex CLI',
        command: 'agentmeter.configureCodex',
      },
    ],
    {
      title: 'Configure AgentMeter providers',
      placeHolder: 'Choose a provider',
    },
  );

  if (selection) {
    await vscode.commands.executeCommand(selection.command);
  }
}

async function initializeDashboard(
  context: vscode.ExtensionContext,
  dashboardStore: DashboardStore,
): Promise<void> {
  await dashboardStore.refresh().catch(() => undefined);

  const onboardingKey = 'agentmeter.onboarding.v1.shown';
  if (context.globalState.get<boolean>(onboardingKey, false)) {
    return;
  }

  await context.globalState.update(onboardingKey, true);
  await vscode.commands.executeCommand('workbench.view.extension.agentmeter');
}

function getWorkspaceLabel(remoteName: string | undefined): string {
  switch (remoteName) {
    case 'ssh-remote': return 'SSH';
    case 'dev-container': case 'attached-container': return 'Container';
    case 'wsl': return 'WSL';
    case 'codespaces': return 'Codespaces';
    default: return 'Remote';
  }
}

async function configureProvider(
  tool: 'cursor' | 'claude-code' | 'codex',
  context: vscode.ExtensionContext,
  dashboardStore: DashboardStore,
): Promise<void> {
  const location = tool === 'cursor' || !vscode.env.remoteName ? 'local' : 'workspace';
  try {
    if (location === 'local') {
      await vscode.commands.executeCommand(LOCAL_CONFIGURE_COMMAND, tool);
    } else if (tool === 'claude-code') {
      await configureClaudeCode(context);
    } else {
      await configureCodex('the remote workspace');
    }
    await dashboardStore.refresh();
  } catch {
    void vscode.window.showErrorMessage('AgentMeter could not reach this computer. Reload the window to reconnect.');
  }
}
