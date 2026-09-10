import * as vscode from 'vscode';
import {
  buildClaudeStatusLineCommand,
  getClaudeSettingsPath,
  installClaudeStatusLineBridge,
  mergeClaudeStatusLineSettings,
  readClaudeSettings,
  writeClaudeSettings,
} from '../../infrastructure/claude/claudeSettings';

export async function configureClaudeCode(
  context: vscode.ExtensionContext,
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
  } catch {
    console.error('AgentMeter failed to configure Claude Code.');
    void vscode.window.showErrorMessage(
      'AgentMeter could not configure Claude Code. Check that ~/.claude/settings.json contains valid JSON.',
    );
  }
}

export async function configureCursor(): Promise<void> {
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
  void vscode.window.showInformationMessage(
    'Experimental Cursor usage enabled. AgentMeter will show — if the private integration becomes unavailable.',
  );
}

export async function configureCodex(location = 'this computer'): Promise<void> {
  void vscode.window.showInformationMessage(
    `AgentMeter reads Codex usage on ${location}. Install the Codex CLI and run "codex login" there, then refresh AgentMeter. No Codex credentials are read or stored by AgentMeter.`,
  );
}
