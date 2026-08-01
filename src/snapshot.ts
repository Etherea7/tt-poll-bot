import type { HolidayRow } from './holidays.ts';

/** The committed fallback copy of the holiday dataset. */
export interface Snapshot {
  readonly source: string;
  readonly refreshedOn: string;
  readonly holidays: readonly HolidayRow[];
}

/** How far ahead the snapshot must reach before the staleness check fails. */
export const REQUIRED_COVERAGE_MONTHS = 6;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^(\d{4})-(\d{2})$/;

/**
 * Validate parsed JSON as a snapshot.
 *
 * The snapshot is a fallback used precisely when the live source is
 * unreachable, so a malformed one must fail loudly at check time rather than
 * on the 25th of a month.
 */
export function parseSnapshot(value: unknown): Snapshot {
  if (typeof value !== 'object' || value === null) {
    throw new Error('invalid snapshot: expected a JSON object');
  }

  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.holidays)) {
    throw new Error('invalid snapshot: "holidays" must be an array');
  }

  const holidays: HolidayRow[] = [];
  for (const entry of candidate.holidays) {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error('invalid snapshot: each holiday must be an object');
    }
    const row = entry as Record<string, unknown>;
    if (typeof row.date !== 'string' || !ISO_DATE.test(row.date)) {
      throw new Error(`invalid snapshot: holiday date "${String(row.date)}" must be YYYY-MM-DD`);
    }
    if (typeof row.name !== 'string') {
      throw new Error(`invalid snapshot: holiday name for ${row.date} must be a string`);
    }
    holidays.push({ date: row.date, name: row.name });
  }

  return {
    source: typeof candidate.source === 'string' ? candidate.source : '',
    refreshedOn: typeof candidate.refreshedOn === 'string' ? candidate.refreshedOn : '',
    holidays,
  };
}

/** The latest month the snapshot covers, as `YYYY-MM`. */
export function latestCoveredMonth(rows: readonly HolidayRow[]): string {
  if (rows.length === 0) {
    throw new Error('snapshot contains no holidays');
  }
  // YYYY-MM sorts correctly as text, so no date parsing is needed.
  return [...rows.map((row) => row.date.slice(0, 7))].sort().at(-1) ?? '';
}

/** Add whole months to a `YYYY-MM` string, rolling the year. */
export function addMonths(yearMonth: string, months: number): string {
  const match = ISO_MONTH.exec(yearMonth);
  if (!match) {
    throw new Error(`invalid month "${yearMonth}": expected YYYY-MM`);
  }

  const [, yearText = '', monthText = ''] = match;
  const total = Number(yearText) * 12 + (Number(monthText) - 1) + months;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export interface CoverageReport {
  readonly ok: boolean;
  readonly latest: string;
  readonly required: string;
}

/**
 * Whether the snapshot reaches far enough past the check date. (R17)
 *
 * Run in CI so staleness surfaces during ordinary development rather than
 * during a scheduled run that has already lost its live source.
 */
export function checkCoverage(
  rows: readonly HolidayRow[],
  checkDateIso: string,
  requiredMonths: number = REQUIRED_COVERAGE_MONTHS,
): CoverageReport {
  const latest = latestCoveredMonth(rows);
  const required = addMonths(checkDateIso.slice(0, 7), requiredMonths);
  return { ok: latest >= required, latest, required };
}
