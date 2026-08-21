const { spawnSync } = require('node:child_process');
const path = require('node:path');

const TOKEN_VARIABLE = 'OVSX_PAT';

function environmentWithoutPublishingToken(environment = process.env) {
  const sanitizedEnvironment = { ...environment };
  delete sanitizedEnvironment[TOKEN_VARIABLE];
  return sanitizedEnvironment;
}

function run(command, args, environment) {
  const result = spawnSync(command, args, {
    cwd: path.resolve(__dirname, '..'),
    env: environment,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function main() {
  const publishingToken = process.env[TOKEN_VARIABLE];
  if (!publishingToken || publishingToken.trim().length === 0) {
    console.error('OVSX_PAT is required to publish AgentMeter.');
    process.exitCode = 1;
    return;
  }

  const packageJson = require('../package.json');
  const repositoryRoot = path.resolve(__dirname, '..');
  const packageEnvironment = environmentWithoutPublishingToken();
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const ovsxCommand = path.join(
    repositoryRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'ovsx.cmd' : 'ovsx',
  );
  const packagePath = `./agentmeter-${packageJson.version}.vsix`;

  run(npmCommand, ['run', 'package'], packageEnvironment);
  run(ovsxCommand, ['publish', packagePath], {
    ...packageEnvironment,
    [TOKEN_VARIABLE]: publishingToken,
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  environmentWithoutPublishingToken,
};
