import * as vscode from 'vscode';
import {
  DashboardStore,
  DashboardStoreEvent,
  StoreSubscription,
} from '../../application/dashboardStore';
import { DashboardModel } from '../../domain/usage';
import { getWebviewContent } from './webviewContent';

interface WebviewMessage {
  readonly command?: string;
  readonly provider?: string;
}

const EMPTY_DASHBOARD: DashboardModel = {
  cards: [],
  generatedAt: '',
};

export class AgentMeterViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'agentmeter.dashboard';

  private view: vscode.WebviewView | undefined;
  private storeSubscription: StoreSubscription | undefined;

  public constructor(
    private readonly dashboardStore: DashboardStore,
    private readonly extensionUri: vscode.Uri,
  ) {}

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    const logoUri = webviewView.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'icon.png'),
    );
    webviewView.webview.html = getWebviewContent(
      webviewView.webview,
      EMPTY_DASHBOARD,
      logoUri.toString(),
    );
    this.storeSubscription?.dispose();
    this.storeSubscription = this.dashboardStore.subscribe((event) =>
      this.handleStoreEvent(event),
    );

    webviewView.webview.onDidReceiveMessage((message: WebviewMessage) => {
      if (message.command === 'refresh') {
        void this.refresh();
      }

      if (message.command === 'configureProviders') {
        void vscode.commands.executeCommand('agentmeter.configureProviders');
      }

      if (message.command === 'configureProvider') {
        const commands: Record<string, string> = {
          cursor: 'agentmeter.configureCursor',
          'claude-code': 'agentmeter.configureClaudeCode',
          codex: 'agentmeter.configureCodex',
        };
        const command = message.provider ? commands[message.provider] : undefined;
        if (command) {
          void vscode.commands.executeCommand(command);
        }
      }
    });

    webviewView.onDidDispose(() => {
      this.storeSubscription?.dispose();
      this.storeSubscription = undefined;
      if (this.view === webviewView) {
        this.view = undefined;
      }
    });

    void this.refresh().catch(() => undefined);
  }

  public async refresh(): Promise<void> {
    await this.dashboardStore.refresh();
  }

  private handleStoreEvent(event: DashboardStoreEvent): void {
    if (!this.view) {
      return;
    }

    if (event.type === 'updated') {
      void this.view.webview.postMessage({
        type: 'dashboardUpdated',
        dashboard: event.dashboard,
      });
      return;
    }

    void this.view.webview.postMessage({
      type: 'dashboardError',
      message: event.message,
    });
  }
}
