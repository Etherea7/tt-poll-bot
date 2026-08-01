import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { parseConfig } from '../src/config.ts';
import { saveDeliveryRecord } from '../src/delivery.ts';
import type { HolidayRow } from '../src/holidays.ts';
import { run } from '../src/run.ts';

const SNAPSHOT: HolidayRow[] = [
  { date: '2026-11-08', name: 'Deepavali' },
  { date: '2026-11-09', name: 'Deepavali (Observed)' },
  { date: '2026-09-15', name: 'Fake Holiday' },
];

const tempPath = (name = 'delivered.json') => join(mkdtempSync(join(tmpdir(), 'ttrun-')), name);
const NOW = new Date('2026-10-25T01:17:00Z'); // targets 2026-11

const env = (over: Record<string, string | undefined> = {}) => ({
  TELEGRAM_BOT_TOKEN: '123:FAKE',
  TELEGRAM_GROUP_IDS: '-1001,-1002',
  ...over,
});

/** Records every Telegram call and always succeeds. */
const spyFetch = () => {
  const calls: Array<{ method: string; chatId: unknown }> = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { chat_id?: unknown };
    calls.push({ method: String(input).split('/').pop() ?? '', chatId: body.chat_id });
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
};

// No holidayFetchImpl: holidays resolve from the snapshot with no network, so
// any recorded call is necessarily a Telegram call.
const deps = (fetchImpl: typeof fetch, deliveryPath: string) => ({
  now: NOW,
  snapshot: SNAPSHOT,
  deliveryPath,
  telegram: { fetchImpl, baseDelayMs: 0 },
});

// AC24 (R24): invalid configuration fails before any request.
test('parseConfig rejects a missing token outside preview', () => {
  assert.throws(
    () => parseConfig(env({ TELEGRAM_BOT_TOKEN: undefined }), []),
    /TELEGRAM_BOT_TOKEN/,
  );
});

test('parseConfig rejects an empty destination allow-list', () => {
  assert.throws(() => parseConfig(env({ TELEGRAM_GROUP_IDS: '  ' }), []), /TELEGRAM_GROUP_IDS/);
});

test('parseConfig allows a missing token in preview mode', () => {
  const config = parseConfig(env({ TELEGRAM_BOT_TOKEN: undefined }), ['--preview']);
  assert.equal(config.preview, true);
});

test('parseConfig reads flags and the scope selector', () => {
  const config = parseConfig(env(), ['--month', '2027-01', '--only', 'holidays', '--force']);
  assert.equal(config.targetMonth, '2027-01');
  assert.deepEqual(config.kinds, ['holidays']);
  assert.equal(config.force, true);
  assert.deepEqual(config.chatIds, ['-1001', '-1002']);
});

test('parseConfig rejects an unknown poll kind', () => {
  assert.throws(() => parseConfig(env(), ['--only', 'sundays']), /sundays/);
});

// AC11 (R11): each poll goes once to each destination and nowhere else.
test('run sends every poll once to every configured destination', async () => {
  const { fetchImpl, calls } = spyFetch();
  const path = tempPath();
  const outcome = await run(parseConfig(env(), []), deps(fetchImpl, path));

  assert.equal(outcome.exitCode, 0);
  const polls = calls.filter((call) => call.method === 'sendPoll');
  assert.equal(polls.length, 6); // 3 kinds x 2 destinations
  assert.deepEqual([...new Set(polls.map((call) => call.chatId))].sort(), ['-1001', '-1002']);
});

// AC18 (R23): the delivery record is written after success.
test('run records every delivered kind', async () => {
  const { fetchImpl } = spyFetch();
  const path = tempPath();
  await run(parseConfig(env(), []), deps(fetchImpl, path));
  const record = JSON.parse(readFileSync(path, 'utf8')) as Record<string, string[]>;
  assert.deepEqual(record['2026-11']?.sort(), ['fridays', 'holidays', 'saturdays']);
});

// AC20 (R19): nothing to do means no request and a zero exit.
test('run skips entirely when every kind is already delivered', async () => {
  const { fetchImpl, calls } = spyFetch();
  const path = tempPath();
  saveDeliveryRecord({ '2026-11': ['fridays', 'saturdays', 'holidays'] }, path);

  const outcome = await run(parseConfig(env(), []), deps(fetchImpl, path));
  assert.equal(outcome.exitCode, 0);
  assert.equal(outcome.skipped, true);
  assert.equal(calls.length, 0);
});

// AC21 (R20): a recovery re-run sends only what is missing.
test('run sends only the kinds not yet delivered', async () => {
  const { fetchImpl, calls } = spyFetch();
  const path = tempPath();
  saveDeliveryRecord({ '2026-11': ['fridays', 'saturdays'] }, path);

  const outcome = await run(parseConfig(env(), []), deps(fetchImpl, path));
  assert.deepEqual(outcome.sentKinds, ['holidays']);
  assert.equal(calls.filter((call) => call.method === 'sendPoll').length, 2); // 1 kind x 2 chats
});

