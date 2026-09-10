// Run inside the real editor with --extensionTestsPath=<this file>.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vscode = require('vscode');
const expectedVersion = require('../../package.json').version;

exports.run = async function (options = {}) {
  const extension = vscode.extensions.getExtension('zjkjake.agentmeter');
  assert(extension, 'AgentMeter must be installed');
  assert.equal(extension.packageJSON.version, expectedVersion);
  await extension.activate();
  assert.equal(extension.isActive, true);
  const packagedPathDetected = extension.extensionPath.includes(`zjkjake.agentmeter-${expectedVersion}`);
  if (options.requirePackagedPath) {
    assert(packagedPathDetected, 'Load the packaged extension directory');
  }
  const envelope = await vscode.commands.executeCommand('agentmeter.local.collect.v1');
  assert.equal(envelope.version, 1);
  assert.equal(envelope.host, 'local');
  assert.deepEqual(envelope.snapshots.map((snapshot) => snapshot.tool), ['cursor', 'claude-code', 'codex']);
  for (const snapshot of envelope.snapshots) {
    assert(!('accessToken' in snapshot));
    for (const record of snapshot.records) {
      assert.equal(typeof record.updatedAt, 'string');
      assert(Number.isFinite(Date.parse(record.updatedAt)));
    }
  }
  const dashboard = await vscode.commands.executeCommand('agentmeter.refresh');
  assert.equal(dashboard.cards.length, 3);
  assert.equal(new Set(dashboard.cards.map((card) => card.tool)).size, 3);
  assert.equal(dashboard.cards.filter((card) => card.tool === 'cursor').length, 1);
  if (vscode.env.remoteName) {
    assert(process.execPath.includes('/.cursor-server/'), `Remote tests must run inside the SSH server: ${process.execPath}`);
    assert.equal(extension.extensionKind, vscode.ExtensionKind.Workspace);
    assert.equal(dashboard.cards.filter((card) => card.location === 'workspace').length, 2);
    assert.equal(dashboard.cards.filter((card) => card.location === 'local').length, 1);
    assert.equal(dashboard.cards.find((card) => card.location === 'local').tool, 'cursor');
  }
  await vscode.commands.executeCommand('agentmeter.focus');
  const report = {
    recordedAt: new Date().toISOString(),
    version: extension.packageJSON.version,
    remoteName: vscode.env.remoteName ?? null,
    extensionKind: extension.extensionKind,
    extensionUriScheme: extension.extensionUri.scheme,
    runningOnSshServer: process.execPath.includes('/.cursor-server/'),
    providers: envelope.snapshots.map(({ tool, state, records }) => ({
      tool, state, quotaCount: records.length,
    })),
    platform: process.platform,
    packagedPathDetected,
    mainBundleSha256: require('node:crypto').createHash('sha256').update(fs.readFileSync(require('node:path').join(extension.extensionPath, 'dist/extension.js'))).digest('hex'),
    dataProvenance: options.dataProvenance ?? 'unspecified; available state alone does not establish live account coverage',
    cards: dashboard.cards.map(({ tool, location, providerState, quotas }) => ({ tool, location: location ?? 'local', state: providerState, quotaCount: quotas.length })),
    wiringPassed: true,
    requiredAvailable: options.requireAvailable ?? [],
    acceptancePassed: false,
  };
  const failures = [];
  for (const key of options.requireAvailable ?? []) {
    const card = report.cards.find((card) => `${card.location}:${card.tool}` === key);
    if (!card || card.state !== 'available' || card.quotaCount === 0) { failures.push(key); }
  }
  for (const [key, state] of Object.entries(options.requireStates ?? {})) {
    const card = report.cards.find((card) => `${card.location}:${card.tool}` === key);
    if (card?.state !== state) { failures.push(`${key} expected ${state}`); }
  }
  report.acceptancePassed = failures.length === 0 && (report.requiredAvailable.length > 0 || Object.keys(options.requireStates ?? {}).length > 0);
  report.failures = failures;
  // No raw responses, account identifiers or credentials are written.
  const reportPath = options.reportPath || process.env.AGENTMETER_TEST_REPORT || require('node:path').join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'agentmeter-integration-report.json');
  if (reportPath) { fs.writeFileSync(reportPath, JSON.stringify(report, null, 2)); }
  console.log('AGENTMETER_INTEGRATION ' + JSON.stringify(report));
  assert.deepEqual(failures, [], 'Required provider acceptance checks failed');
  return report;
};
