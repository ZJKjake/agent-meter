import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildClaudeStatusLineCommand,
  installClaudeStatusLineBridge,
  mergeClaudeStatusLineSettings,
  readClaudeSettings,
  writeClaudeSettings,
} from '../src/infrastructure/claude/claudeSettings';

describe('Claude settings integration', () => {
  it('preserves existing settings while replacing statusLine', () => {
    const merged = mergeClaudeStatusLineSettings(
      {
        theme: 'dark',
        permissions: { allow: ['Bash'] },
        statusLine: { type: 'command', command: 'old-command' },
      },
      "ELECTRON_RUN_AS_NODE=1 '/runtime' '/bridge.js'",
    );

    expect(merged).toEqual({
      theme: 'dark',
      permissions: { allow: ['Bash'] },
      statusLine: {
        type: 'command',
        command: "ELECTRON_RUN_AS_NODE=1 '/runtime' '/bridge.js'",
        refreshInterval: 60,
      },
    });
  });

  it('quotes extension paths for statusline shell commands', () => {
    expect(
      buildClaudeStatusLineCommand(
        '/Users/test/Agent Meter/bridge.js',
        '/Applications/Cursor Helper',
        'darwin',
      ),
    ).toBe(
      "ELECTRON_RUN_AS_NODE=1 '/Applications/Cursor Helper' '/Users/test/Agent Meter/bridge.js'",
    );
  });

  it('installs the bridge at a stable path outside the extension version', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'agentmeter-bridge-'));
    const extensionPath = join(directory, 'extension-0.1.1');
    const sourcePath = join(
      extensionPath,
      'dist',
      'claude-statusline-bridge.js',
    );
    const destinationPath = join(
      directory,
      '.agentmeter',
      'claude-statusline-bridge.js',
    );

    try {
      await mkdir(join(extensionPath, 'dist'), { recursive: true });
      await writeFile(sourcePath, 'bridge contents', 'utf8');

      await expect(
        installClaudeStatusLineBridge(extensionPath, destinationPath),
      ).resolves.toBe(destinationPath);
      expect(await readFile(destinationPath, 'utf8')).toBe('bridge contents');

      if (process.platform !== 'win32') {
        expect((await stat(destinationPath)).mode & 0o777).toBe(0o700);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('backs up existing settings before an atomic replacement', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'agentmeter-settings-'));
    const settingsPath = join(directory, 'settings.json');
    const original = {
      theme: 'dark',
      statusLine: { type: 'command', command: 'old-command' },
    };

    try {
      await writeFile(settingsPath, `${JSON.stringify(original)}\n`, 'utf8');
      const current = await readClaudeSettings(settingsPath);
      const result = await writeClaudeSettings(
        settingsPath,
        mergeClaudeStatusLineSettings(current.settings, 'new-command'),
        true,
      );

      expect(result.backupPath).toBeTruthy();
      expect(JSON.parse(await readFile(settingsPath, 'utf8'))).toMatchObject({
        theme: 'dark',
        statusLine: { command: 'new-command' },
      });
      expect(JSON.parse(await readFile(result.backupPath!, 'utf8'))).toEqual(original);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
