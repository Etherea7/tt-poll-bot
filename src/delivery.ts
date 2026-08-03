import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PollKind } from './polls.ts';

export const DELIVERY_PATH = 'state/delivered.json';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const ALIAS = /^[a-z][a-z0-9-]{0,31}$/;
const CLAIM_ID = /^[A-Za-z0-9._-]{1,100}$/;
const KINDS: ReadonlySet<string> = new Set(['fridays', 'saturdays', 'holidays']);

export interface DeliveryStatus {
  readonly status: 'claimed' | 'delivered';
  readonly claimId: string;
}

export type DeliveryRecord = Record<
  string,
  Record<string, Partial<Record<PollKind, DeliveryStatus>>>
>;

export interface DeliveryTarget {
  readonly alias: string;
  readonly kind: PollKind;
}

function parseStatus(value: unknown): DeliveryStatus {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid delivery record: poll kind must map to a delivery status');
  }
  const status = (value as Record<string, unknown>).status;
  const claimId = (value as Record<string, unknown>).claimId;
  if (
    (status !== 'claimed' && status !== 'delivered') ||
    typeof claimId !== 'string' ||
    !CLAIM_ID.test(claimId)
  ) {
    throw new Error('invalid delivery record: status must be claimed or delivered with a claim id');
  }
  return { status, claimId };
}

/** Validate state strictly; malformed state must fail closed rather than resend. */
export function parseDeliveryRecord(value: unknown): DeliveryRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid delivery record: expected a JSON object of month to destinations');
  }
  const record: DeliveryRecord = {};
  for (const [month, destinations] of Object.entries(value as Record<string, unknown>)) {
    if (!MONTH.test(month))
      throw new Error(`invalid delivery record: "${month}" is not a YYYY-MM month`);
    if (typeof destinations !== 'object' || destinations === null || Array.isArray(destinations)) {
      throw new Error(`invalid delivery record: "${month}" must map to destination aliases`);
    }
    const parsedDestinations: Record<string, Partial<Record<PollKind, DeliveryStatus>>> = {};
    for (const [alias, kinds] of Object.entries(destinations as Record<string, unknown>)) {
      if (!ALIAS.test(alias))
        throw new Error(`invalid delivery record: "${alias}" is not a safe alias`);
      if (typeof kinds !== 'object' || kinds === null || Array.isArray(kinds)) {
        throw new Error(`invalid delivery record: alias "${alias}" must map to poll kinds`);
      }
      const parsedKinds: Partial<Record<PollKind, DeliveryStatus>> = {};
      for (const [kind, status] of Object.entries(kinds as Record<string, unknown>)) {
        if (!KINDS.has(kind))
          throw new Error(`invalid delivery record: unknown poll kind "${kind}"`);
        parsedKinds[kind as PollKind] = parseStatus(status);
      }
      parsedDestinations[alias] = parsedKinds;
    }
    record[month] = parsedDestinations;
  }
  return record;
}

export function loadDeliveryRecord(path: string = DELIVERY_PATH): DeliveryRecord {
  if (!existsSync(path)) return {};
  return parseDeliveryRecord(JSON.parse(readFileSync(path, 'utf8')));
}

/** Atomically replace the local record so a crash preserves the previous valid state. */
export function saveDeliveryRecord(record: DeliveryRecord, path: string = DELIVERY_PATH): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  renameSync(temporary, path);
}

function statusFor(
  record: DeliveryRecord,
  month: string,
  alias: string,
  kind: PollKind,
): DeliveryStatus | undefined {
  return record[month]?.[alias]?.[kind];
}

function setStatus(
  record: DeliveryRecord,
  month: string,
  alias: string,
  kind: PollKind,
  status: DeliveryStatus,
): DeliveryRecord {
  return {
    ...record,
    [month]: {
      ...record[month],
      [alias]: { ...record[month]?.[alias], [kind]: status },
    },
  };
}

/** Claim each eligible destination/kind before a live process can issue transport. */
export function prepareClaims(
  record: DeliveryRecord,
  month: string,
  aliases: readonly string[],
  kinds: readonly PollKind[],
  claimId: string,
  force: boolean,
): { record: DeliveryRecord; claimed: DeliveryTarget[]; blocked: DeliveryTarget[] } {
  const blocked: DeliveryTarget[] = [];
  for (const alias of aliases) {
    for (const kind of kinds) {
      const current = statusFor(record, month, alias, kind);
      if (current?.status === 'claimed' && current.claimId !== claimId && !force) {
        blocked.push({ alias, kind });
      }
    }
  }
  // A blocked prepare is all-or-nothing. Do not leave sibling claims that an
  // operator did not intend to create while reporting failure.
  if (blocked.length > 0) return { record, claimed: [], blocked };

  let updated = record;
  const claimed: DeliveryTarget[] = [];
  for (const alias of aliases) {
    for (const kind of kinds) {
      const current = statusFor(updated, month, alias, kind);
      if (current?.status === 'delivered' && !force) continue;
      if (!current || current.claimId !== claimId || current.status === 'delivered') {
        updated = setStatus(updated, month, alias, kind, { status: 'claimed', claimId });
      }
      claimed.push({ alias, kind });
    }
  }
  return { record: updated, claimed, blocked };
}

/** Return a sendable target only when the current run owns its durable claim. */
export function claimsForRun(
  record: DeliveryRecord,
  month: string,
  aliases: readonly string[],
  kinds: readonly PollKind[],
  claimId: string,
): { sendable: DeliveryTarget[]; blocked: DeliveryTarget[]; missing: DeliveryTarget[] } {
  const sendable: DeliveryTarget[] = [];
  const blocked: DeliveryTarget[] = [];
  const missing: DeliveryTarget[] = [];
  for (const alias of aliases) {
    for (const kind of kinds) {
      const current = statusFor(record, month, alias, kind);
      if (current?.status === 'delivered') continue;
      if (!current) missing.push({ alias, kind });
      else if (current.claimId !== claimId) blocked.push({ alias, kind });
      else sendable.push({ alias, kind });
    }
  }
  return { sendable, blocked, missing };
}

/** Mark exactly one claimed destination/kind delivered after Telegram success. */
export function markDelivered(
  record: DeliveryRecord,
  month: string,
  alias: string,
  kind: PollKind,
  claimId: string,
): DeliveryRecord {
  const current = statusFor(record, month, alias, kind);
  if (current?.status === 'delivered' && current.claimId === claimId) return record;
  if (current?.status !== 'claimed' || current.claimId !== claimId) {
    throw new Error(`cannot mark unowned delivery claim for ${alias}/${kind}`);
  }
  return setStatus(record, month, alias, kind, { status: 'delivered', claimId });
}
