import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  coversYear,
  fetchLiveHolidays,
  holidaysInMonth,
  parseHolidayCsv,
  resolveHolidays,
} from '../src/holidays.ts';

// Real rows from the MOM consolidated dataset, including the 2022 case where
// the observed day is a Tuesday rather than the following Monday.
const CSV = [
  'date,day,holiday',
  '2022-05-01,Sunday,Labour Day',
  '2022-05-02,Monday,Hari Raya Puasa',
  '2022-05-03,Tuesday,Labour Day (Observed)',
  '2026-05-01,Friday,Labour Day',
  '2026-05-27,Wednesday,Hari Raya Haji',
  '2026-05-31,Sunday,Vesak Day',
  '2026-06-01,Monday,Vesak Day (Observed)',
  '2026-12-25,Friday,Christmas Day',
].join('\n');

const rows = () => parseHolidayCsv(CSV);

const okResponse = (body: unknown, status = 200) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

/** A fetch double walking the real two-step flow: initiate, poll, download. */
const fakeFetch = (csv: string, opts?: { pollsBeforeUrl?: number }): typeof fetch => {
  let polls = 0;
  return (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('initiate-download')) {
      return okResponse({ code: 0, data: { message: 'initiated' } }, 201);
    }
    if (url.includes('poll-download')) {
      polls += 1;
      if (polls <= (opts?.pollsBeforeUrl ?? 0)) {
        return okResponse({ code: 0, data: { status: 'pending' } }, 201);
      }
      return okResponse(
        { code: 0, data: { status: 'ready', url: 'https://example.test/f.csv' } },
        201,
      );
    }
    return okResponse(csv);
  }) as unknown as typeof fetch;
};

test('parseHolidayCsv reads date and name, tolerating a curly apostrophe', () => {
  const parsed = parseHolidayCsv('date,day,holiday\n2026-01-01,Thursday,New Year’s Day');
  assert.deepEqual(parsed, [{ date: '2026-01-01', name: 'New Year’s Day' }]);
});

test('parseHolidayCsv rejects an unexpected header', () => {
  assert.throws(() => parseHolidayCsv('when,what\n2026-01-01,New Year'), /header/i);
});

test('parseHolidayCsv rejects a malformed date', () => {
  assert.throws(() => parseHolidayCsv('date,day,holiday\n01/01/2026,Thursday,New Year'), /date/i);
});

// AC6 (R6): only the target month, gazetted and observed, ascending.
test('holidaysInMonth returns only that month, ascending', () => {
  assert.deepEqual(holidaysInMonth(rows(), 2026, 5), ['2026-05-01', '2026-05-27', '2026-05-31']);
  assert.deepEqual(holidaysInMonth(rows(), 2026, 6), ['2026-06-01']);
  assert.deepEqual(holidaysInMonth(rows(), 2026, 7), []);
});

// Regression guard: the substitute day is taken from the dataset, never derived.
// A "Sunday -> following Monday" rule would wrongly yield 2022-05-02, which was
// already Hari Raya Puasa. MOM gazetted the substitute for Tuesday the 3rd.
test('holidaysInMonth uses the published observed day, not a derived Monday', () => {
  const may2022 = holidaysInMonth(rows(), 2022, 5);
  assert.deepEqual(may2022, ['2022-05-01', '2022-05-02', '2022-05-03']);
});

test('coversYear reports whether the year is present', () => {
  assert.equal(coversYear(rows(), 2026), true);
  assert.equal(coversYear(rows(), 2028), false);
});

test('fetchLiveHolidays walks initiate, poll, then download', async () => {
  const fetched = await fetchLiveHolidays({
    fetchImpl: fakeFetch(CSV),
    delayMs: 0,
    minApiIntervalMs: 0,
  });
  assert.equal(fetched.length, 8);
  assert.equal(fetched[0]?.date, '2022-05-01');
});

test('fetchLiveHolidays polls until a signed URL appears', async () => {
  const fetched = await fetchLiveHolidays({
    fetchImpl: fakeFetch(CSV, { pollsBeforeUrl: 2 }),
    delayMs: 0,
    minApiIntervalMs: 0,
  });
  assert.equal(fetched.length, 8);
});

test('fetchLiveHolidays gives up after a bounded number of polls', async () => {
  await assert.rejects(
    fetchLiveHolidays({
      fetchImpl: fakeFetch(CSV, { pollsBeforeUrl: 99 }),
      maxPollAttempts: 3,
      delayMs: 0,
      minApiIntervalMs: 0,
    }),
    /attempt/i,
  );
});

// AC14 (R14): a live failure falls back to the snapshot and still succeeds.
test('resolveHolidays falls back to the snapshot when the live fetch fails', async () => {
  const failing = (async () => okResponse('nope', 503)) as unknown as typeof fetch;
  const result = await resolveHolidays({
    target: { year: 2026, month: 5 },
    snapshot: rows(),
    fetchImpl: failing,
    delayMs: 0,
    minApiIntervalMs: 0,
  });
  assert.equal(result.source, 'snapshot');
  assert.equal(result.covered, true);
  assert.deepEqual(result.dates, ['2026-05-01', '2026-05-27', '2026-05-31']);
  assert.match(result.warning ?? '', /503|live/i);
});

test('resolveHolidays falls back when the live payload fails validation', async () => {
  const garbage = fakeFetch('not,a,holiday,file\ngarbage');
  const result = await resolveHolidays({
    target: { year: 2026, month: 5 },
    snapshot: rows(),
    fetchImpl: garbage,
    delayMs: 0,
    minApiIntervalMs: 0,
  });
  assert.equal(result.source, 'snapshot');
  assert.equal(result.covered, true);
});

