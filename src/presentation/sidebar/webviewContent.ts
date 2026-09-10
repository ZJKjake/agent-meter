import type * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { DashboardModel } from '../../domain/usage';

export function getWebviewContent(
  webview: vscode.Webview,
  dashboard: DashboardModel,
  logoUri: string,
): string {
  const nonce = getNonce();
  const serializedDashboard = JSON.stringify(dashboard).replace(/</g, '\\u003c');
  const escapedLogoUri = escapeAttribute(logoUri);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';"
  >
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AgentMeter</title>
  <style nonce="${nonce}">
    :root {
      color-scheme: light dark;
    }

    * {
      box-sizing: border-box;
    }

    body {
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      line-height: 1.45;
      margin: 0;
      padding: 16px 12px 22px;
    }

    button {
      color: inherit;
      font: inherit;
    }

    button:focus-visible {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 2px;
    }

    .topbar,
    .brand,
    .overview-top,
    .provider-header,
    .provider-identity,
    .metric-row,
    .quota-heading,
    .card-footer {
      align-items: center;
      display: flex;
    }

    .topbar,
    .overview-top,
    .provider-header,
    .metric-row,
    .quota-heading,
    .card-footer {
      justify-content: space-between;
    }

    .topbar {
      gap: 12px;
    }

    .brand {
      gap: 9px;
      min-width: 0;
    }

    .brand-logo {
      border: 1px solid var(--vscode-widget-border);
      border-radius: 7px;
      box-shadow: 0 0 10px color-mix(in srgb, var(--vscode-textLink-foreground) 18%, transparent);
      display: block;
      flex: 0 0 auto;
      height: 30px;
      object-fit: cover;
      width: 30px;
    }

    .eyebrow,
    .section-label {
      color: var(--vscode-descriptionForeground);
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.11em;
      text-transform: uppercase;
    }

    h1 {
      font-size: 18px;
      line-height: 1.2;
      margin: 1px 0 0;
    }

    .intro {
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      margin: 10px 0 14px;
    }

    .refresh-button {
      align-items: center;
      background: transparent;
      border: 1px solid var(--vscode-widget-border);
      border-radius: 7px;
      cursor: pointer;
      display: inline-flex;
      flex: 0 0 auto;
      height: 30px;
      justify-content: center;
      padding: 0;
      width: 30px;
    }

    .refresh-button:hover {
      background: var(--vscode-toolbar-hoverBackground);
    }

    .refresh-button:disabled {
      cursor: default;
      opacity: 0.65;
    }

    .refresh-icon {
      display: block;
      font-size: 15px;
      line-height: 1;
    }

    .refresh-button.is-refreshing .refresh-icon {
      animation: spin 850ms linear infinite;
    }

    .overview {
      background: var(--vscode-editor-inactiveSelectionBackground);
      border: 1px solid var(--vscode-widget-border);
      border-left: 2px solid var(--vscode-textLink-foreground);
      border-radius: 9px;
      margin-bottom: 12px;
      padding: 12px;
    }

    .overview-top {
      align-items: flex-end;
      gap: 10px;
    }

    .overview-value {
      font-size: 14px;
      font-weight: 650;
      margin-top: 3px;
    }

    .overview-meta {
      color: var(--vscode-descriptionForeground);
      font-size: 10px;
      margin-top: 7px;
    }

    .primary-button,
    .secondary-button {
      border-radius: 5px;
      cursor: pointer;
      font-size: 11px;
      padding: 5px 8px;
    }

    .primary-button {
      background: var(--vscode-button-background);
      border: 1px solid transparent;
      color: var(--vscode-button-foreground);
    }

    .primary-button:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .secondary-button {
      background: transparent;
      border: 1px solid var(--vscode-widget-border);
      white-space: nowrap;
    }

    .secondary-button:hover {
      background: var(--vscode-toolbar-hoverBackground);
    }

    .cards {
      display: grid;
      gap: 10px;
    }

    .card {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border);
      border-radius: 10px;
      overflow: hidden;
      padding: 12px;
    }

    .provider-header {
      align-items: flex-start;
      gap: 8px;
    }

    .provider-identity {
      align-items: flex-start;
      gap: 8px;
      min-width: 0;
    }

    .provider-mark {
      align-items: center;
      border: 1px solid var(--vscode-widget-border);
      border-radius: 7px;
      /* Every mark is drawn monochrome in the foreground token, so all three
         stay consistent with each other and legible in either theme. */
      color: var(--vscode-foreground);
      display: inline-flex;
      flex: 0 0 auto;
      height: 29px;
      justify-content: center;
      width: 29px;
    }

    .provider-mark svg {
      display: block;
      fill: currentColor;
      height: 16px;
      width: 16px;
    }

    .tool-name {
      font-size: 13px;
      font-weight: 650;
      line-height: 1.3;
    }

    .tool-description {
      color: var(--vscode-descriptionForeground);
      font-size: 10px;
      line-height: 1.35;
      margin-top: 1px;
    }

    .provider-state {
      align-items: center;
      border: 1px solid var(--vscode-widget-border);
      border-radius: 999px;
      color: var(--vscode-descriptionForeground);
      display: inline-flex;
      flex: 0 0 auto;
      font-size: 9px;
      gap: 5px;
      line-height: 1;
      padding: 4px 6px;
      white-space: nowrap;
    }

    .state-dot {
      background: currentColor;
      border-radius: 50%;
      height: 5px;
      width: 5px;
    }

    .provider-state.available {
      color: var(--vscode-testing-iconPassed, var(--vscode-charts-green));
    }

    .provider-state.stale,
    .provider-state.authentication-required {
      color: var(--vscode-editorWarning-foreground);
    }

    .provider-state.mock {
      color: var(--vscode-charts-purple, var(--vscode-textLink-foreground));
    }

    .primary-quota {
      margin-top: 15px;
    }

    .metric-row {
      align-items: flex-end;
      gap: 10px;
      margin-bottom: 7px;
    }

    .metric {
      align-items: baseline;
      display: flex;
      gap: 5px;
      min-width: 0;
    }

    .metric-value {
      font-size: 30px;
      font-variant-numeric: tabular-nums;
      font-weight: 700;
      letter-spacing: -0.045em;
      line-height: 1;
    }

    .metric-unit {
      color: var(--vscode-descriptionForeground);
      font-size: 10px;
      white-space: nowrap;
    }

    .reset-label,
    .quota-detail,
    .quota-meta,
    .card-footer,
    .empty-label,
    .provider-note {
      color: var(--vscode-descriptionForeground);
      font-size: 10px;
    }

    .reset-label {
      padding-bottom: 2px;
      text-align: right;
    }

    .quota-heading {
      gap: 10px;
      font-size: 10px;
      margin-bottom: 6px;
    }

    .quota-name {
      color: var(--vscode-descriptionForeground);
    }

    .quota-percent {
      font-variant-numeric: tabular-nums;
      font-weight: 650;
    }

    .quota-stale {
      border: 1px solid var(--vscode-widget-border, currentColor);
      border-radius: 3px;
      font-size: 9px;
      letter-spacing: 0.04em;
      margin-left: 5px;
      opacity: 0.75;
      padding: 0 3px;
      text-transform: uppercase;
    }

    /*
     * The track must not use --vscode-progressBar-background: that token is
     * VS Code's blue progress fill, so pairing it with the blue fill below
     * made a bar at any level read as solid blue. A neutral track is what
     * makes the filled fraction legible.
     */
    .progress-track {
      background: color-mix(in srgb, var(--vscode-foreground) 18%, transparent);
      border: 1px solid color-mix(in srgb, var(--vscode-foreground) 12%, transparent);
      border-radius: 999px;
      height: 9px;
      overflow: hidden;
      width: 100%;
    }

    .progress-track.indeterminate {
      opacity: 0.55;
    }

    /*
     * Starts empty on purpose. The width arrives from the script, and a bar
     * left at its natural size would stretch to fill the track and read as a
     * full quota, so a failure to apply it would look like healthy data
     * rather than a bug.
     */
    .progress-bar {
      background: var(--vscode-textLink-foreground);
      border-radius: inherit;
      height: 100%;
      transition: width 160ms ease;
      width: 0;
    }

    .progress-bar.attention {
      background: var(--vscode-editorWarning-foreground);
    }

    .progress-bar.exhausted {
      background: var(--vscode-errorForeground);
    }

    .progress-bar.unknown {
      background: var(--vscode-descriptionForeground);
      width: 32%;
    }

    .quota-detail {
      margin-top: 5px;
    }

    .quota-meta {
      align-items: center;
      display: flex;
      gap: 8px;
      justify-content: space-between;
      margin-top: 5px;
    }

    .quota-meta span:last-child {
      margin-left: auto;
      text-align: right;
    }

    .secondary-quotas {
      border-top: 1px solid var(--vscode-widget-border);
      margin-top: 11px;
      padding-top: 2px;
    }

    .secondary-quota {
      padding-top: 9px;
    }

    .quota-scope {
      font-size: 10px;
      font-weight: 650;
      padding-top: 10px;
    }

    .provider-note {
      background: var(--vscode-textBlockQuote-background);
      border-left: 2px solid var(--vscode-textBlockQuote-border, var(--vscode-widget-border));
      line-height: 1.4;
      margin-top: 11px;
      padding: 7px 8px;
    }

    .provider-note + .secondary-button {
      margin-top: 9px;
    }

    .empty-provider {
      padding: 16px 0 4px;
      text-align: center;
    }

    .empty-metric {
      color: var(--vscode-descriptionForeground);
      font-size: 30px;
      line-height: 1;
    }

    .empty-label {
      margin: 5px auto 10px;
      max-width: 250px;
    }

    .card-footer {
      border-top: 1px solid var(--vscode-widget-border);
      gap: 8px;
      margin-top: 11px;
      padding-top: 9px;
    }

    .card-footer span:last-child {
      text-align: right;
    }

    .empty-state,
    .error-state {
      border: 1px dashed var(--vscode-widget-border);
      border-radius: 10px;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      padding: 20px 14px;
      text-align: center;
    }

    .error-state {
      border-color: var(--vscode-inputValidation-errorBorder);
    }

    .error-title {
      color: var(--vscode-errorForeground);
      display: block;
      font-size: 12px;
      margin-bottom: 5px;
    }

    .retry-action {
      margin-top: 11px;
    }

    .skeleton-card {
      min-height: 150px;
    }

    .skeleton-line,
    .skeleton-number,
    .skeleton-track {
      animation: pulse 1.4s ease-in-out infinite;
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 5px;
    }

    .skeleton-line {
      height: 9px;
      margin-bottom: 7px;
      width: 55%;
    }

    .skeleton-line.short {
      width: 34%;
    }

    .skeleton-number {
      height: 29px;
      margin: 25px 0 11px;
      width: 72px;
    }

    .skeleton-track {
      height: 5px;
      width: 100%;
    }

    .privacy-note {
      color: var(--vscode-descriptionForeground);
      font-size: 9px;
      line-height: 1.45;
      margin: 14px 3px 0;
      text-align: center;
    }

    .sr-only {
      clip: rect(0, 0, 0, 0);
      height: 1px;
      margin: -1px;
      overflow: hidden;
      position: absolute;
      white-space: nowrap;
      width: 1px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    @keyframes pulse {
      0%, 100% { opacity: 0.45; }
      50% { opacity: 0.9; }
    }

    @media (max-width: 235px) {
      .provider-header,
      .overview-top {
        align-items: flex-start;
        flex-direction: column;
      }

      .provider-state {
        margin-left: 37px;
      }

      .secondary-button {
        width: 100%;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .progress-bar,
      .refresh-icon,
      .skeleton-line,
      .skeleton-number,
      .skeleton-track {
        animation: none !important;
        transition: none !important;
      }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="brand">
      <img class="brand-logo" src="${escapedLogoUri}" alt="">
      <div>
        <div class="eyebrow">Usage dashboard</div>
        <h1>AgentMeter</h1>
      </div>
    </div>
    <button class="refresh-button" id="refresh-button" type="button" aria-label="Refresh usage" title="Refresh usage">
      <span class="refresh-icon" aria-hidden="true">↻</span>
    </button>
  </header>

  <p class="intro">Your remaining AI quota, in one clean view.</p>

  <section class="overview" aria-labelledby="overview-label" aria-live="polite">
    <div class="overview-top">
      <div>
        <div class="section-label" id="overview-label">Provider status</div>
        <div class="overview-value" id="overview-value">Checking providers…</div>
      </div>
      <button class="secondary-button" id="configure-providers" type="button">Set up providers</button>
    </div>
    <div class="overview-meta" id="overview-meta">Reading usage from your connected providers.</div>
  </section>

  <main>
    <h2 class="sr-only">Remaining AI quota by provider</h2>
    <div class="cards" id="cards" aria-live="polite"></div>
  </main>

  <p class="privacy-note">Percentages always mean remaining quota and are never combined. Credentials stay with each provider.</p>

  <script id="dashboard-data" type="application/json" nonce="${nonce}">${serializedDashboard}</script>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const cardsElement = document.getElementById('cards');
    const overviewValueElement = document.getElementById('overview-value');
    const overviewMetaElement = document.getElementById('overview-meta');
    const refreshButton = document.getElementById('refresh-button');
    const configureProvidersButton = document.getElementById('configure-providers');
    const initialDataElement = document.getElementById('dashboard-data');
    let dashboard = JSON.parse(initialDataElement.textContent || '{"cards":[],"generatedAt":""}');

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function formatResetDate(value) {
      if (!value) {
        return 'Reset unavailable';
      }

      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return 'Reset unavailable';
      }

      return 'Resets ' + new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      }).format(date);
    }

    /**
     * Time left in the window. Paired with the remaining percentage this is
     * what makes a burn rate judgeable: 90% left with 6 days to go reads very
     * differently from 90% left with 2 hours to go.
     */
    function formatResetCountdown(value) {
      if (!value) {
        return 'Reset unavailable';
      }

      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return 'Reset unavailable';
      }

      const remainingMinutes = Math.floor((date.getTime() - Date.now()) / 60000);
      if (remainingMinutes <= 0) {
        return 'Resets now';
      }
      if (remainingMinutes < 60) {
        return 'Resets in ' + remainingMinutes + 'm';
      }
      if (remainingMinutes < 1440) {
        return 'Resets in ' + Math.floor(remainingMinutes / 60) + 'h';
      }

      return 'Resets in ' + Math.floor(remainingMinutes / 1440) + 'd';
    }

    /**
     * Providers that push usage instead of being polled can hand back a figure
     * for a window that has since reset. The value stays visible because it is
     * still the last thing the provider said, but it is marked so it is not
     * read as the window running now.
     */
    function renderStaleBadge(quota) {
      return quota.isStale
        ? '<span class="quota-stale" title="Read before this window reset. Open the provider to refresh it.">stale</span>'
        : '';
    }

    function renderResetLabel(className, quota) {
      // The countdown is the readable value; the exact timestamp stays
      // reachable on hover rather than competing for sidebar width.
      return '<span' + (className ? ' class="' + className + '"' : '') +
        ' title="' + escapeHtml(formatResetDate(quota.resetAt)) + '">' +
        escapeHtml(formatResetCountdown(quota.resetAt)) +
      '</span>';
    }

    function formatUpdatedDate(value) {
      if (!value) {
        return 'Not refreshed yet';
      }

      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return 'Not refreshed yet';
      }

      const elapsedMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
      if (elapsedMinutes < 1) {
        return 'Updated just now';
      }
      if (elapsedMinutes < 60) {
        return 'Updated ' + elapsedMinutes + 'm ago';
      }
      if (elapsedMinutes < 1440) {
        return 'Updated ' + Math.floor(elapsedMinutes / 60) + 'h ago';
      }

      return 'Updated ' + new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric'
      }).format(date);
    }

    function formatNumber(value) {
      return typeof value === 'number' && Number.isFinite(value)
        ? new Intl.NumberFormat().format(value)
        : '—';
    }

    function formatLimit(value) {
      return value === 'unlimited' ? 'unlimited' : formatNumber(value);
    }

    function formatUnit(unit) {
      return unit === 'percent' ? '%' : ' ' + escapeHtml(unit);
    }

    function getRemainingPercentage(quota) {
      return typeof quota.remainingPercentage === 'number' && Number.isFinite(quota.remainingPercentage)
        ? Math.min(100, Math.max(0, quota.remainingPercentage))
        : null;
    }

    function getProviderStateLabel(state) {
      const labels = {
        'available': 'Connected',
        'authentication-required': 'Sign in',
        'mock': 'Development',
        'setup-required': 'Set up',
        'stale': 'Stale',
        'unavailable': 'Unavailable',
        'unsupported': 'Unsupported'
      };

      return labels[state] || 'Unknown';
    }

    /**
     * Each provider's own mark, inlined so it needs no image source in the
     * page's Content Security Policy. They are drawn in currentColor, which
     * lets .provider-mark tint them per provider and keeps them legible in
     * both light and dark themes.
     */
    function getProviderMark(tool) {
      const marks = {
        'cursor': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11.503.131L1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23"/></svg>',
        'claude-code': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4.714 15.956l4.718-2.648l.079-.23l-.08-.128h-.23l-.79-.048l-2.695-.073l-2.337-.097l-2.265-.122l-.57-.121l-.535-.704l.055-.353l.48-.321l.685.06l1.518.104l2.277.157l1.651.098l2.447.255h.389l.054-.158l-.133-.097l-.103-.098l-2.356-1.596l-2.55-1.688l-1.336-.972l-.722-.491L2 6.223l-.158-1.008l.656-.722l.88.06l.224.061l.893.686l1.906 1.476l2.49 1.833l.364.304l.146-.104l.018-.072l-.164-.274l-1.354-2.446l-1.445-2.49l-.644-1.032l-.17-.619a3 3 0 0 1-.103-.729L6.287.133L6.7 0l.995.134l.42.364l.619 1.415L9.735 4.14l1.555 3.03l.455.898l.243.832l.09.255h.159V9.01l.127-1.706l.237-2.095l.23-2.695l.08-.76l.376-.91l.747-.492l.583.28l.48.685l-.067.444l-.286 1.851l-.558 2.903l-.365 1.942h.213l.243-.242l.983-1.306l1.652-2.064l.728-.82l.85-.904l.547-.431h1.032l.759 1.129l-.34 1.166l-1.063 1.347l-.88 1.142l-1.263 1.7l-.79 1.36l.074.11l.188-.02l2.853-.606l1.542-.28l1.84-.315l.832.388l.09.395l-.327.807l-1.967.486l-2.307.462l-3.436.813l-.043.03l.049.061l1.548.146l.662.036h1.62l3.018.225l.79.522l.473.638l-.08.485l-1.213.62l-1.64-.389l-3.825-.91l-1.31-.329h-.183v.11l1.093 1.068l2.003 1.81l2.508 2.33l.127.578l-.321.455l-.34-.049l-2.204-1.657l-.85-.747l-1.925-1.62h-.127v.17l.443.649l2.343 3.521l.122 1.08l-.17.353l-.607.213l-.668-.122l-1.372-1.924l-1.415-2.168l-1.141-1.943l-.14.08l-.674 7.254l-.316.37l-.728.28l-.607-.461l-.322-.747l.322-1.476l.388-1.924l.316-1.53l.285-1.9l.17-.632l-.012-.042l-.14.018l-1.432 1.967l-2.18 2.945l-1.724 1.845l-.413.164l-.716-.37l.066-.662l.401-.589l2.386-3.036l1.439-1.882l.929-1.086l-.006-.158h-.055L4.138 18.56l-1.13.146l-.485-.456l.06-.746l.231-.243l1.907-1.312Z"/></svg>',
        'codex': '<svg viewBox="0 0 256 260" aria-hidden="true"><path d="M239.184 106.203a64.72 64.72 0 0 0-5.576-53.103C219.452 28.459 191 15.784 163.213 21.74A65.586 65.586 0 0 0 52.096 45.22a64.72 64.72 0 0 0-43.23 31.36c-14.31 24.602-11.061 55.634 8.033 76.74a64.67 64.67 0 0 0 5.525 53.102c14.174 24.65 42.644 37.324 70.446 31.36a64.72 64.72 0 0 0 48.754 21.744c28.481.025 53.714-18.361 62.414-45.481a64.77 64.77 0 0 0 43.229-31.36c14.137-24.558 10.875-55.423-8.083-76.483m-97.56 136.338a48.4 48.4 0 0 1-31.105-11.255l1.535-.87l51.67-29.825a8.6 8.6 0 0 0 4.247-7.367v-72.85l21.845 12.636c.218.111.37.32.409.563v60.367c-.056 26.818-21.783 48.545-48.601 48.601M37.158 197.93a48.35 48.35 0 0 1-5.781-32.589l1.534.921l51.722 29.826a8.34 8.34 0 0 0 8.441 0l63.181-36.425v25.221a.87.87 0 0 1-.358.665l-52.335 30.184c-23.257 13.398-52.97 5.431-66.404-17.803M23.549 85.38a48.5 48.5 0 0 1 25.58-21.333v61.39a8.29 8.29 0 0 0 4.195 7.316l62.874 36.272l-21.845 12.636a.82.82 0 0 1-.767 0L41.353 151.53c-23.211-13.454-31.171-43.144-17.804-66.405zm179.466 41.695l-63.08-36.63L161.73 77.86a.82.82 0 0 1 .768 0l52.233 30.184a48.6 48.6 0 0 1-7.316 87.635v-61.391a8.54 8.54 0 0 0-4.4-7.213m21.742-32.69l-1.535-.922l-51.619-30.081a8.39 8.39 0 0 0-8.492 0L99.98 99.808V74.587a.72.72 0 0 1 .307-.665l52.233-30.133a48.652 48.652 0 0 1 72.236 50.391zM88.061 139.097l-21.845-12.585a.87.87 0 0 1-.41-.614V65.685a48.652 48.652 0 0 1 79.757-37.346l-1.535.87l-51.67 29.825a8.6 8.6 0 0 0-4.246 7.367zm11.868-25.58L128.067 97.3l28.188 16.218v32.434l-28.086 16.218l-28.188-16.218z"/></svg>'
      };

      return marks[tool] || '';
    }

    function getProviderActionLabel(tool, state) {
      if (state === 'authentication-required') {
        return tool === 'codex' ? 'View sign-in help' : 'Sign in';
      }

      return tool === 'cursor'
        ? 'Configure Cursor'
        : tool === 'claude-code'
          ? 'Configure Claude Code'
          : 'View Codex setup';
    }

    function getProgressMarkup(card, quota) {
      const remainingPercentage = getRemainingPercentage(quota);
      const statusClass = quota.status === 'healthy' ? '' : ' ' + escapeHtml(quota.status);
      if (remainingPercentage === null) {
        return '<div class="progress-track indeterminate" role="progressbar" aria-label="' + escapeHtml(card.name) + ' remaining quota unavailable">' +
          '<div class="progress-bar unknown"></div>' +
        '</div>';
      }

      // The page's CSP names a nonce for styles, which blocks style
      // attributes in markup. A bar written that way silently loses its width
      // and, being a block element, fills its whole track, so every quota
      // reads as full. The width travels as data instead and is applied
      // through the CSSOM below, which the policy does allow.
      return '<div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + remainingPercentage + '" aria-label="' + escapeHtml(card.name) + ' remaining quota">' +
        '<div class="progress-bar' + statusClass + '" data-remaining="' + remainingPercentage + '"></div>' +
      '</div>';
    }

    function applyProgressWidths() {
      const bars = cardsElement.querySelectorAll('.progress-bar[data-remaining]');
      for (const bar of bars) {
        bar.style.width = bar.getAttribute('data-remaining') + '%';
      }
    }

    function formatQuotaLabel(quota) {
      return quota.scopeLabel
        ? quota.scopeLabel + ' · ' + quota.periodLabel
        : quota.periodLabel;
    }

    function getHeadlineQuota(quotas) {
      return quotas.filter(function(quota) { return quota.isHeadline; })[0] || quotas[0];
    }

    /**
     * Providers can report several quota pools that share a window length, so
     * rows are grouped by pool to keep identical window labels apart.
     */
    function groupQuotasByScope(quotas) {
      const order = [];
      const byScope = new Map();

      quotas.forEach(function(quota) {
        const scope = quota.scopeLabel || '';
        if (!byScope.has(scope)) {
          byScope.set(scope, []);
          order.push(scope);
        }
        byScope.get(scope).push(quota);
      });

      return order.map(function(scope) {
        return { scope: scope, quotas: byScope.get(scope) };
      });
    }

    function getQuotaDetail(quota) {
      if (quota.remaining === 'unlimited') {
        return 'No provider limit reported';
      }
      if (quota.remaining === null) {
        return 'Remaining quota unavailable';
      }
      if (quota.unit === 'percent') {
        return '';
      }

      return formatNumber(quota.remaining) + formatUnit(quota.unit) + ' left of ' + formatLimit(quota.limit) + formatUnit(quota.unit);
    }

    function renderPrimaryQuota(card, quota) {
      const remainingPercentage = getRemainingPercentage(quota);
      const quotaDetail = getQuotaDetail(quota);
      const metricValue = quota.remaining === 'unlimited'
        ? '∞'
        : remainingPercentage === null
          ? '—'
          : formatNumber(remainingPercentage) + '%';
      const metricUnit = quota.remaining === 'unlimited' ? 'available' : 'remaining';

      return '<section class="primary-quota">' +
        '<div class="metric-row">' +
          '<div class="metric">' +
            '<span class="metric-value">' + metricValue + '</span>' +
            '<span class="metric-unit">' + metricUnit + '</span>' +
          '</div>' +
          renderResetLabel('reset-label', quota) +
        '</div>' +
        '<div class="quota-heading">' +
          '<span class="quota-name">' + escapeHtml(formatQuotaLabel(quota)) + renderStaleBadge(quota) + '</span>' +
          '<span class="quota-percent">' + (remainingPercentage === null ? '—' : formatNumber(remainingPercentage) + '% left') + '</span>' +
        '</div>' +
        getProgressMarkup(card, quota) +
        (quotaDetail ? '<div class="quota-detail">' + quotaDetail + '</div>' : '') +
      '</section>';
    }

    function renderSecondaryQuota(card, quota, label, hideReset) {
      const remainingPercentage = getRemainingPercentage(quota);
      const quotaDetail = getQuotaDetail(quota);
      const meta = [];

      if (quotaDetail) {
        meta.push('<span>' + quotaDetail + '</span>');
      }
      if (!hideReset) {
        meta.push(renderResetLabel('', quota));
      }

      return '<div class="secondary-quota">' +
        '<div class="quota-heading">' +
          '<span class="quota-name">' + escapeHtml(label) + renderStaleBadge(quota) + '</span>' +
          '<span class="quota-percent">' + (remainingPercentage === null ? '—' : formatNumber(remainingPercentage) + '% left') + '</span>' +
        '</div>' +
        getProgressMarkup(card, quota) +
        (meta.length ? '<div class="quota-meta">' + meta.join('') + '</div>' : '') +
      '</div>';
    }

    /**
     * Cursor meters both of its pools against one billing cycle, so every row
     * would repeat the same countdown. When a card resets as a whole, the
     * countdown on the leading row already covers every bar below it.
     */
    function sharesOneResetTime(quotas) {
      return quotas.length > 1 && quotas.every(function(quota) {
        return quota.resetAt === quotas[0].resetAt;
      });
    }

    function renderQuotaGroup(card, group, hideReset) {
      // A pool heading only earns its own line when it covers several windows.
      if (group.scope && group.quotas.length > 1) {
        return '<div class="quota-scope">' + escapeHtml(group.scope) + '</div>' +
          group.quotas.map(function(quota) {
            return renderSecondaryQuota(card, quota, quota.periodLabel, hideReset);
          }).join('');
      }

      return group.quotas.map(function(quota) {
        return renderSecondaryQuota(card, quota, formatQuotaLabel(quota), hideReset);
      }).join('');
    }

    function renderSkeletons() {
      return [1, 2, 3].map(function() {
        return '<article class="card skeleton-card" aria-hidden="true">' +
          '<div class="skeleton-line"></div>' +
          '<div class="skeleton-line short"></div>' +
          '<div class="skeleton-number"></div>' +
          '<div class="skeleton-track"></div>' +
        '</article>';
      }).join('');
    }

    function renderProviderCard(card) {
      const quotas = card.quotas || [];
      const hasUsage = quotas.length > 0;
      const isCurrent = card.providerState === 'available' || card.providerState === 'mock';
      const isReporting = isCurrent || card.providerState === 'stale';
      const headlineQuota = hasUsage ? getHeadlineQuota(quotas) : null;
      const supportingQuotas = quotas.filter(function(quota) {
        return quota !== headlineQuota;
      });
      const primaryQuotaMarkup = headlineQuota ? renderPrimaryQuota(card, headlineQuota) : '';
      const hideRepeatedReset = sharesOneResetTime(card.quotas);
      const secondaryQuotaMarkup = supportingQuotas.length
        ? '<div class="secondary-quotas">' + groupQuotasByScope(supportingQuotas).map(function(group) {
            return renderQuotaGroup(card, group, hideRepeatedReset);
          }).join('') + '</div>'
        : '';
      const noteMarkup = card.message && isReporting
        ? '<div class="provider-note">' + escapeHtml(card.message) + '</div>'
        : '';
      const unavailableMarkup = hasUsage
        ? ''
        : '<div class="empty-provider">' +
            '<div class="empty-metric" aria-hidden="true">—</div>' +
            '<div class="empty-label">' + escapeHtml(card.message || 'Usage is not available for this provider yet.') + '</div>' +
            '<button class="primary-button provider-action" type="button" data-provider="' + escapeHtml(card.tool) + '">' +
              escapeHtml(getProviderActionLabel(card.tool, card.providerState)) +
            '</button>' +
          '</div>';
      const staleActionMarkup = card.providerState === 'stale'
        ? '<button class="secondary-button provider-action" type="button" data-provider="' + escapeHtml(card.tool) + '">' +
            escapeHtml(getProviderActionLabel(card.tool, card.providerState)) +
          '</button>'
        : '';

      return '<article class="card">' +
        '<div class="provider-header">' +
          '<div class="provider-identity">' +
            '<span class="provider-mark ' + escapeHtml(card.tool) + '" aria-hidden="true">' + getProviderMark(card.tool) + '</span>' +
            '<div>' +
              '<div class="tool-name">' + escapeHtml(card.name) + '</div>' +
              '<div class="tool-description">' + escapeHtml(card.description) + '</div>' +
            '</div>' +
          '</div>' +
          '<span class="provider-state ' + escapeHtml(card.providerState) + '">' +
            '<span class="state-dot" aria-hidden="true"></span>' +
            escapeHtml(getProviderStateLabel(card.providerState)) +
          '</span>' +
        '</div>' +
        primaryQuotaMarkup +
        secondaryQuotaMarkup +
        unavailableMarkup +
        noteMarkup +
        staleActionMarkup +
        '<div class="card-footer">' +
          '<span>' + escapeHtml(card.sourceLabel) + '</span>' +
          '<span>' + formatUpdatedDate(card.updatedAt) + '</span>' +
        '</div>' +
      '</article>';
    }

    function setRefreshing(isRefreshing) {
      refreshButton.disabled = isRefreshing;
      refreshButton.classList.toggle('is-refreshing', isRefreshing);
      refreshButton.setAttribute('aria-busy', String(isRefreshing));
    }

    function render(nextDashboard) {
      dashboard = nextDashboard;
      const cards = dashboard.cards || [];

      if (!cards.length && !dashboard.generatedAt) {
        overviewValueElement.textContent = 'Checking providers…';
        overviewMetaElement.textContent = 'Reading usage from your connected providers.';
        cardsElement.innerHTML = renderSkeletons();
        setRefreshing(true);
        return;
      }

      const reportingCards = cards.filter(function(card) {
        return card.providerState === 'available' || card.providerState === 'mock' || card.providerState === 'stale';
      });
      const attentionCount = Math.max(0, cards.length - reportingCards.length);
      overviewValueElement.textContent = reportingCards.length === cards.length && cards.length > 0
        ? 'All providers reporting'
        : reportingCards.length + ' of ' + cards.length + ' providers reporting';
      overviewMetaElement.textContent = attentionCount
        ? attentionCount + (attentionCount === 1 ? ' provider needs attention' : ' providers need attention') + ' · ' + formatUpdatedDate(dashboard.generatedAt)
        : 'All values show remaining quota · ' + formatUpdatedDate(dashboard.generatedAt);

      cardsElement.innerHTML = cards.length
        ? cards.map(renderProviderCard).join('')
        : '<div class="empty-state">No providers were found. Use setup to connect one.</div>';
      applyProgressWidths();
      setRefreshing(false);
    }

    function requestRefresh() {
      setRefreshing(true);
      vscode.postMessage({ command: 'refresh' });
    }

    refreshButton.addEventListener('click', requestRefresh);

    configureProvidersButton.addEventListener('click', function() {
      vscode.postMessage({ command: 'configureProviders' });
    });

    cardsElement.addEventListener('click', function(event) {
      const actionTarget = event.target instanceof Element
        ? event.target.closest('.provider-action')
        : null;
      const provider = actionTarget && actionTarget.getAttribute('data-provider');
      if (provider) {
        vscode.postMessage({ command: 'configureProvider', provider: provider });
        return;
      }

      const retryTarget = event.target instanceof Element
        ? event.target.closest('.retry-action')
        : null;
      if (retryTarget) {
        requestRefresh();
      }
    });

    window.addEventListener('message', function(event) {
      if (event.data && event.data.type === 'dashboardUpdated') {
        render(event.data.dashboard);
      }

      if (event.data && event.data.type === 'dashboardError') {
        cardsElement.innerHTML = '<div class="error-state">' +
          '<strong class="error-title">Usage could not be refreshed</strong>' +
          '<span>' + escapeHtml(event.data.message) + '</span><br>' +
          '<button class="primary-button retry-action" type="button">Try again</button>' +
        '</div>';
        overviewMetaElement.textContent = 'The last available values may be out of date.';
        setRefreshing(false);
      }
    });

    render(dashboard);
    // Collection can finish before this document's message listener exists.
    // Ask the host to replay its latest snapshot after the page is ready.
    vscode.postMessage({ command: 'ready' });
  </script>
</body>
</html>`;
}

function getNonce(): string {
  return randomBytes(16).toString('base64');
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
