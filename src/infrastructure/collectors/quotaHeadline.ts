import { UsageRecord } from '../../domain/usage';

/**
 * Marks the record a provider is represented by in compact surfaces.
 *
 * The status bar has room for one number per provider, so it shows the window
 * or pool closest to running out — the constraint that will stop the user
 * first. A short window that just reset would otherwise hide a weekly quota
 * about to be exhausted.
 *
 * Ties keep the earliest record, and every collector sorts its records
 * deterministically, so the choice never depends on the order a provider
 * happened to reply in.
 */
export function markHeadline(
  records: readonly UsageRecord[],
): readonly UsageRecord[] {
  if (records.length === 0) {
    return records;
  }

  // A window that has already reset cannot be the binding constraint, so it
  // only leads when every window has reset and nothing fresher exists.
  const fresh = records.filter((record) => !record.isStale);
  const candidates = fresh.length > 0 ? fresh : records;
  const headline = candidates.reduce((leader, record) =>
    getDepletion(record) > getDepletion(leader) ? record : leader,
  );

  return records.map((record) => ({
    ...record,
    isHeadline: record === headline,
  }));
}

/**
 * Consumed share of a quota, as a fraction where that can be computed. Records
 * without a usable value sort below every record that has one.
 */
function getDepletion(record: UsageRecord): number {
  if (record.used === null || !Number.isFinite(record.used)) {
    return -1;
  }

  return typeof record.limit === 'number' && record.limit > 0
    ? record.used / record.limit
    : record.used;
}