test('resolveHolidays prefers the live source when it succeeds', async () => {
  const result = await resolveHolidays({
    target: { year: 2026, month: 6 },
    snapshot: [],
    fetchImpl: fakeFetch(CSV),
    delayMs: 0,
    minApiIntervalMs: 0,
  });
  assert.equal(result.source, 'live');
  assert.deepEqual(result.dates, ['2026-06-01']);
});

// AC15 (R15): neither source covers the year — report, do not throw.
test('resolveHolidays reports uncovered when neither source has the year', async () => {
  const failing = (async () => okResponse('nope', 503)) as unknown as typeof fetch;
  const result = await resolveHolidays({
    target: { year: 2030, month: 5 },
    snapshot: rows(),
    fetchImpl: failing,
    delayMs: 0,
    minApiIntervalMs: 0,
  });
  assert.equal(result.covered, false);
  assert.deepEqual(result.dates, []);
});

// A covered year with no holidays that month is NOT the same as uncovered:
// one yields the informational message (R16), the other degrades (R15).
test('resolveHolidays distinguishes a covered empty month from an uncovered year', async () => {
  const result = await resolveHolidays({
    target: { year: 2026, month: 7 },
    snapshot: rows(),
    fetchImpl: fakeFetch(CSV),
    delayMs: 0,
    minApiIntervalMs: 0,
  });
  assert.equal(result.covered, true);
  assert.deepEqual(result.dates, []);
});

// AC8 (R11): a valid live payload outside the target year is incomplete data,
// not evidence that the target month has no holiday. The covering snapshot is
// the safe source in that case.
test('resolveHolidays falls back when live data does not cover the target year', async () => {
  const liveOutsideTargetYear = fakeFetch('date,day,holiday\n2025-12-25,Thursday,Christmas Day');
  const result = await resolveHolidays({
    target: { year: 2026, month: 5 },
    snapshot: rows(),
    fetchImpl: liveOutsideTargetYear,
    delayMs: 0,
    minApiIntervalMs: 0,
  });

  assert.equal(result.source, 'snapshot');
  assert.equal(result.covered, true);
  assert.deepEqual(result.dates, ['2026-05-01', '2026-05-27', '2026-05-31']);
});

// AC10 (R13): holiday-source requests are bounded and quota paced. The
// intended injectable clock/sleeper keeps the test deterministic; production
// code must use it (or an equivalent observable boundary) rather than sleeping
// in real time.
test('fetchLiveHolidays supplies an abort signal for every request', async () => {
  let calls = 0;
  const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
    assert.ok(init?.signal instanceof AbortSignal, 'each holiday request needs an abort signal');
    calls += 1;
    if (calls === 1) return okResponse({ data: { message: 'initiated' } }, 201);
    if (calls === 2) return okResponse({ data: { url: 'https://example.test/holidays.csv' } }, 201);
    return okResponse(CSV);
  }) as unknown as typeof fetch;

  const fetched = await fetchLiveHolidays({
    fetchImpl,
    requestTimeoutMs: 30_000,
    minApiIntervalMs: 0,
  });
  assert.equal(fetched.length, 8);
});

test('fetchLiveHolidays paces API calls at the quota interval', async () => {
  const requestTimes: number[] = [];
  const waits: number[] = [];
  let now = 0;
  let polls = 0;
  const fetchImpl = (async (input: string | URL | Request, _init?: RequestInit) => {
    if (String(input).startsWith('https://api-open.data.gov.sg/')) requestTimes.push(now);
    polls += 1;
    if (polls === 1) return okResponse({ data: { message: 'initiated' } }, 201);
    if (polls === 2) return okResponse({ data: { status: 'pending' } }, 201);
    if (polls === 3) {
      return okResponse({ data: { url: 'https://example.test/holidays.csv' } }, 201);
    }
    return okResponse(CSV);
  }) as unknown as typeof fetch;

  await fetchLiveHolidays({
    fetchImpl,
    delayMs: 0,
    minApiIntervalMs: 5_000,
    sleepImpl: async (ms: number) => {
      waits.push(ms);
      now += ms;
    },
    requestTimeoutMs: 30_000,
    nowImpl: () => now,
  });

  assert.ok(
    waits.every((ms) => ms >= 5_000),
    `quota waits were ${waits.join(', ')}`,
  );
  for (let index = 1; index < requestTimes.length; index += 1) {
    assert.ok(
      (requestTimes[index] ?? 0) - (requestTimes[index - 1] ?? 0) >= 5_000,
      `requests ${index - 1} and ${index} were less than five seconds apart`,
    );
  }
});

// AC10 (R13): data.gov.sg may direct callers to wait before retrying 429. That
// wait belongs to the holiday adapter, not the Telegram retry policy.
test('fetchLiveHolidays honours retry_after after a dataset 429', async () => {
  const waits: number[] = [];
  let initiated = false;
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('initiate-download')) {
      if (!initiated) {
        initiated = true;
        return okResponse({ parameters: { retry_after: 7 } }, 429);
      }
      return okResponse({ data: { message: 'initiated' } }, 201);
    }
    if (url.includes('poll-download')) {
      return okResponse({ data: { url: 'https://example.test/holidays.csv' } }, 201);
    }
    return okResponse(CSV);
  }) as unknown as typeof fetch;

  await fetchLiveHolidays({
    fetchImpl,
    delayMs: 0,
    minApiIntervalMs: 0,
    sleepImpl: async (ms: number) => {
      waits.push(ms);
    },
  });

  assert.deepEqual(waits, [7_000]);
});
