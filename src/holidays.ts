import type { YearMonth } from './clock.ts';

/** One row of the MOM consolidated public-holiday dataset. */
export interface HolidayRow {
  readonly date: string;
  readonly name: string;
}

export interface HolidayResult {
  /** True when the source contains at least one holiday in the target year. */
  readonly covered: boolean;
  readonly source: 'live' | 'snapshot' | 'none';
  /** Holiday dates within the target month, ascending. */
  readonly dates: readonly string[];
  /** Why the live source was not used, when it was not. */
  readonly warning?: string;
}

export const DATASET_ID = 'd_8ef23381f9417e4d4254ee8b4dcdb176';
export const DATASET_BASE = 'https://api-open.data.gov.sg/v1/public/api/datasets';

const EXPECTED_HEADER = 'date,day,holiday';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_MIN_API_INTERVAL_MS = 5_000;
const MAX_HTTP_ATTEMPTS = 3;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Parse the dataset CSV (`date,day,holiday`) into rows.
 *
 * Rejects a missing or unexpected header and any malformed date, so a silently
 * changed upstream schema falls back to the snapshot rather than producing an
 * empty or wrong holiday poll.
 */
export function parseHolidayCsv(csv: string): HolidayRow[] {
  const lines = csv.trim().split(/\r?\n/);
  const header = (lines[0] ?? '').trim().toLowerCase();

  if (header !== EXPECTED_HEADER) {
    throw new Error(
      `unexpected holiday CSV header "${lines[0] ?? ''}": expected "${EXPECTED_HEADER}"`,
    );
  }

  const rows: HolidayRow[] = [];
  for (const line of lines.slice(1)) {
    if (line.trim() === '') continue;

    const parts = line.split(',');
    const date = (parts[0] ?? '').trim();
    if (!ISO_DATE.test(date)) {
      throw new Error(`invalid holiday date "${date}": expected YYYY-MM-DD`);
    }

    // Re-join beyond the day column so a comma inside a holiday name survives.
    const name = parts.slice(2).join(',').trim().replace(/^"|"$/g, '');
    rows.push({ date, name });
  }

  return rows;
}

/**
 * Holiday dates within the target month, ascending.
 *
 * Both gazetted rows and rows the dataset marks `(Observed)` are included, and
 * neither is derived: MOM publishes the substitute day directly, and it is not
 * always the following Monday. In 2022 Labour Day fell on Sunday 1 May, Monday
 * 2 May was already Hari Raya Puasa, and the substitute was gazetted for
 * Tuesday 3 May.
 */
export function holidaysInMonth(
  rows: readonly HolidayRow[],
  year: number,
  month: number,
): string[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const dates = rows.filter((row) => row.date.startsWith(prefix)).map((row) => row.date);
  // Two holidays can share a date; a poll option must not appear twice.
  return [...new Set(dates)].sort();
}

/** Whether the rows contain any holiday in the given year. */
export function coversYear(rows: readonly HolidayRow[], year: number): boolean {
  return rows.some((row) => row.date.startsWith(`${year}-`));
}

/**
 * Fetch the live dataset: initiate a download, poll until a signed URL is
 * returned, then retrieve the CSV.
 *
 * Unauthenticated Dataset Downloads calls are limited to two per ten seconds,
 * so API requests are paced and the poll loop is bounded. Both endpoints answer
 * 201 rather than 200, so success is checked with `ok`.
 */
