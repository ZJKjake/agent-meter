# Editor integration checks

Run `npm test` for the automated suite and `npm run package` to build the main
extension and its desktop companion. The shared `.vscode/launch.json` starts
both packages in an Extension Development Host after building them.

`run.cjs` runs inside the real editor extension host. It checks activation,
normalized desktop responses, timestamp transport, and exactly one card for each
provider. Cursor uses the desktop account; Claude Code and Codex use the active
workspace's account. A missing remote provider must not fall back to local usage.

A small development extension can call the runner from its activation callback:

```js
exports.activate = () => require('/path/to/agent-meter/test/integration/run.cjs').run({
  requireAvailable: ['local:cursor', 'local:codex'],
  dataProvenance: 'Live signed-in test accounts',
  reportPath: '/path/to/disposable-workspace/report.json',
});
```

Use `workspace:codex` and `workspace:claude-code` for remote quota assertions.
`requireStates` maps the same keys to expected provider states. Reports contain
sanitized states, counts, assertions, and the main bundle hash. `wiringPassed`
alone does not establish live usage; `available` from a fixture is not a live
subscription test. Set `dataProvenance` explicitly for every scenario.

For an SSH test driver, use a development URI such as
`vscode-remote://ssh-remote+HOST/home/dev/driver` and development kind `workspace`.
Install the main VSIX remotely and its UI companion on the desktop. To verify
actual placement, do not override the main extension's execution kind. Loading
packaged contents as development extensions verifies those bytes, but does not
prove marketplace installation. `requirePackagedPath` checks only the path;
record the actual installation method separately.

`disposableRemote.cjs` exercises automatic workspace Claude setup, the generated
status-line command, sanitized cache permissions, Codex discovery after startup,
malformed-response isolation, and recovery. It requires a disposable Linux user
`/home/dev` and the marker `/tmp/agentmeter-disposable-home`. It refuses to overwrite
existing tool/settings/cache files and removes its fixtures afterwards. Its quota
values are synthetic and are labeled as such in its reports.

Keep reports, screenshots, credentials, and machine-specific notes outside source
control; `out/` is ignored. Before a marketplace release, verify real provider
accounts locally and remotely, supported operating systems, reconnect behavior,
and fresh installation/upgrade with automatic companion placement. Fixtures and
successful packaging do not replace these checks.
