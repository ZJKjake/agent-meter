import { describe, expect, it } from 'vitest';

const {
  environmentWithoutPublishingToken,
}: {
  environmentWithoutPublishingToken: (
    environment: NodeJS.ProcessEnv,
  ) => NodeJS.ProcessEnv;
} = require('../scripts/publish-open-vsx.js');

describe('Open VSX publisher', () => {
  it('removes the publishing token from the package environment', () => {
    const environment = environmentWithoutPublishingToken({
      PATH: '/usr/bin',
      OVSX_PAT: 'super-secret-token',
    });

    expect(environment).toEqual({ PATH: '/usr/bin' });
    expect(environment).not.toHaveProperty('OVSX_PAT');
  });
});
