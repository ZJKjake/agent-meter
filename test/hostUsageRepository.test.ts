import { describe, expect, it, vi } from 'vitest';
import { UsageService } from '../src/application/usageService';
import { ProviderSnapshot } from '../src/domain/usage';
import { HostUsageRepository } from '../src/infrastructure/hosts/hostUsageRepository';
import { decodeUsage, encodeUsage } from '../src/infrastructure/hosts/usageProtocol';
import { formatStatusBar } from '../src/presentation/statusBar/statusBarFormatter';

function snapshots(used = 15): ProviderSnapshot[] {
  return (['cursor', 'claude-code', 'codex'] as const).map((tool) => ({
    tool, state: 'available', message: null,
    records: [{
      id: `${tool}:primary`, tool, used, limit: 100, unit: 'percent', scopeLabel: null,
      periodLabel: '1-week window', isHeadline: true, isStale: false,
      resetAt: new Date('2030-01-01T00:00:00Z'), updatedAt: new Date('2026-09-09T12:00:00Z'), source: 'local',
    }],
  }));
}
function desktop(used = 15): unknown {
  return JSON.parse(JSON.stringify(encodeUsage(snapshots(used))));
}

describe('local and remote usage', () => {
  it('keeps the normal three-card dashboard locally and restores transported dates', async () => {
    const repository = new HostUsageRepository(async () => desktop());
    const records = await repository.getUsage();
    expect(records[0].records[0].updatedAt).toBeInstanceOf(Date);
    const dashboard = await new UsageService(repository).getDashboard();
    expect(dashboard.cards).toHaveLength(3);
    expect(dashboard.cards.map((card) => card.name)).toEqual(['Cursor', 'Claude Code', 'Codex']);
    expect(dashboard.cards[0].quotas[0].remainingPercentage).toBe(85);
  });

  it('shows one card per tool, using SSH tool accounts and the desktop Cursor account', async () => {
    const repository = new HostUsageRepository(async () => desktop(15), {
      getUsage: async () => snapshots(90),
    }, 'SSH');
    const dashboard = await new UsageService(repository).getDashboard();
    expect(dashboard.cards).toHaveLength(3);
    expect(dashboard.cards.filter((card) => card.tool === 'cursor')).toHaveLength(1);
    expect(dashboard.cards.find((card) => card.name === 'Codex')?.quotas[0].remainingPercentage).toBe(10);
    expect(dashboard.cards.find((card) => card.name === 'Cursor')?.quotas[0].remainingPercentage).toBe(85);
    expect(dashboard.cards.find((card) => card.name === 'Claude Code')?.quotas[0].remainingPercentage).toBe(10);
    const bar = formatStatusBar(dashboard);
    expect(bar.text).toContain('Codex 10%');
    expect(bar.text).not.toContain('Codex (local)');
    expect(bar.tooltip).not.toContain('Codex (local)');
    expect(bar.tooltip).toContain('Codex (SSH)');
  });

  it('keeps SSH setup visible instead of substituting a different local account', async () => {
    const repository = new HostUsageRepository(async () => desktop(), {
      getUsage: async () => snapshots().slice(1).map((snapshot) => ({
        ...snapshot, state: 'setup-required', records: [], message: 'Connect this provider.',
      })),
    }, 'SSH');
    const dashboard = await new UsageService(repository).getDashboard();
    expect(dashboard.cards).toHaveLength(3);
    expect(formatStatusBar(dashboard).text).toContain('Codex —');
    expect(dashboard.cards.find((card) => card.name === 'Codex')?.providerState).toBe('setup-required');
    expect(dashboard.cards.find((card) => card.name === 'Codex')?.quotas).toEqual([]);
  });

  it('isolates desktop disconnection and recovers on the next refresh', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('Connection closed')).mockResolvedValue(desktop());
    const repository = new HostUsageRepository(read, { getUsage: async () => snapshots(30).slice(1) }, 'SSH');
    const first = await repository.getUsage();
    expect(first[0].state).toBe('unavailable');
    expect(first.find((snapshot) => snapshot.location === 'workspace')?.state).toBe('available');
    const recovered = await repository.getUsage();
    expect(recovered[0].state).toBe('available');
  });

  it('bounds a stalled desktop command without hiding workspace usage', async () => {
    const repository = new HostUsageRepository(() => new Promise(() => {}), {
      getUsage: async () => snapshots(30).slice(1),
    }, 'SSH', 5);
    const result = await repository.getUsage();
    expect(result[0].state).toBe('unavailable');
    expect(result[1].state).toBe('available');
  });

  it('bounds a stalled workspace collector and recovers on the next refresh', async () => {
    const read = vi.fn().mockImplementationOnce(() => new Promise(() => {})).mockResolvedValue(snapshots(30).slice(1));
    const repository = new HostUsageRepository(async () => desktop(), { getUsage: read }, 'SSH', 5);
    const first = await repository.getUsage();
    expect(first[0].state).toBe('available');
    expect(first[1].state).toBe('unavailable');
    expect((await repository.getUsage())[1].state).toBe('available');
  }, 100);

  it('isolates malformed provider timestamps while serializing desktop usage', () => {
    const data = snapshots();
    Object.assign(data[2].records[0], { resetAt: new Date(NaN) });
    const decoded = decodeUsage(encodeUsage(data));
    expect(decoded.map((snapshot) => snapshot.state)).toEqual(['available', 'available', 'unavailable']);
  });

  it('isolates remote failures without relabeling local results as remote', async () => {
    const repository = new HostUsageRepository(async () => desktop(), {
      getUsage: async () => { throw new Error('Disconnected'); },
    });
    const result = await repository.getUsage();
    expect(result.filter((snapshot) => snapshot.location === 'local').every((snapshot) => snapshot.state === 'available')).toBe(true);
    expect(result.filter((snapshot) => snapshot.location === 'workspace').every((snapshot) => snapshot.state === 'unavailable')).toBe(true);
  });

  it('does not combine duplicate collectors or show a second card for the same tool', async () => {
    const local = snapshots().map((snapshot) => ({ ...snapshot, location: 'local' as const }));
    const dashboard = await new UsageService({ getUsage: async () => [...local, {...local[2], location: 'workspace'}] }).getDashboard();
    expect(dashboard.cards).toHaveLength(3);
    expect(dashboard.cards.find((card) => card.tool === 'codex')?.providerState).toBe('unavailable');
  });

  it.each(['SSH', 'Container', 'WSL', 'Codespaces'])('selects the active %s account even when both hosts have identical usage', async (label) => {
    const repository = new HostUsageRepository(async () => desktop(15), {getUsage: async () => snapshots(15).slice(1)}, label);
    const dashboard = await new UsageService(repository).getDashboard();
    expect(dashboard.cards).toHaveLength(3);
    expect(dashboard.cards.find((card) => card.tool === 'codex')).toMatchObject({name:'Codex',location:'workspace',locationLabel:label});
  });
});

