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
Usage refreshes every five minutes by default and whenever the editor regains
focus. The interval can be changed in AgentMeter settings.

## Provider support

- **Cursor personal plans:** optional experimental/private adapter. It reads
  Cursor's local session read-only and requests current usage directly from
  Cursor. It is disabled by default because Cursor does not publish a stable
  personal usage API.
- **Claude Code:** official status-line JSON is sanitized into a local cache.
  Five-hour and seven-day limits are supported when Claude provides them.
- **Codex:** the local Codex app-server reports the general rate limit's
  windows. Model-specific limits are read but not shown. Authentication
  remains owned by the Codex CLI.

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

How many bars a provider shows depends on what it meters, and each bar is
labeled with whatever distinguishes it from its siblings.

Cursor splits one window across two pools, so it shows the Cursor Models and
Other Models pools, labeled by pool. Codex meters one pool over its reported
windows, labeled by window; plans currently expose a single weekly window, and
a second appears on its own if Codex starts reporting one.

Claude Code meters one pool over a 5-hour and a seven-day window. The weekly
window is always shown, since it drains slowly enough to read days ahead. The
5-hour window appears only once it is at least half spent: it is the limit
that cuts a session off, but below that mark it competes for attention with
the figure that matters. A 5-hour reading whose window has already reset is
hidden as well, because it reports usage that window no longer holds and a
high value there would raise a false alarm.

Codex also reports model-specific limits, such as a per-model weekly cap. They
are not shown. A model limit is a sub-limit of the same plan allowance rather
than a budget of its own, so listing it beside the general limit would invite
adding up quotas that overlap.

The status bar has room for one number per provider, so it shows whichever bar
is closest to running out — the constraint that will stop you first. When that
is not the bar the provider leads with, the value is qualified, as in
`Codex 4% (1-week)`, so a number that changes because a different window became
binding does not read as noise.

Reset times are shown as time remaining in the window, with the exact timestamp
on hover.

Claude Code pushes usage only while it renders a status line, so a cached
figure can outlive the window it was read in. Any window that has reset since
it was read keeps its last known value but is marked stale, and it never drives
the compact value while a current figure exists.

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

Cursor currently exposes separate Cursor Models and Other Models pools, and
both appear in the sidebar. The Other Models pool is the compact primary value
when it is present. Cursor's `totalPercentUsed` roll-up is not shown as a
third bar, because it summarizes the two pools rather than adding a new one. This adapter is not an official Cursor
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
cursor --install-extension ./agentmeter-0.1.2.vsix
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
