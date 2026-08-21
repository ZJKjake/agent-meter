import * as vscode from 'vscode';
import { DashboardStore } from './application/dashboardStore';
import { UsageService } from './application/usageService';
import { ClaudeUsageCollector } from './infrastructure/collectors/claudeUsageCollector';
import { CodexUsageCollector } from './infrastructure/collectors/codexUsageCollector';
import { CursorPersonalUsageCollector } from './infrastructure/collectors/cursorPersonalUsageCollector';
import {
  buildClaudeStatusLineCommand,
  getClaudeSettingsPath,
  installClaudeStatusLineBridge,
  mergeClaudeStatusLineSettings,
  readClaudeSettings,
  writeClaudeSettings,
} from './infrastructure/claude/claudeSettings';
import { CollectorUsageRepository } from './infrastructure/usage/collectorUsageRepository';
import { AgentMeterViewProvider } from './presentation/sidebar/agentMeterViewProvider';
import { StatusBarManager } from './presentation/statusBar/statusBarManager';

export function activate(context: vscode.ExtensionContext): void {
  const usageRepository = new CollectorUsageRepository([
    new CursorPersonalUsageCollector({
      isEnabled: () =>
        vscode.workspace
          .getConfiguration('agentmeter')
          .get<boolean>('cursor.experimentalPersonalUsage.enabled', false),
    }),
    new ClaudeUsageCollector(),
    new CodexUsageCollector(),
  ]);
  const usageService = new UsageService(usageRepository);
  const dashboardStore = new DashboardStore(usageService);
  const viewProvider = new AgentMeterViewProvider(
    dashboardStore,
    context.extensionUri,
  );
  const statusBarManager = new StatusBarManager(dashboardStore);

  context.subscriptions.push(
    statusBarManager,
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
      configureClaudeCode(context, dashboardStore),
    ),
    vscode.commands.registerCommand('agentmeter.configureCursor', () =>
      configureCursor(dashboardStore),
    ),
    vscode.commands.registerCommand('agentmeter.configureCodex', () =>
      configureCodex(),
    ),
    vscode.commands.registerCommand('agentmeter.configureProviders', () =>
      configureProviders(),
    ),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('agentmeter')) {
        void dashboardStore.refresh().catch(() => undefined);
      }
    }),
  );

  void initializeDashboard(context, dashboardStore);
}

export function deactivate(): void {}

async function configureClaudeCode(
  context: vscode.ExtensionContext,
  dashboardStore: DashboardStore,
): Promise<void> {
  const settingsPath = getClaudeSettingsPath();

  try {
    const current = await readClaudeSettings(settingsPath);
    let backupExisting = false;

    if (current.hasStatusLine) {
      const choice = await vscode.window.showWarningMessage(
        'Claude Code already has a status line configured. Replace it with AgentMeter?',
        'Replace status line',
        'Cancel',
      );

      if (choice !== 'Replace status line') {
        return;
      }

      backupExisting = true;
    }

    const bridgePath = await installClaudeStatusLineBridge(
      context.extensionPath,
    );
    const command = buildClaudeStatusLineCommand(bridgePath);
    const settings = mergeClaudeStatusLineSettings(current.settings, command);
    const result = await writeClaudeSettings(
      settingsPath,
      settings,
      backupExisting,
    );

    const backupMessage = result.backupPath
      ? ` A backup was saved to ${result.backupPath}.`
      : '';
    void vscode.window.showInformationMessage(
      `Claude Code status line configured for AgentMeter.${backupMessage} Restart Claude Code to apply it.`,
    );
    await dashboardStore.refresh();
  } catch {
    console.error('AgentMeter failed to configure Claude Code.');
    void vscode.window.showErrorMessage(
      'AgentMeter could not configure Claude Code. Check that ~/.claude/settings.json contains valid JSON.',
    );
  }
}

async function configureCursor(
  dashboardStore: DashboardStore,
): Promise<void> {
  const configuration = vscode.workspace.getConfiguration('agentmeter');
  const key = 'cursor.experimentalPersonalUsage.enabled';
  const isEnabled = configuration.get<boolean>(key, false);

  if (isEnabled) {
    const choice = await vscode.window.showWarningMessage(
      'The experimental/private Cursor adapter is enabled. It reads Cursor\'s local access token read-only and sends it only to api2.cursor.sh over HTTPS. Disable it?',
      { modal: true },
      'Keep enabled',
      'Disable adapter',
    );

    if (choice !== 'Disable adapter') {
      return;
    }

    await configuration.update(key, false, vscode.ConfigurationTarget.Global);
    await dashboardStore.refresh();
    return;
  }

  const choice = await vscode.window.showWarningMessage(
    'Enable AgentMeter\'s experimental/private Cursor personal-plan adapter? It reads Cursor\'s local access token read-only on each refresh and sends it only to api2.cursor.sh over HTTPS. AgentMeter never stores, logs, or sends the token elsewhere. Cursor does not publish this API, so it can stop working without notice.',
    { modal: true },
    'Enable adapter',
    'Cancel',
  );

  if (choice !== 'Enable adapter') {
    return;
  }

  await configuration.update(key, true, vscode.ConfigurationTarget.Global);
  await dashboardStore.refresh();
  void vscode.window.showInformationMessage(
    'Experimental Cursor usage enabled. AgentMeter will show — if the private integration becomes unavailable.',
  );
}

async function configureCodex(): Promise<void> {
  void vscode.window.showInformationMessage(
    'AgentMeter uses the local Codex app-server. Install the Codex CLI and run "codex login", then refresh AgentMeter. No Codex credentials are read or stored by AgentMeter.',
  );
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
        description: 'View local CLI setup instructions',
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
