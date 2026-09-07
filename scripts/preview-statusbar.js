/**
 * Prints the status bar text and hover tooltip for a representative dashboard,
 * so the wording can be read as the user sees it. Build the bundle it reads:
 *
 *   npx esbuild src/presentation/statusBar/statusBarFormatter.ts --bundle \
 *     --platform=node --external:vscode --outfile=out/statusbar-bundle.js
 */
const { formatStatusBar } = require('../out/statusbar-bundle.js');

// One base instant for the whole fixture. Recomputing per call lands quotas
// that share a reset on opposite sides of a day boundary.
const BASE = Date.now();
const iso = (hours) => new Date(BASE + hours * 3_600_000).toISOString();

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

const view = formatStatusBar({
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
          scopeLabel: 'Other Models pool',
          periodLabel: 'Billing cycle',
          isHeadline: true,
          remainingPercentage: 70,
          resetAt: iso(192),
        }),
        quota({
          scopeLabel: 'Cursor Models pool',
          periodLabel: 'Billing cycle',
          remainingPercentage: 99,
          resetAt: iso(192),
        }),
      ],
    },
    {
      tool: 'claude-code',
      name: 'Claude Code',
      description: 'Anthropic coding agent',
      providerState: 'setup-required',
      message: 'Run AgentMeter: Configure Claude Code to show usage.',
      sourceLabel: 'Setup required',
      updatedAt: null,
      status: 'unknown',
      quotas: [],
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
          periodLabel: '1-week window',
          isHeadline: true,
          remainingPercentage: 47,
          resetAt: iso(96),
        }),
      ],
    },
  ],
});

console.log('STATUS BAR:');
console.log(view.text);

// The status bar hands the tooltip to a Markdown renderer, so previewing the
// raw string would show breaks that the hover does not actually make. Render
// it and turn the result back into lines to see the layout the user gets.
const markdown = require('markdown-it')({ html: false });
const rendered = markdown
  .render(view.tooltip)
  // A <br> already carries a newline after it in the output, so consume that
  // newline too rather than counting the same break twice.
  .replace(/<br\s*\/?>\n?/g, '\n')
  .replace(/<\/p>/g, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

console.log('\nTOOLTIP (rendered):');
console.log('┌' + '─'.repeat(62));
for (const line of rendered.split('\n')) {
  console.log(`│ ${line}`);
}
console.log('└' + '─'.repeat(62));
console.log(`\nseverity: ${view.severity}`);
