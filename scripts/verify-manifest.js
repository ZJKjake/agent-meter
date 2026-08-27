const packageJson = require('../package.json');
const packageLock = require('../package-lock.json');

const EXPECTED_EXTENSION_ID = 'zjkjake.agentmeter';

function getManifestErrors(manifest, lockfile) {
  const errors = [];
  const extensionId = `${manifest.publisher}.${manifest.name}`;

  if (extensionId !== EXPECTED_EXTENSION_ID) {
    errors.push(
      `Extension ID must remain ${EXPECTED_EXTENSION_ID}; found ${extensionId}. This identity matches the transferred Open VSX listing.`,
    );
  }

  if (lockfile.version !== manifest.version) {
    errors.push(
      `package-lock.json version ${lockfile.version} does not match package.json version ${manifest.version}.`,
    );
  }

  if (lockfile.packages?.['']?.version !== manifest.version) {
    errors.push(
      `package-lock.json root package version ${lockfile.packages?.['']?.version ?? 'missing'} does not match package.json version ${manifest.version}.`,
    );
  }

  return errors;
}

function main() {
  const errors = getManifestErrors(packageJson, packageLock);
  if (errors.length === 0) {
    console.log(
      `Verified ${EXPECTED_EXTENSION_ID} v${packageJson.version} release identity.`,
    );
    return;
  }

  for (const error of errors) {
    console.error(`Manifest verification failed: ${error}`);
  }
  process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = {
  EXPECTED_EXTENSION_ID,
  getManifestErrors,
};
