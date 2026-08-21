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
      color: var(--vscode-textLink-foreground);
      display: inline-flex;
      flex: 0 0 auto;
      font-size: 9px;
      font-weight: 750;
      height: 29px;
      justify-content: center;
      letter-spacing: -0.02em;
      width: 29px;
    }

    .provider-mark.claude-code {
      color: var(--vscode-charts-orange, var(--vscode-textLink-foreground));
    }

    .provider-mark.codex {
      color: var(--vscode-charts-green, var(--vscode-textLink-foreground));
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

    .progress-track {
      background: var(--vscode-progressBar-background);
      border-radius: 999px;
      height: 5px;
      overflow: hidden;
      width: 100%;
    }

    .progress-track.indeterminate {
      opacity: 0.55;
    }

    .progress-bar {
      background: var(--vscode-textLink-foreground);
      border-radius: inherit;
      height: 100%;
      transition: width 160ms ease;
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
        <div class="eyebrow">Local usage dashboard</div>
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
    <div class="overview-meta" id="overview-meta">Reading usage from local provider integrations.</div>
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

    function getProviderMark(tool) {
      return tool === 'cursor' ? 'C' : tool === 'claude-code' ? 'CC' : 'X';
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

      return '<div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + remainingPercentage + '" aria-label="' + escapeHtml(card.name) + ' remaining quota">' +
        '<div class="progress-bar' + statusClass + '" style="width: ' + remainingPercentage + '%"></div>' +
      '</div>';
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
          '<span class="reset-label">' + formatResetDate(quota.resetAt) + '</span>' +
        '</div>' +
        '<div class="quota-heading">' +
          '<span class="quota-name">' + escapeHtml(quota.periodLabel) + '</span>' +
          '<span class="quota-percent">' + (remainingPercentage === null ? '—' : formatNumber(remainingPercentage) + '% left') + '</span>' +
        '</div>' +
        getProgressMarkup(card, quota) +
        (quotaDetail ? '<div class="quota-detail">' + quotaDetail + '</div>' : '') +
      '</section>';
    }

    function renderSecondaryQuota(card, quota) {
      const remainingPercentage = getRemainingPercentage(quota);
      const quotaDetail = getQuotaDetail(quota);
      return '<div class="secondary-quota">' +
        '<div class="quota-heading">' +
          '<span class="quota-name">' + escapeHtml(quota.periodLabel) + '</span>' +
          '<span class="quota-percent">' + (remainingPercentage === null ? '—' : formatNumber(remainingPercentage) + '% left') + '</span>' +
        '</div>' +
        getProgressMarkup(card, quota) +
        '<div class="quota-meta">' +
          (quotaDetail ? '<span>' + quotaDetail + '</span>' : '') +
          '<span>' + formatResetDate(quota.resetAt) + '</span>' +
        '</div>' +
      '</div>';
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
      const primaryQuotaMarkup = hasUsage ? renderPrimaryQuota(card, quotas[0]) : '';
      const secondaryQuotaMarkup = quotas.length > 1
        ? '<div class="secondary-quotas">' + quotas.slice(1).map(function(quota) {
            return renderSecondaryQuota(card, quota);
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
        overviewMetaElement.textContent = 'Reading usage from local provider integrations.';
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
