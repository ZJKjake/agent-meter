import * as vscode from 'vscode';
import {
  DashboardStore,
  DashboardStoreEvent,
  StoreSubscription,
} from '../../application/dashboardStore';
import {
  formatStatusBar,
  StatusBarSeverity,
} from './statusBarFormatter';

const DEFAULT_TOOLTIP = 'AgentMeter\n\nUsage data is loading.';
const BRAND_FOREGROUND = new vscode.ThemeColor(
  'agentmeter.statusBarForeground',
);

export class StatusBarManager implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly storeSubscription: StoreSubscription;

  public constructor(
    dashboardStore: DashboardStore,
    private readonly focusCommand = 'agentmeter.focus',
  ) {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.item.name = 'AgentMeter remaining usage';
    this.item.command = this.focusCommand;
    this.item.text = '$(agentmeter-logo) AgentMeter';
    this.item.tooltip = DEFAULT_TOOLTIP;
    this.item.color = BRAND_FOREGROUND;
    this.item.show();

    this.storeSubscription = dashboardStore.subscribe((event) =>
      this.handleStoreEvent(event),
    );
  }

  public dispose(): void {
    this.storeSubscription.dispose();
    this.item.dispose();
  }

  private handleStoreEvent(event: DashboardStoreEvent): void {
    if (event.type === 'updated') {
      const viewModel = formatStatusBar(event.dashboard);
      this.item.text = viewModel.text;
      this.item.tooltip = new vscode.MarkdownString(viewModel.tooltip);
      this.applySeverity(viewModel.severity);
      return;
    }

    this.item.text = '$(agentmeter-logo) AgentMeter';
    this.item.tooltip = event.message;
    this.applySeverity('unknown');
  }

  private applySeverity(severity: StatusBarSeverity): void {
    switch (severity) {
      case 'exhausted':
        this.item.color = new vscode.ThemeColor('statusBarItem.errorForeground');
        this.item.backgroundColor = new vscode.ThemeColor(
          'statusBarItem.errorBackground',
        );
        return;
      case 'attention':
        this.item.color = new vscode.ThemeColor(
          'statusBarItem.warningForeground',
        );
        this.item.backgroundColor = new vscode.ThemeColor(
          'statusBarItem.warningBackground',
        );
        return;
      case 'unknown':
        this.item.color = BRAND_FOREGROUND;
        this.item.backgroundColor = undefined;
        return;
      case 'healthy':
        this.item.color = BRAND_FOREGROUND;
        this.item.backgroundColor = undefined;
    }
  }
}
