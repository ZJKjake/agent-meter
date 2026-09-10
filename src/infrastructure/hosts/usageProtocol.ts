import { AiToolId, ProviderSnapshot, UsageRecord } from '../../domain/usage';

export const LOCAL_COLLECT_COMMAND = 'agentmeter.local.collect.v1';
export const LOCAL_CONFIGURE_COMMAND = 'agentmeter.local.configure.v1';
const TOOLS: readonly AiToolId[] = ['cursor', 'claude-code', 'codex'];
const STATES = ['available', 'authentication-required', 'setup-required', 'stale', 'unavailable', 'unsupported'];
const UNITS = ['credits', 'messages', 'percent', 'requests', 'tasks', 'tokens'];

type WireRecord = Omit<UsageRecord, 'resetAt' | 'updatedAt'> & {
  resetAt: string | null;
  updatedAt: string;
};

interface UsageEnvelope {
  version: 1;
  host: 'local';
  snapshots: Array<Omit<ProviderSnapshot, 'records' | 'location' | 'locationLabel'> & { records: WireRecord[] }>;
}

/** The bridge carries an explicit allowlist of usage fields, never raw API responses. */
export function encodeUsage(snapshots: readonly ProviderSnapshot[]): UsageEnvelope {
  return {
    version: 1,
    host: 'local',
    snapshots: snapshots.map((snapshot) => {
      try {
        const wire = {
          tool: snapshot.tool,
          state: snapshot.state,
          message: snapshot.message,
          records: snapshot.records.map((record) => ({
            id: record.id, tool: record.tool, used: record.used, limit: record.limit,
            unit: record.unit, scopeLabel: record.scopeLabel, periodLabel: record.periodLabel,
            isHeadline: record.isHeadline, isStale: record.isStale,
            resetAt: record.resetAt?.toISOString() ?? null,
            updatedAt: record.updatedAt.toISOString(), source: record.source,
          })),
        };
        decodeSnapshot(wire, snapshot.tool);
        return wire;
      } catch {
        return invalidSnapshot(snapshot.tool);
      }
    }),
  };
}

/** Dates must be explicitly restored after crossing VS Code's command transport. */
export function decodeUsage(value: unknown): readonly ProviderSnapshot[] {
  if (!object(value) || value.version !== 1 || value.host !== 'local' ||
      !Array.isArray(value.snapshots) || value.snapshots.length !== TOOLS.length) {
    throw new Error('Incompatible AgentMeter desktop connection.');
  }
  const seen = new Set<string>();
  return value.snapshots.map((snapshot: unknown): ProviderSnapshot => {
    if (!object(snapshot) || !TOOLS.includes(snapshot.tool as AiToolId) ||
        seen.has(snapshot.tool as string)) {
      throw new Error('Invalid AgentMeter provider identity.');
    }
    seen.add(snapshot.tool as string);
    const tool = snapshot.tool as AiToolId;
    try {
      return decodeSnapshot(snapshot, tool);
    } catch {
      return invalidSnapshot(tool);
    }
  });
}

function decodeSnapshot(snapshot: Record<string, unknown>, tool: AiToolId): ProviderSnapshot {
  if (!STATES.includes(snapshot.state as string) || !nullableText(snapshot.message) ||
      !Array.isArray(snapshot.records) || snapshot.records.length > 20) {
    throw new Error('Invalid AgentMeter usage snapshot.');
  }
  return {
    tool, state: snapshot.state as ProviderSnapshot['state'], message: snapshot.message as string | null,
    records: snapshot.records.map((record: unknown): UsageRecord => {
      if (!object(record) || record.tool !== tool || !text(record.id) ||
          !(record.used === null || nonnegative(record.used)) ||
          !(record.limit === null || record.limit === 'unlimited' || nonnegative(record.limit)) ||
          !UNITS.includes(record.unit as string) || !nullableText(record.scopeLabel) ||
          !text(record.periodLabel) || typeof record.isHeadline !== 'boolean' ||
          typeof record.isStale !== 'boolean' || !date(record.updatedAt) ||
          !(record.resetAt === null || date(record.resetAt)) ||
          !['local', 'experimental-local'].includes(record.source as string)) {
        throw new Error('Invalid AgentMeter usage record.');
      }
      return {
        id: record.id as string, tool, used: record.used as number | null,
        limit: record.limit as UsageRecord['limit'], unit: record.unit as UsageRecord['unit'],
        scopeLabel: record.scopeLabel as string | null, periodLabel: record.periodLabel as string,
        isHeadline: record.isHeadline, isStale: record.isStale,
        resetAt: record.resetAt === null ? null : new Date(record.resetAt as string),
        updatedAt: new Date(record.updatedAt as string), source: record.source as UsageRecord['source'],
      };
    }),
  };
}

function invalidSnapshot(tool: AiToolId) {
  return {
    tool, state: 'unavailable' as const, records: [],
    message: 'This provider returned invalid usage data. AgentMeter will retry automatically.',
  };
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function text(value: unknown): value is string { return typeof value === 'string' && value.length <= 1000; }
function nullableText(value: unknown): boolean { return value === null || text(value); }
function nonnegative(value: unknown): boolean { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
function date(value: unknown): boolean { return text(value) && Number.isFinite(new Date(value).getTime()); }
