import { describe, expect, it } from 'vitest';
import { getCodexLaunch, resolveCodexCommand } from '../src/infrastructure/collectors/codexUsageCollector';

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

it('finds per-user Codex installs when an SSH host has a minimal PATH', () => {
  expect(resolveCodexCommand('/usr/bin', 'linux', (path) => path === '/home/dev/.local/bin/codex', '/home/dev'))
    .toBe('/home/dev/.local/bin/codex');
});

it('finds npm shims on a Windows PATH with spaces', () => {
  const shim = String.raw`C:\Users\Test User\AppData\Roaming\npm\codex.cmd`;
  expect(resolveCodexCommand(String.raw`C:\Windows;C:\Users\Test User\AppData\Roaming\npm`, 'win32', (path) => path === shim))
    .toBe(shim);
  expect(getCodexLaunch(shim, 'win32')).toMatchObject({ command: 'cmd.exe', windowsVerbatimArguments: true });
});

it('rejects Windows shim paths that would permit shell expansion', () => {
  expect(() => getCodexLaunch(String.raw`C:\Users\%USERNAME%\codex.cmd`, 'win32')).toThrow();
});
