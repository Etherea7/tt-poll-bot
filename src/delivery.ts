import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PollKind } from './polls.ts';

/** Target month (`YYYY-MM`) to the poll kinds already delivered everywhere. */
export type DeliveryRecord = Record<string, PollKind[]>;

export const DELIVERY_PATH = 'state/delivered.json';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const KINDS: ReadonlySet<string> = new Set(['fridays', 'saturdays', 'holidays']);

/**
 * Validate parsed JSON as a delivery record.
 *
 * This file is the only thing preventing a duplicate post to a live group, so
 * a malformed one must fail loudly rather than be silently treated as empty —
 * "empty" would mean "nothing delivered yet" and re-post the whole month.
 */
export function parseDeliveryRecord(value: unknown): DeliveryRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid delivery record: expected a JSON object of month to poll kinds');
  }

  const record: DeliveryRecord = {};
  for (const [month, kinds] of Object.entries(value as Record<string, unknown>)) {
    if (!MONTH.test(month)) {
      throw new Error(`invalid delivery record: "${month}" is not a YYYY-MM month`);
    }
    if (!Array.isArray(kinds)) {
      throw new Error(`invalid delivery record: "${month}" must map to an array of poll kinds`);
    }

    const parsed: PollKind[] = [];
    for (const kind of kinds) {
      if (typeof kind !== 'string' || !KINDS.has(kind)) {
        throw new Error(`invalid delivery record: unknown poll kind "${String(kind)}"`);
      }
      parsed.push(kind as PollKind);
    }
    record[month] = parsed;
  }

  return record;
}

/** Read the record, treating a missing file as empty. */
export function loadDeliveryRecord(path: string = DELIVERY_PATH): DeliveryRecord {
  // Absent is legitimately "nothing delivered yet"; malformed is not.
  if (!existsSync(path)) return {};
  return parseDeliveryRecord(JSON.parse(readFileSync(path, 'utf8')));
}

/** Write the record, creating the directory if needed. */
export function saveDeliveryRecord(record: DeliveryRecord, path: string = DELIVERY_PATH): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}

/**
 * Which of the requested kinds still need sending for this month. (R19, R20)
 *
 * Per-kind rather than per-month so recovering from a partially failed run
 * cannot duplicate a poll that already landed.
 */
export function pendingKinds(
  record: DeliveryRecord,
  month: string,
  requested: readonly PollKind[],
): PollKind[] {
  const delivered = new Set<PollKind>(record[month] ?? []);
  return requested.filter((kind) => !delivered.has(kind));
}

/** Record one kind as delivered to every destination. (R23) */
export function markDelivered(
  record: DeliveryRecord,
  month: string,
  kind: PollKind,
): DeliveryRecord {
  const existing = record[month] ?? [];
  return {
    ...record,
    [month]: existing.includes(kind) ? [...existing] : [...existing, kind],
  };
}
