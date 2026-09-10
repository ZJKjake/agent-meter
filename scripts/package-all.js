const { spawnSync } = require('node:child_process');
const { copyFileSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const manifest = require('../package.json');
const local = require('../packages/local/package.json');
if (manifest.version !== local.version ||
    local.extensionKind?.join() !== 'ui' || local.api !== 'none' ||
    manifest.extensionKind?.join() !== 'workspace' ||
    manifest.extensionDependencies?.join() !== `${local.publisher}.${local.name}`) {
  throw new Error('AgentMeter host manifests must have matching versions and execution locations.');
}
copyFileSync(path.join(root, 'LICENSE'), path.join(root, 'packages/local/LICENSE'));
for (const [directory, name] of [['packages/local', 'agentmeter-local'], ['.', 'agentmeter']]) {
  const result = spawnSync(process.execPath, [
    path.join(root, 'scripts/package.js'), 'package', '--no-dependencies',
    '--out', path.join(root, `${name}-${manifest.version}.vsix`),
  ], { cwd: path.join(root, directory), stdio: 'inherit' });
  if (result.error) { throw result.error; }
  if (result.status !== 0) { process.exit(result.status ?? 1); }
}
