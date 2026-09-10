import { afterEach, describe, expect, it, vi } from 'vitest';
import { CollectorUsageRepository } from '../src/infrastructure/usage/collectorUsageRepository';
import { AiToolId, ProviderSnapshot, UsageCollector } from '../src/domain/usage';

function collector(tool: AiToolId): UsageCollector {
  return { tool, collect: vi.fn(async () => ({ tool, state: 'available', records: [], message: null })) };
}

afterEach(() => vi.useRealTimers());

describe('collector isolation', () => {
  it('keeps other providers when a collector throws synchronously', async () => {
    const broken: UsageCollector = { tool: 'codex', collect: () => { throw new Error('private detail'); } };
    const result = await new CollectorUsageRepository([collector('cursor'), broken]).getUsage();
    expect(result.map((item) => item.state)).toEqual(['available', 'unavailable']);
    expect(JSON.stringify(result)).not.toContain('private detail');
  });

  it('bounds a stuck provider without launching overlapping collectors, then recovers', async () => {
    vi.useFakeTimers();
    let finish!: (value: ProviderSnapshot) => void;
    const stuck = collector('codex');
    vi.mocked(stuck.collect).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const repository = new CollectorUsageRepository([collector('cursor'), stuck], 100);
    const first = repository.getUsage();
    await vi.advanceTimersByTimeAsync(100);
    expect((await first).map((item) => item.state)).toEqual(['available', 'unavailable']);
    const second = repository.getUsage();
    await vi.advanceTimersByTimeAsync(100);
    await second;
    expect(stuck.collect).toHaveBeenCalledTimes(1);
    finish({ tool: 'codex', state: 'available', records: [], message: null });
    await vi.advanceTimersByTimeAsync(0);
    expect((await repository.getUsage()).map((item) => item.state)).toEqual(['available', 'available']);
    expect(stuck.collect).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not run unused desktop CLIs for a remote window and preserves the wire envelope', async () => {
    const collectors = [collector('cursor'), collector('claude-code'), collector('codex')];
    const repository = new CollectorUsageRepository(collectors);
    expect((await repository.getUsage(['cursor'])).map((item) => item.tool))
      .toEqual(['cursor', 'claude-code', 'codex']);
    expect(collectors[0].collect).toHaveBeenCalledOnce();
    expect(collectors[1].collect).not.toHaveBeenCalled();
    expect(collectors[2].collect).not.toHaveBeenCalled();
    await repository.getUsage();
    expect(collectors[1].collect).toHaveBeenCalledOnce();
    expect(collectors[2].collect).toHaveBeenCalledOnce();
  });
});
