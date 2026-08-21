import { homedir } from 'node:os';
import {
  createClaudeUsageCache,
  formatClaudeStatusline,
  getClaudeUsageCachePath,
  parseClaudeStatuslineInput,
  writeClaudeUsageCache,
} from './claudeUsage';

export async function runClaudeStatuslineBridge(
  input: string,
  cachePath = getClaudeUsageCachePath(homedir()),
  now = new Date(),
): Promise<string> {
  let value: unknown;
  try {
    value = JSON.parse(input) as unknown;
  } catch {
    return 'AgentMeter Claude | rate limits unavailable';
  }

  const result = parseClaudeStatuslineInput(value, now);
  const cache = createClaudeUsageCache(result, now);

  try {
    await writeClaudeUsageCache(cachePath, cache);
  } catch {
    // A cache write must not blank Claude Code's status line. The collector
    // will continue to use the previous cache, if one exists.
  }

  return formatClaudeStatusline(result);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8');
}

async function main(): Promise<void> {
  const output = await runClaudeStatuslineBridge(await readStdin());
  process.stdout.write(`${output}\n`);
}

if (require.main === module) {
  void main();
}
