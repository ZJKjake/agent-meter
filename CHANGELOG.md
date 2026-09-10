# Changelog

All notable AgentMeter changes are documented here.

## 0.1.3

### Source updates (not yet published)

- Resolve Cursor authentication from the current application data directory,
  including named editor profiles and custom user-data directories.

- Collect Cursor usage from the desktop even in SSH workspaces through a
  required desktop companion.
- Show one card per provider. Claude Code and Codex follow the active workspace's
  account, and setup automatically targets the same machine.
- Validate usage sent between extension hosts and restore timestamps after
  transport. Keep credentials on their originating machines.
- Recover desktop collection on later refreshes without hiding workspace data.
- Discover common per-user Codex installs with limited SSH/GUI PATHs and repeat
  discovery on refresh so newly installed CLIs can be found.
- Isolate malformed provider responses and bound both desktop and workspace
  collection timeouts. Handle malformed or terminated Codex app-server processes.
- Replay the latest usage after the sidebar finishes loading so early updates
  cannot leave the dashboard empty.

### Published 2026-09-07

- Report two quota bars per provider. Codex and Claude Code show a 5-hour and
  a weekly window; Cursor shows its Cursor Models and Other Models pools.
- Name the quota pool each window belongs to, so a provider that reports two
  pools with the same window length no longer shows two identical labels. This
  fixes Codex showing two rows both labeled `1-week window`.
- Stop reporting Codex model-specific limits. They are sub-limits of the same
  plan allowance, so showing them beside the general limit invited adding up
  quotas that overlap.
- Merge the Codex `rateLimits` and `rateLimitsByLimitId` views so the general
  limit is listed once.
- Choose the compact status-bar value by depletion rather than by response
  order, so a window that just reset can no longer hide a quota that is nearly
  spent. Codex also no longer alternates between two correct values across
  refreshes.
- Qualify the compact value with its window when a provider meters several,
  as in `Claude Code 26% (5-hour)`. The value shows whichever quota is closest
  to running out, so a shorter window can overtake a longer one between
  refreshes; naming it keeps a number that moved for that reason from reading
  as usage that suddenly jumped. Pools are left unnamed: a provider that
  splits one window across pools always leads with the same window, so the
  value never changes period underneath the reader.
- Mark a Claude Code window stale once it has reset since the cached value was
  read, instead of marking the whole provider stale after a fixed interval.
  Claude only writes the cache while it renders a status line, so age alone
  said nothing about whether a figure was still current.
- Stop showing Cursor's `totalPercentUsed` roll-up as a third bar beside the
  Cursor Models and Other Models pools it already summarizes.
- Drop the note shown on a working Cursor card. It repeated a disclosure the
  opt-in dialog already makes, in a block styled like a call-out, so healthy
  data looked like something had gone wrong.
- Rename the Cursor source label from `Experimental private adapter` to
  `Cursor API`.
- Rewrite the status-bar tooltip. It now lists every quota a provider reports
  rather than only the one behind the compact percentage, and separates
  providers with blank lines. Each row names its quota by the single label
  that sets it apart from its siblings — the pool where a provider splits one
  window across pools, the window otherwise — and carries its own countdown,
  since plain text gives a row no visual grouping to lean on. The per-provider
  `Source:` line is gone; the sidebar is where that detail belongs.
- Show Claude Code's 5-hour window only once it is at least half spent, and
  hide a 5-hour reading whose window has already reset. The weekly window is
  always shown. The 5-hour limit is the one that cuts a session off, so it is
  kept for the moment it can bind rather than held on screen while quiet, and
  a stale reading of it would report usage the window no longer holds.
  Provider staleness is still judged across every window Claude reports, so
  hiding a quiet one cannot make a live provider look stale, and the filter
  never removes the last reading a provider has.
- Order provider cards by setup rather than by a fixed list. Cursor stays on
  top, then the providers that have reported, in the order they first did so,
  then the ones still to be set up in their declared order — Claude Code
  before Codex. The moment a provider first reports is recorded once in global
  state, so a card keeps its place afterwards: ordering on current state
  instead would shuffle the panel whenever a provider briefly failed. The
  status bar and its tooltip follow the same order, so the two surfaces cannot
  disagree about where a provider sits.
- Fix every sidebar progress bar rendering full regardless of the quota. The
  page's CSP names a nonce for styles and omits `'unsafe-inline'`, so the
  `style="width: N%"` the bar carried was discarded; left without a width, a
  block element stretches to fill its track. Widths now travel as data and are
  applied through the CSSOM, which the policy allows. The bar also starts at
  zero width, so a width that fails to apply reads as an obvious fault rather
  than as a full quota.
- Keep the CSP in the sidebar preview script. Stripping it made the preview
  accept markup the real webview rejects, which is what hid the bar bug.
- Drop the `AgentMeter` heading from the status-bar tooltip. The status bar
  item the hover belongs to already carries the name, so the tooltip opens on
  the first provider.
- Fix quota rows running together on one line in the status-bar tooltip. The
  tooltip is rendered as Markdown, which folds a lone newline into a space, so
  rows only broke where a blank line separated providers. Rows now end in a
  Markdown hard break, and provider names are bold to set them off from the
  quotas beneath them.
- Stop prefixing setup messages with the state that is already displayed
  beside them, so a provider no longer reads `Setup required. Setup required.`
- Replace the `C`, `CC`, and `X` placeholder initials with each provider's own
  mark, inlined as SVG so it needs no image source in the page's Content
  Security Policy and follows the theme's foreground color.
- Show one reset countdown per card when every quota resets together, instead
  of repeating the same billing-cycle date on each Cursor pool.
- Describe Claude Code as `Anthropic coding agent`, matching how Codex is
  described as `OpenAI coding agent`.
- Draw the progress track in a neutral color. It previously used
  `progressBar.background`, which is VS Code's blue progress fill, so a bar at
  any level read as solid blue instead of showing the remaining share.
- Show reset times as time remaining in the window, such as `Resets in 6d`,
  with the exact timestamp available on hover.

## 0.1.2 — 2026-08-25

- Refresh provider usage automatically every five minutes and when the editor
  regains focus, with a configurable interval.
- Report the installed extension version accurately to local provider clients.
- Align the packaged extension identity with the transferred and verified
  `zjkjake.agentmeter` Open VSX listing.
- Clean up release metadata and documentation.

## 0.1.1 — 2026-08-21

- Show remaining percentage consistently in the status bar and sidebar.
- Replace production mock values with explicit provider setup states.
- Add real Codex collection, the Claude Code status-line bridge, and an opt-in
  experimental Cursor personal-plan adapter.
- Add AgentMeter marketplace, Activity Bar, sidebar, and status-bar branding.
- Add production packaging, CI, privacy documentation, and security tests.

## 0.1.0

- Initial Open VSX release.
