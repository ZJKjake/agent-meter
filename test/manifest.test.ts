import { describe, expect, it } from 'vitest';

const {
  EXPECTED_EXTENSION_ID,
  getManifestErrors,
}: {
  EXPECTED_EXTENSION_ID: string;
  getManifestErrors: (
    manifest: Record<string, unknown>,
    lockfile: Record<string, any>,
  ) => string[];
} = require('../scripts/verify-manifest.js');

describe('release manifest guard', () => {
  it('accepts the established marketplace identity and matching versions', () => {
    expect(
      getManifestErrors(
        { name: 'agentmeter', publisher: 'zjkjake', version: '0.1.2' },
        { version: '0.1.2', packages: { '': { version: '0.1.2' } } },
      ),
    ).toEqual([]);
    expect(EXPECTED_EXTENSION_ID).toBe('zjkjake.agentmeter');
  });

  it('rejects identity drift and a stale lockfile', () => {
    const errors = getManifestErrors(
      { name: 'agentmeter', publisher: 'agentmeter', version: '0.1.2' },
      { version: '0.1.1', packages: { '': { version: '0.1.1' } } },
    );

    expect(errors).toHaveLength(3);
    expect(errors[0]).toContain('zjkjake.agentmeter');
  });
});

it('declares the UI companion dependency and the execution location of each package', () => {
  const main = require('../package.json');
  const local = require('../packages/local/package.json');
  expect(main.extensionKind).toEqual(['workspace']);
  expect(main.extensionDependencies).toEqual([`${local.publisher}.${local.name}`]);
  expect(local.extensionKind).toEqual(['ui']);
  expect(local.api).toBe('none');
  expect(local.version).toBe(main.version);
  expect(local.activationEvents).toContain('onCommand:agentmeter.local.collect.v1');
});
