import { randomUUID } from 'node:crypto';
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface ClaudeSettingsReadResult {
  readonly settings: Record<string, unknown>;
  readonly exists: boolean;
  readonly hasStatusLine: boolean;
}

export interface ClaudeSettingsWriteResult {
  readonly backupPath: string | null;
}

export function getClaudeSettingsPath(
  homeDirectory: string = homedir(),
): string {
  return join(homeDirectory, '.claude', 'settings.json');
}

export function getClaudeBridgeInstallPath(
  homeDirectory: string = homedir(),
): string {
  return join(homeDirectory, '.agentmeter', 'claude-statusline-bridge.js');
}

export async function readClaudeSettings(
  settingsPath: string,
): Promise<ClaudeSettingsReadResult> {
  let contents: string;
  try {
    contents = await readFile(settingsPath, 'utf8');
  } catch (error) {
    if (isNodeErrorWithCode(error, 'ENOENT')) {
      return { settings: {}, exists: false, hasStatusLine: false };
    }

    throw error;
  }

  const value = JSON.parse(contents) as unknown;
  if (!isObject(value)) {
    throw new Error('Claude settings must contain a JSON object.');
  }

  return {
    settings: value,
    exists: true,
    hasStatusLine: Object.prototype.hasOwnProperty.call(value, 'statusLine'),
  };
}

export function buildClaudeStatusLineCommand(
  bridgePath: string,
  runtimePath = process.execPath,
  platform: NodeJS.Platform = process.platform,
): string {
  const runtime = quoteForShell(runtimePath, platform);
  const bridge = quoteForShell(bridgePath, platform);

  return platform === 'win32'
    ? `set "ELECTRON_RUN_AS_NODE=1" && ${runtime} ${bridge}`
    : `ELECTRON_RUN_AS_NODE=1 ${runtime} ${bridge}`;
}

export async function installClaudeStatusLineBridge(
  extensionPath: string,
  destinationPath = getClaudeBridgeInstallPath(),
): Promise<string> {
  const sourcePath = join(
    extensionPath,
    'dist',
    'claude-statusline-bridge.js',
  );
  const temporaryPath = `${destinationPath}.${randomUUID()}.tmp`;

  await mkdir(dirname(destinationPath), { recursive: true, mode: 0o700 });

  try {
    await copyFile(sourcePath, temporaryPath);
    await chmod(temporaryPath, 0o700);
    await rename(temporaryPath, destinationPath);
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }

  return destinationPath;
}

export function mergeClaudeStatusLineSettings(
  settings: Record<string, unknown>,
  command: string,
): Record<string, unknown> {
  return {
    ...settings,
    statusLine: {
      type: 'command',
      command,
      refreshInterval: 60,
    },
  };
}

export async function writeClaudeSettings(
  settingsPath: string,
  settings: Record<string, unknown>,
  backupExisting: boolean,
): Promise<ClaudeSettingsWriteResult> {
  await mkdir(dirname(settingsPath), { recursive: true, mode: 0o700 });

  let backupPath: string | null = null;
  if (backupExisting) {
    backupPath = `${settingsPath}.agentmeter-backup-${Date.now()}.json`;
    await copyFile(settingsPath, backupPath);
    await chmod(backupPath, 0o600);
  }

  const temporaryPath = `${settingsPath}.${randomUUID()}.tmp`;
  try {
    await writeFile(
      temporaryPath,
      `${JSON.stringify(settings, null, 2)}\n`,
      { encoding: 'utf8', mode: 0o600 },
    );
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, settingsPath);
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }

  return { backupPath };
}

function quoteForShell(value: string, platform: NodeJS.Platform): string {
  if (platform === 'win32') {
    return `"${value.replace(/"/g, '\\"')}"`;
  }

  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNodeErrorWithCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}
