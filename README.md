# AgentMeter

AgentMeter is a local-first VS Code/Cursor extension that shows how much AI
coding quota you have **remaining**. It never combines unrelated provider
limits into one misleading score.

The compact status bar looks like:

```text
◌ AgentMeter · Cursor 81% · Claude Code 32% · Codex 75%
```

The sidebar shows full provider names, every available quota window, reset
times, data sources, provider states, and last-updated timestamps.

## Provider support

- **Cursor personal plans:** optional experimental/private adapter. It reads
  Cursor's local session read-only and requests current usage directly from
  Cursor. It is disabled by default because Cursor does not publish a stable
  personal usage API.
- **Claude Code:** official status-line JSON is sanitized into a local cache.
  Five-hour and seven-day limits are supported when Claude provides them.
- **Codex:** the local Codex app-server reports all available rate-limit
  windows. Authentication remains owned by the Codex CLI.

A fresh installation never displays sample usage. Providers explicitly show
`Connected`, `Setup required`, `Sign-in required`, `Unsupported`,
`Unavailable`, `Stale data`, or `Mock/development data`. Missing or broken
integrations display `—` rather than zero or a guessed value.

## Remaining-percentage semantics

All AgentMeter presentation surfaces show remaining percentage:

```text
remaining percentage = 100 - used percentage
```

For example, Cursor reporting `19%` used becomes `81% remaining`. The same
normalized value is used by the status bar, sidebar progress bars, tooltips,
and provider details. The sidebar can still display multiple independent
windows; AgentMeter does not average them.

## Configure providers

Open the Command Palette and run `AgentMeter: Configure Providers`, or use the
button on the AgentMeter dashboard.

### Cursor personal usage (experimental/private)

Run `AgentMeter: Configure Cursor (Experimental)` and review the opt-in warning.
When enabled, the adapter:

- opens Cursor's local `state.vscdb` database read-only;
- reads only `cursorAuth/accessToken` for the duration of a refresh;
- sends that token only to `https://api2.cursor.sh` over HTTPS;
- never writes, caches, logs, or uploads the token elsewhere;
- strictly validates Cursor's response and falls back to `—` if the private
  endpoint or schema changes.

Cursor currently exposes separate Cursor Models and Other Models pools. The
Other Models pool is the compact primary value when it is present; all
reported pools appear in the sidebar. This adapter is not an official Cursor
API integration and can stop working without notice. Disable it at any time by
running the same configuration command.

### Claude Code

Run `AgentMeter: Configure Claude Code`. AgentMeter installs a stable local
bridge at `~/.agentmeter/claude-statusline-bridge.js`, preserves unrelated
Claude settings, and creates a timestamped backup before replacing an existing
`statusLine`.

Claude sends its official status-line JSON to the bridge through stdin. The
bridge stores only rate-limit percentages, reset timestamps, and a cache
timestamp in `~/.agentmeter/claude-code-usage.json`. Session IDs, transcript
paths, project paths, prompts, and credentials are discarded. Old cache data
is visibly marked stale.

### Codex

Install the Codex CLI and run `codex login`, then refresh AgentMeter. AgentMeter
starts `codex app-server --stdio` locally, reads the documented rate-limit
response, and closes the process. It never reads or stores Codex credentials.

## Privacy and security

AgentMeter has no telemetry, analytics, account backend, or third-party data
service. Provider usage stays in the extension process except for the Claude
sanitized cache described above.

- No publishing, provider, or session token is included in logs.
- No mock collector is wired into production.
- Cursor's private adapter is opt-in, read-only, HTTPS-only, and host-locked to
  `api2.cursor.sh`.
- Claude and Codex authentication remain owned by their local tools.
- Webview content uses a restrictive Content Security Policy and escaped
  provider data.

## Development

Requirements: Node.js 22 and VS Code 1.85+.

```bash
npm ci
npm run build
npm test
npm run package
```

Press `F5` in VS Code to launch an Extension Development Host. The production
dependency wiring is in `src/extension.ts`. Development-only mock collectors
remain available for isolated tests and previews, but are labeled
`Mock/development data` and are never imported by production wiring.

The code is organized around a provider-independent usage model:

```text
src/
├── application/       Dashboard use cases and normalization
├── domain/            Usage records, provider states, and view models
├── infrastructure/
│   ├── claude/        Claude status-line bridge, cache, and settings
│   ├── collectors/    Cursor, Claude Code, and Codex collectors
│   └── usage/         Collector repository and development-only mocks
├── presentation/      Status bar and sidebar UI
└── extension.ts       Production activation and provider setup commands
```

## Install and publish

Install a local build in Cursor:

```bash
cursor --install-extension ./agentmeter-0.1.1.vsix
```

Publish to Open VSX from a trusted terminal or CI secret store:

```bash
export OVSX_PAT="your-token"
npm run publish:open-vsx
unset OVSX_PAT
```

The `ovsx` publisher is pinned in `devDependencies`; the publish script does
not download an arbitrary package at publish time. It removes `OVSX_PAT` from
the build and packaging environment, then exposes it only to the final `ovsx`
process. Never commit `OVSX_PAT` or any other credential.