describe('usage command protocol', () => {
  it('strips unexpected fields, including credentials, in both directions', () => {
    const data = snapshots();
    Object.assign(data[0], { accessToken: 'never-forward-this' });
    Object.assign(data[0].records[0], { rawResponse: { accessToken: 'never-forward-this' } });
    expect(JSON.stringify(encodeUsage(data))).not.toContain('never-forward-this');
    const wire = desktop() as any;
    wire.snapshots[0].accessToken = 'never-forward-this';
    wire.snapshots[0].records[0].rawResponse = 'never-forward-this';
    expect(JSON.stringify(decodeUsage(wire))).not.toContain('never-forward-this');
  });

  it.each([
    (wire: any) => { wire.version = 2; },
    (wire: any) => { wire.host = 'remote'; },
    (wire: any) => { wire.snapshots[1] = wire.snapshots[0]; },
    (wire: any) => { wire.snapshots = []; },
  ])('rejects incompatible or malformed transported data', (mutate) => {
    const wire = desktop();
    mutate(wire);
    expect(() => decodeUsage(wire)).toThrow();
  });
});

it.each([
  (record: any) => { record.updatedAt = 'invalid'; },
  (record: any) => { record.used = -1; },
  (record: any) => { record.tool = 'codex'; },
  (record: any) => { record.source = 'mock'; },
])('isolates malformed provider records without hiding the other providers', (mutate) => {
  const wire = desktop() as any;
  mutate(wire.snapshots[0].records[0]);
  const decoded = decodeUsage(wire);
  expect(decoded.map((snapshot) => snapshot.state)).toEqual(['unavailable', 'available', 'available']);
  expect(decoded[0].records).toEqual([]);
});
