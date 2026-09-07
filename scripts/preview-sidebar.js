/**
 * Renders the sidebar to a standalone HTML file so card layout can be eyeballed
 * in a browser without installing the extension. Build the bundle it reads with:
 *
 *   npx esbuild src/presentation/sidebar/webviewContent.ts --bundle \
 *     --platform=node --external:vscode --outfile=out/preview-bundle.js
 */
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { getWebviewContent } = require('../out/preview-bundle.js');

const iso = (d) => new Date(Date.now() + d * 3_600_000).toISOString();

function quota(over) {
  return {
    id: 'q',
    used: 30,
    limit: 100,
    remaining: 70,
    unit: 'percent',
    scopeLabel: null,
    periodLabel: 'window',
    isHeadline: false,
    isStale: false,
    resetAt: iso(48),
    updatedAt: iso(0),
    usedPercentage: 30,
    remainingPercentage: 70,
    status: 'healthy',
    ...over,
  };
}

const dashboard = {
  generatedAt: iso(0),
  cards: [
    {
      tool: 'cursor',
      name: 'Cursor',
      description: 'AI-first code editor',
      providerState: 'available',
      message: null,
      sourceLabel: 'Cursor API',
      updatedAt: iso(0),
      status: 'healthy',
      quotas: [
        quota({
          id: 'cursor:primary',
          scopeLabel: 'Other Models pool',
          periodLabel: 'Billing cycle',
          remainingPercentage: 81,
          resetAt: iso(216),
        }),
        quota({
          id: 'cursor:cursor-models',
          scopeLabel: 'Cursor Models pool',
          periodLabel: 'Billing cycle',
          isHeadline: true,
          remainingPercentage: 34,
          status: 'attention',
          resetAt: iso(216),
        }),
      ],
    },
    {
      tool: 'claude-code',
      name: 'Claude Code',
      description: 'Anthropic coding agent',
      providerState: 'available',
      message: null,
      sourceLabel: 'Local collector',
      updatedAt: iso(0),
      status: 'healthy',
      quotas: [
        quota({
          id: 'claude-code:seven-day',
          periodLabel: '7-day window',
          isHeadline: true,
          remainingPercentage: 62,
          resetAt: iso(96),
        }),
        quota({
          id: 'claude-code:five-hour',
          periodLabel: '5-hour window',
          isStale: true,
          remainingPercentage: 20,
          status: 'attention',
          resetAt: iso(-3),
        }),
      ],
    },
    {
      tool: 'codex',
      name: 'Codex',
      description: 'OpenAI coding agent',
      providerState: 'available',
      message: null,
      sourceLabel: 'Local collector',
      updatedAt: iso(0),
      status: 'healthy',
      quotas: [
        quota({
          id: 'codex:primary',
          periodLabel: '1-week window',
          isHeadline: true,
          remainingPercentage: 49,
          resetAt: iso(120),
        }),
      ],
    },
  ],
};

const html = getWebviewContent(
  { cspSource: 'vscode-webview://preview' },
  dashboard,
  pathToFileURL(join(__dirname, '..', 'media', 'icon.png')).href,
);

// Stand in for the tokens VS Code injects, so the preview is representative.
const theme = `<style>
:root {
  --vscode-font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --vscode-font-size: 13px;
  --vscode-foreground: #cccccc;
  --vscode-editor-background: #1f1f1f;
  --vscode-sideBar-background: #181818;
  --vscode-descriptionForeground: #9d9d9d;
  --vscode-widget-border: #3c3c3c;
  --vscode-textLink-foreground: #4daafc;
  --vscode-charts-orange: #d97757;
  --vscode-charts-green: #89d185;
  --vscode-charts-red: #f14c4c;
  --vscode-charts-yellow: #cca700;
  --vscode-button-background: #0078d4;
  --vscode-button-foreground: #ffffff;
  --vscode-button-secondaryBackground: #313131;
  --vscode-button-secondaryForeground: #cccccc;
  --vscode-toolbar-hoverBackground: #383838;
  --vscode-textBlockQuote-background: #2a2a2a;
  --vscode-textBlockQuote-border: #4a4a4a;
  --vscode-testing-iconPassed: #73c991;
  --vscode-editorWarning-foreground: #cca700;
  --vscode-errorForeground: #f14c4c;
}
body { background: #181818; width: 380px; }
</style>`;

// The page's CSP is kept, because it is part of what the sidebar has to work
// within: it names a nonce for styles, which blocks style attributes in
// markup. Stripping it here once hid a bug where every progress bar rendered
// full. The preview's own additions borrow the page's nonce, and img-src
// gains file: so the logo loads from disk rather than a webview URL.
const nonce = /nonce="([^"]+)"/.exec(html)?.[1];
if (!nonce) {
  throw new Error('Could not read the nonce from the generated page.');
}

// The webview script expects a host bridge that a plain browser has no idea
// about, so it is stubbed out.
const shim = `<script nonce="${nonce}">window.acquireVsCodeApi=function(){return{postMessage:function(){},getState:function(){},setState:function(){}};};</script>`;

writeFileSync(
  process.argv[2] ?? '/tmp/sidebar-preview.html',
  html
    .replace(/img-src [^;]+;/, 'img-src file:;')
    .replace('</head>', `${theme.replace('<style>', `<style nonce="${nonce}">`)}${shim}</head>`),
);