export async function fetchLiveHolidays(options?: {
  fetchImpl?: typeof fetch;
  maxPollAttempts?: number;
  delayMs?: number;
  /** Bound each request so the optional source cannot block the run forever. */
  requestTimeoutMs?: number;
  /** Minimum spacing between api-open Dataset Downloads requests. */
  minApiIntervalMs?: number;
  /** Injectable for deterministic rate-limit tests. */
  sleepImpl?: (ms: number) => Promise<void>;
  /** Injectable for deterministic rate-limit tests. */
  nowImpl?: () => number;
}): Promise<HolidayRow[]> {
  const doFetch = options?.fetchImpl ?? fetch;
  const maxPollAttempts = options?.maxPollAttempts ?? 5;
  const delayMs = options?.delayMs ?? 2000;
  const requestTimeoutMs = options?.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const minApiIntervalMs = options?.minApiIntervalMs ?? DEFAULT_MIN_API_INTERVAL_MS;
  const sleepImpl = options?.sleepImpl ?? sleep;
  const nowImpl = options?.nowImpl ?? Date.now;
  let lastApiRequestAt: number | undefined;

  const request = (url: string) => doFetch(url, { signal: AbortSignal.timeout(requestTimeoutMs) });

  const retryAfterMs = async (response: Response): Promise<number> => {
    try {
      const body = (await response.json()) as { parameters?: { retry_after?: unknown } };
      const seconds = body.parameters?.retry_after;
      return typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0
        ? seconds * 1000
        : 1000;
    } catch {
      return 1000;
    }
  };

  const requestWith429Retry = async (url: string, quotaCounted: boolean): Promise<Response> => {
    for (let attempt = 1; attempt <= MAX_HTTP_ATTEMPTS; attempt++) {
      if (quotaCounted && lastApiRequestAt !== undefined) {
        const remaining = minApiIntervalMs - (nowImpl() - lastApiRequestAt);
        if (remaining > 0) await sleepImpl(remaining);
      }

      const startedAt = nowImpl();
      const response = await request(url);
      if (quotaCounted) lastApiRequestAt = startedAt;

      if (response.status !== 429 || attempt === MAX_HTTP_ATTEMPTS) return response;

      // A 429 is provably not delivered, so it is safe to retry. The API may
      // require a longer wait than the normal quota interval.
      await sleepImpl(Math.max(minApiIntervalMs, await retryAfterMs(response)));
    }

    throw new Error(`dataset request exhausted ${MAX_HTTP_ATTEMPTS} attempts`);
  };

  const initiated = await requestWith429Retry(
    `${DATASET_BASE}/${DATASET_ID}/initiate-download`,
    true,
  );
  if (!initiated.ok) {
    throw new Error(`initiate-download returned ${initiated.status}`);
  }

  for (let attempt = 1; attempt <= maxPollAttempts; attempt++) {
    const polled = await requestWith429Retry(`${DATASET_BASE}/${DATASET_ID}/poll-download`, true);
    if (!polled.ok) {
      throw new Error(`poll-download returned ${polled.status}`);
    }

    const body = (await polled.json()) as { data?: { url?: string } };
    const url = body?.data?.url;

    if (url) {
      // Signed storage URLs are outside api-open's Dataset Downloads quota,
      // but still get the same timeout and 429 handling.
      const downloaded = await requestWith429Retry(url, false);
      if (!downloaded.ok) {
        throw new Error(`dataset download returned ${downloaded.status}`);
      }
      return parseHolidayCsv(await downloaded.text());
    }

    if (attempt < maxPollAttempts && delayMs > 0) {
      await sleepImpl(delayMs);
    }
  }

  throw new Error(`no download URL after ${maxPollAttempts} poll attempts`);
}

/**
 * Live first, committed snapshot as fallback. (R14, R15)
 *
 * The live source must never be able to withhold the Friday and Saturday
 * polls, so any live failure degrades to the snapshot and any total coverage
 * failure is reported rather than thrown. The caller decides the exit code.
 */
export async function resolveHolidays(options: {
  target: YearMonth;
  snapshot: readonly HolidayRow[];
  fetchImpl?: typeof fetch;
  maxPollAttempts?: number;
  delayMs?: number;
  requestTimeoutMs?: number;
  minApiIntervalMs?: number;
  sleepImpl?: (ms: number) => Promise<void>;
  nowImpl?: () => number;
}): Promise<HolidayResult> {
  const { target, snapshot } = options;

  let rows: readonly HolidayRow[];
  let source: 'live' | 'snapshot';
  let warning: string | undefined;

  try {
    const fetchOptions: Parameters<typeof fetchLiveHolidays>[0] = {};
    if (options.fetchImpl) fetchOptions.fetchImpl = options.fetchImpl;
    if (options.maxPollAttempts !== undefined) {
      fetchOptions.maxPollAttempts = options.maxPollAttempts;
    }
    if (options.delayMs !== undefined) fetchOptions.delayMs = options.delayMs;
    if (options.requestTimeoutMs !== undefined) {
      fetchOptions.requestTimeoutMs = options.requestTimeoutMs;
    }
    if (options.minApiIntervalMs !== undefined) {
      fetchOptions.minApiIntervalMs = options.minApiIntervalMs;
    }
    if (options.sleepImpl !== undefined) fetchOptions.sleepImpl = options.sleepImpl;
    if (options.nowImpl !== undefined) fetchOptions.nowImpl = options.nowImpl;

    rows = await fetchLiveHolidays(fetchOptions);
    source = 'live';
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    warning = `live holiday source unavailable (${reason}); using committed snapshot`;
    rows = snapshot;
    source = 'snapshot';
  }

  // A schema-valid live response can still be an incomplete annual dataset.
  // Prefer a committed source that does cover the requested year before
  // declaring holiday coverage absent. (R11)
  if (source === 'live' && !coversYear(rows, target.year) && coversYear(snapshot, target.year)) {
    rows = snapshot;
    source = 'snapshot';
    warning = `live holiday source does not cover ${target.year}; using committed snapshot`;
  }

  if (!coversYear(rows, target.year)) {
    return {
      covered: false,
      source: 'none',
      dates: [],
      warning: warning ?? `no holiday coverage for ${target.year} in the ${source} source`,
    };
  }

  const result: HolidayResult = {
    covered: true,
    source,
    dates: holidaysInMonth(rows, target.year, target.month),
  };
  return warning === undefined ? result : { ...result, warning };
}
