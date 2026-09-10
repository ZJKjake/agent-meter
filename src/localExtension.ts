import * as vscode from 'vscode';
import { ClaudeUsageCollector } from './infrastructure/collectors/claudeUsageCollector';
import { CodexUsageCollector } from './infrastructure/collectors/codexUsageCollector';
import { CursorPersonalUsageCollector, getCursorStateDatabasePathFromStorage } from './infrastructure/collectors/cursorPersonalUsageCollector';
import { CollectorUsageRepository } from './infrastructure/usage/collectorUsageRepository';
import { encodeUsage, LOCAL_COLLECT_COMMAND, LOCAL_CONFIGURE_COMMAND } from './infrastructure/hosts/usageProtocol';
import { configureClaudeCode, configureCodex, configureCursor } from './presentation/configuration/providerConfiguration';

/** UI-only companion; the manifest prevents these collectors from running over SSH. */
export function activate(context: vscode.ExtensionContext): void {
  const version = String(context.extension.packageJSON.version);
  const repository = new CollectorUsageRepository([
    new CursorPersonalUsageCollector({
      clientVersion: version,
      databasePath: /cursor/i.test(vscode.env.appName)
        ? getCursorStateDatabasePathFromStorage(context.globalStorageUri.fsPath)
        : undefined,
      isEnabled: () => vscode.workspace.getConfiguration('agentmeter')
        .get<boolean>('cursor.experimentalPersonalUsage.enabled', false),
    }),
    new ClaudeUsageCollector(),
    new CodexUsageCollector(undefined, undefined, version),
  ]);
  let pending: Promise<ReturnType<typeof encodeUsage>> | undefined;
  context.subscriptions.push(
    vscode.commands.registerCommand(LOCAL_COLLECT_COMMAND, () => {
      pending ??= repository.getUsage().then(encodeUsage).finally(() => { pending = undefined; });
      return pending;
    }),
    vscode.commands.registerCommand(LOCAL_CONFIGURE_COMMAND, async (tool: unknown) => {
      switch (tool) {
        case 'cursor': await configureCursor(); break;
        case 'claude-code': await configureClaudeCode(context); break;
        case 'codex': await configureCodex(); break;
        default: throw new Error('Unknown AgentMeter provider.');
      }
    }),
  );
}