// AC2 (R3): a completed destination/kind is not eligible for automatic
// recovery merely because a later destination for that kind failed.
test('run does not resend a successful destination after another destination fails', async () => {
  const path = tempPath();
  const firstRunCalls: Array<{ chatId: unknown }> = [];
  let firstAttempt = 0;
  const firstRunFetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    firstAttempt += 1;
    const body = JSON.parse(String(init?.body ?? '{}')) as { chat_id?: unknown };
    firstRunCalls.push({ chatId: body.chat_id });
    if (firstAttempt === 2) {
      return new Response(JSON.stringify({ ok: false, description: 'blocked' }), { status: 403 });
    }
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
  }) as unknown as typeof fetch;

  const failed = await run(parseConfig(env(), []), deps(firstRunFetch, path));
  assert.equal(failed.exitCode, 1);
  assert.deepEqual(firstRunCalls.map((call) => call.chatId), ['-1001', '-1002']);

  const { fetchImpl: recoveryFetch, calls: recoveryCalls } = spyFetch();
  const recovered = await run(parseConfig(env(), []), deps(recoveryFetch, path));

  assert.equal(
    recoveryCalls.filter((call) => call.method === 'sendPoll' && call.chatId === '-1001').length,
    0,
    'the first destination already received the Friday poll',
  );
  assert.equal(recovered.exitCode, 1, 'an incomplete destination claim requires operator recovery');
});

// AC4 (R5, R6): an ambiguous request has a durable pre-send claim. A later
// automatic run owned by another claim id must not guess that it is safe to
// send the same destination/kind again.
test('run does not automatically resend a destination after an ambiguous timeout', async () => {
  const path = tempPath();
  let firstCalls = 0;
  const timeoutFetch = (async () => {
    firstCalls += 1;
    throw new DOMException('The operation was aborted.', 'TimeoutError');
  }) as unknown as typeof fetch;

  const ambiguous = await run(parseConfig(env(), []), deps(timeoutFetch, path));
  assert.equal(ambiguous.exitCode, 1);
  assert.equal(firstCalls, 1);

  const { fetchImpl: recoveryFetch, calls: recoveryCalls } = spyFetch();
  const recovered = await run(parseConfig(env(), []), deps(recoveryFetch, path));

  assert.equal(recoveryCalls.length, 0, 'an ambiguous destination/kind must not be sent automatically');
  assert.equal(recovered.exitCode, 1, 'a different automatic run must stop at the unresolved claim');
});

// AC22 (R21): force overrides the guard.
test('run resends everything when forced', async () => {
  const { fetchImpl, calls } = spyFetch();
  const path = tempPath();
  saveDeliveryRecord({ '2026-11': ['fridays', 'saturdays', 'holidays'] }, path);

  await run(parseConfig(env(), ['--force']), deps(fetchImpl, path));
  assert.equal(calls.filter((call) => call.method === 'sendPoll').length, 6);
});

// AC23 (R22): the scope selector narrows the run.
test('run honours the scope selector', async () => {
  const { fetchImpl, calls } = spyFetch();
  const outcome = await run(
    parseConfig(env(), ['--only', 'holidays']),
    deps(fetchImpl, tempPath()),
  );
  assert.deepEqual(outcome.sentKinds, ['holidays']);
  assert.equal(calls.filter((call) => call.method === 'sendPoll').length, 2);
});

// AC31 (R31): preview issues no request at all.
test('run in preview mode contacts nothing', async () => {
  const { fetchImpl, calls } = spyFetch();
  const outcome = await run(parseConfig(env(), ['--preview']), deps(fetchImpl, tempPath()));
  assert.equal(outcome.exitCode, 0);
  assert.equal(calls.length, 0);
  assert.ok(outcome.lines.join('\n').includes('8 Nov'));
});

// AC12 (R12): a build failure must not leave a month half-posted.
test('run issues no request when building the polls fails', async () => {
  const { fetchImpl, calls } = spyFetch();
  // Five Saturdays in 2026-10 with three slots overflows the option ceiling.
  const outcome = await run(
    parseConfig(env(), ['--month', '2026-10', '--slots', '10am-12pm,2-4pm,7-9pm']),
    deps(fetchImpl, tempPath()),
  );
  assert.equal(outcome.exitCode, 1);
  assert.equal(calls.length, 0, 'no Telegram request may be issued after a build failure');
});

// AC16 (R16): a covered month with no holidays sends a message, not a poll.
test('run sends the informational message for a month with no holidays', async () => {
  const { fetchImpl, calls } = spyFetch();
  const outcome = await run(
    parseConfig(env(), ['--month', '2026-12']),
    deps(fetchImpl, tempPath()),
  );
  assert.equal(outcome.exitCode, 0);
  assert.equal(calls.filter((call) => call.method === 'sendMessage').length, 2);
});

// AC9 (R12): missing coverage is not the same as a covered month with zero
// holidays. The holiday payload must be suppressed rather than making a false
// factual claim.
test('run omits holiday work when the target year is uncovered', async () => {
  const { fetchImpl, calls } = spyFetch();
  const outcome = await run(
    parseConfig(env(), ['--preview', '--month', '2030-05']),
    deps(fetchImpl, tempPath()),
  );

  assert.equal(outcome.exitCode, 1);
  assert.equal(calls.length, 0);
  assert.doesNotMatch(outcome.lines.join('\n'), /\[poll: holidays\]|\[message: holidays\]/);
});

// AC13 (R13): the bot never learns a destination from Telegram.
test('no source file derives a chat id from a Telegram response', () => {
  const files = readdirSync('src').filter((name) => name.endsWith('.ts'));
  for (const file of files) {
    const source = readFileSync(join('src', file), 'utf8');
    assert.ok(
      !/\.chat\??\.\s*id/.test(source),
      `${file} appears to read a chat id from a Telegram payload`,
    );
  }
});
