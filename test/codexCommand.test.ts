import { describe, expect, it } from 'vitest';
import { resolveCodexCommand } from '../src/infrastructure/collectors/codexUsageCollector';

describe('resolveCodexCommand', () => {
  it('uses Codex from the inherited PATH when available', () => {
    expect(
      resolveCodexCommand(
        '/custom/bin:/other/bin',
        'darwin',
        (path) => path === '/other/bin/codex',
      ),
    ).toBe('/other/bin/codex');
  });

  it('finds the standard Homebrew path when the GUI PATH is incomplete', () => {
    expect(
      resolveCodexCommand(
        '/usr/bin',
        'darwin',
        (path) => path === '/opt/homebrew/bin/codex',
      ),
    ).toBe('/opt/homebrew/bin/codex');
  });

  it('falls back to OS command lookup when no known path exists', () => {
    expect(resolveCodexCommand('', 'darwin', () => false)).toBe('codex');
  });
});
