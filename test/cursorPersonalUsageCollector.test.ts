import { describe, expect, it, vi } from 'vitest';
import {
  CursorPersonalUsageCollector,
  getCursorStateDatabasePath,
  parseCursorUsagePayload,
} from '../src/infrastructure/collectors/cursorPersonalUsageCollector';

describe('CursorPersonalUsageCollector', () => {
  it('is opt-in and never reads credentials while disabled', async () => {
    const readToken = vi.fn(async () => ({
      kind: 'found' as const,
      token: 'must-not-be-read',
    }));
    const requestUsage = vi.fn(async () => ({}));
    const collector = new CursorPersonalUsageCollector({
      isEnabled: () => false,
      isCursorInstalled: () => true,
      readToken,
      requestUsage,
    });

    await expect(collector.collect()).resolves.toMatchObject({
      tool: 'cursor',
      state: 'setup-required',
      records: [],
    });
    expect(readToken).not.toHaveBeenCalled();
    expect(requestUsage).not.toHaveBeenCalled();
  });

  it('detects when Cursor is not installed without reading credentials', async () => {
    const readToken = vi.fn(async () => ({ kind: 'missing' as const }));
    const collector = new CursorPersonalUsageCollector({
      isEnabled: () => false,
      isCursorInstalled: () => false,
      readToken,
    });

    await expect(collector.collect()).resolves.toMatchObject({
      state: 'unsupported',
      records: [],
      message:
        'Cursor was not detected. Personal-plan usage is unavailable on this installation.',
    });
    expect(readToken).not.toHaveBeenCalled();
  });

  it('normalizes the personal Other Models percentage as the primary quota', () => {
    const updatedAt = new Date('2026-08-21T15:00:00.000Z');
    const parsed = parseCursorUsagePayload(
      {
        enabled: true,
        billingCycleEnd: '1789532015000',
        planUsage: {
          apiPercentUsed: 19.392,
          autoPercentUsed: 0.5135,
          totalPercentUsed: 4.2892,
        },
      },
      updatedAt,
    );

    // `totalPercentUsed` summarizes the two pools above, so it is not
    // reported as a third bar next to them.
    expect(parsed?.records).toMatchObject([
      {
        id: 'cursor:primary',
        used: 19.392,
        limit: 100,
        scopeLabel: 'Other Models pool',
        periodLabel: 'Billing cycle',
        isHeadline: true,
        source: 'experimental-local',
      },
      {
        id: 'cursor:cursor-models',
        used: 0.5135,
        scopeLabel: 'Cursor Models pool',
        isHeadline: false,
      },
    ]);
    expect(parsed?.records[0].updatedAt).toEqual(updatedAt);
    expect(parsed?.records[0].resetAt?.toISOString()).toBe(
      '2026-09-16T04:13:35.000Z',
    );
  });

  it('headlines whichever pool is closest to running out', () => {
    const parsed = parseCursorUsagePayload(
      {
        enabled: true,
        billingCycleEnd: '1789532015000',
        planUsage: {
          apiPercentUsed: 12,
          autoPercentUsed: 88,
          totalPercentUsed: 40,
        },
      },
      new Date('2026-08-21T15:00:00.000Z'),
    );

    // Cursor lists Other Models first, but a nearly spent Cursor Models pool
    // is the constraint the compact value has to report.
    expect(parsed?.records).toMatchObject([
      { id: 'cursor:primary', isHeadline: false },
      { id: 'cursor:cursor-models', isHeadline: true },
    ]);
  });

  it('falls back to unavailable when Cursor changes the response schema', async () => {
    const collector = new CursorPersonalUsageCollector({
      isEnabled: () => true,
      readToken: async () => ({
        kind: 'found',
        token: 'private-test-token',
      }),
      requestUsage: async () => ({ enabled: true, planUsage: {} }),
    });

    const snapshot = await collector.collect();

    expect(snapshot).toMatchObject({
      state: 'unavailable',
      records: [],
      message: 'Cursor changed its private usage format. No usage is shown.',
    });
    expect(JSON.stringify(snapshot)).not.toContain('private-test-token');
  });

  it('distinguishes sign-in and unsupported local-storage states', async () => {
    const signedOut = new CursorPersonalUsageCollector({
      isEnabled: () => true,
      readToken: async () => ({ kind: 'missing' }),
    });
    const unreadable = new CursorPersonalUsageCollector({
      isEnabled: () => true,
      readToken: async () => ({ kind: 'unavailable' }),
    });

    await expect(signedOut.collect()).resolves.toMatchObject({
      state: 'authentication-required',
    });
    await expect(unreadable.collect()).resolves.toMatchObject({
      state: 'unsupported',
    });
  });

  it('resolves the Cursor database path for supported platforms', () => {
    expect(
      getCursorStateDatabasePath('darwin', '/Users/test', {}),
    ).toBe(
      '/Users/test/Library/Application Support/Cursor/User/globalStorage/state.vscdb',
    );
    expect(
      getCursorStateDatabasePath('linux', '/home/test', {
        XDG_CONFIG_HOME: '/config',
      }),
    ).toBe('/config/Cursor/User/globalStorage/state.vscdb');
    expect(
      getCursorStateDatabasePath('win32', 'C:\\Users\\test', {
        APPDATA: 'C:\\Roaming',
      }),
    ).toBe('C:\\Roaming\\Cursor\\User\\globalStorage\\state.vscdb');
  });
});

describe('Cursor application storage location', () => {
  it('uses the current user data directory instead of a different installation', async () => {
    const { getCursorStateDatabasePathFromStorage } = await import('../src/infrastructure/collectors/cursorPersonalUsageCollector');
    expect(getCursorStateDatabasePathFromStorage('/custom/cursor/User/globalStorage/zjkjake.agentmeter-local', 'linux'))
      .toBe('/custom/cursor/User/globalStorage/state.vscdb');
    expect(getCursorStateDatabasePathFromStorage('/custom/cursor/User/profiles/profile1/globalStorage/zjkjake.agentmeter-local', 'darwin'))
      .toBe('/custom/cursor/User/globalStorage/state.vscdb');
    expect(getCursorStateDatabasePathFromStorage('C:/CursorData/User/profiles/profile1/globalStorage/zjkjake.agentmeter-local', 'win32'))
      .toBe('C:\\CursorData\\User\\globalStorage\\state.vscdb');
  });
});
