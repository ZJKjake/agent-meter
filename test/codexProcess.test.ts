import { afterEach, describe, expect, it } from 'vitest';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { CodexUsageCollector } from '../src/infrastructure/collectors/codexUsageCollector';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
async function cli(body: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'agentmeter codex test-'));
  directories.push(directory);
  const path = join(directory, process.platform === 'win32' ? 'codex.cmd' : 'codex');
  if (process.platform === 'win32') {
    const script = join(directory, 'fixture.cjs');
    await writeFile(script, body, 'utf8');
    await writeFile(path, `@echo off\r\n"${process.execPath}" "${script}"\r\n`, 'utf8');
  } else {
    await writeFile(path, `#!${process.execPath}\n${body}\n`, 'utf8');
  }
  await chmod(path, 0o700);
  return path;
}

describe('Codex process failure isolation', () => {
  it.each(['null', '[]', '"unexpected"', '{invalid'])('handles malformed JSON-RPC without crashing the host: %s', async (line) => {
    const command = await cli(`process.stdout.write(${JSON.stringify(line + '\n')}); setInterval(() => {}, 1000);`);
    const snapshot = await new CodexUsageCollector(command, 10000).collect();
    expect(snapshot.state).toBe('unavailable');
  }, 6000);

  it('handles an early successful exit promptly, without waiting for the RPC timeout', async () => {
    const command = await cli('process.exit(0);');
    const snapshot = await new CodexUsageCollector(command, 10000).collect();
    expect(snapshot.state).toBe('unavailable');
  }, 6000);

  it('rejects oversized output without waiting for the RPC timeout', async () => {
    const command = await cli("process.stdout.write('x'.repeat(2 * 1024 * 1024)); setInterval(() => {}, 1000);");
    expect((await new CodexUsageCollector(command, 10000).collect()).state).toBe('unavailable');
  }, 6000);

  it('completes initialization and rate-limit reading against a real child process', async () => {
    const command = await cli(`
      require('node:fs').writeFileSync(require('node:path').join(__dirname, 'child.pid'), String(process.pid));
      require('node:readline').createInterface({input:process.stdin}).on('line', line => {
        const request=JSON.parse(line);
        if(request.method==='initialize') process.stdout.write(JSON.stringify({id:request.id,result:{}})+'\\n');
        if(request.method==='account/rateLimits/read') process.stdout.write(JSON.stringify({id:request.id,result:{rateLimits:{primary:{usedPercent:23,windowDurationMins:300,resetsAt:2000000000}}}})+'\\n');
      });
    `);
    const snapshot = await new CodexUsageCollector(command, 5000).collect();
    expect(snapshot.state).toBe('available');
    expect(snapshot.records[0].used).toBe(23);
    const childPid = Number(await readFile(join(dirname(command), 'child.pid'), 'utf8'));
    await expect.poll(() => {
      try { process.kill(childPid, 0); return true; } catch { return false; }
    }, { timeout: 3000 }).toBe(false);
  });
});
