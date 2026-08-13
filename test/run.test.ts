import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { loadAttendanceState } from '../src/attendance.ts';
import { parseConfig } from '../src/config.ts';
import type { HolidayRow } from '../src/holidays.ts';
import { run } from '../src/run.ts';

const SNAPSHOT: HolidayRow[] = [
  { date: '2026-11-08', name: 'Deepavali' },
  { date: '2026-11-09', name: 'Deepavali (Observed)' },
  { date: '2026-09-15', name: 'Fake Holiday' },
];
const NOW = new Date('2026-10-25T01:17:00Z'); // targets 2026-11
const tempPath = (name = 'delivered.json') => join(mkdtempSync(join(tmpdir(), 'ttrun-')), name);
const env = (over: Record<string, string | undefined> = {}) => ({
  TELEGRAM_BOT_TOKEN: '123:FAKE',
  TELEGRAM_DESTINATIONS: 'test=-1001,club=-1002',
  ...over,
});

const spyFetch = () => {
  const calls: Array<{ method: string; chatId: unknown; text: unknown }> = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { chat_id?: unknown; text?: unknown };
    calls.push({
      method: String(input).split('/').pop() ?? '',
      chatId: body.chat_id,
      text: body.text,
    });
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
};

const deps = (fetchImpl: typeof fetch, deliveryPath: string) => ({
  now: NOW,
  snapshot: SNAPSHOT,
  deliveryPath,
  // Always isolated: without this the run falls back to the repository's own
  // state/attendance.json and the suite writes into the working tree.
  attendancePath: join(mkdtempSync(join(tmpdir(), 'ttatt-')), 'attendance.json'),
  telegram: { fetchImpl },
});

const prepare = (path: string, args: readonly string[] = []) =>
  run(
    parseConfig(env(), ['--prepare', '--claim', 'run-1', ...args]),
    deps(spyFetch().fetchImpl, path),
  );
const live = (
  path: string,
  fetchImpl: typeof fetch,
  args: readonly string[] = [],
  claim = 'run-1',
) => run(parseConfig(env(), ['--live', '--claim', claim, ...args]), deps(fetchImpl, path));

test('parseConfig defaults to preview and accepts alias destinations without a token', () => {
  const config = parseConfig(env({ TELEGRAM_BOT_TOKEN: undefined }), []);
  assert.equal(config.mode, 'preview');
  assert.deepEqual(
    config.destinations.map((destination) => destination.alias),
    ['test', 'club'],
  );
});

test('parseConfig accepts explicit prepare and live modes', () => {
  const config = parseConfig(env(), ['--prepare', '--claim', 'run-1', '--only', 'holidays']);
  assert.equal(config.mode, 'prepare');
  assert.equal(config.claimId, 'run-1');
  assert.deepEqual(config.kinds, ['holidays']);
});

test('parseConfig rejects unsafe destination configuration and malformed argv before transport', () => {
  const invalid: Array<[Record<string, string | undefined>, readonly string[]]> = [
    [env({ TELEGRAM_DESTINATIONS: 'test=-1001,test=-1002' }), []],
    [env({ TELEGRAM_DESTINATIONS: 'test=-1001,club=-1001' }), []],
    [env({ TELEGRAM_DESTINATIONS: 'bad alias=-1001' }), []],
    [env(), ['--live']],
    [env({ TELEGRAM_BOT_TOKEN: undefined }), ['--live', '--claim', 'run-1']],
    [env(), ['--preview', '--live', '--claim', 'run-1']],
    [env(), ['--prepare', '--claim', '']],
    [env(), ['--only']],
    [env(), ['--slots', '10am-12pm,']],
    [env(), ['--slots', '10am-12pm,10am-12pm']],
    [env(), ['--prepare', '--claim', 'invalid claim id']],
    [env(), ['--to', 'club,club']],
    [env(), ['--to', 'missing']],
    [env(), ['--unknown']],
  ];
  for (const [variables, argv] of invalid) assert.throws(() => parseConfig(variables, argv));
});

test('prepare persists every claim before any transport and live delivers only its claims', async () => {
  const path = tempPath();
  const prepared = await prepare(path);
  assert.equal(prepared.exitCode, 0);
  const stateBeforeLive = readFileSync(path, 'utf8');
  assert.match(stateBeforeLive, /"test"/);
  assert.doesNotMatch(stateBeforeLive, /-1001|-1002/);

  const { fetchImpl, calls } = spyFetch();
  const outcome = await live(path, fetchImpl);
  assert.equal(outcome.exitCode, 0);
  // Four poll kinds across two destinations.
  assert.equal(calls.filter((call) => call.method === 'sendPoll').length, 8);
  const record = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  assert.match(JSON.stringify(record), /"delivered"/);
});

test('live skips all already delivered claims', async () => {
  const path = tempPath();
  await prepare(path);
  const { fetchImpl } = spyFetch();
  await live(path, fetchImpl);
  const { fetchImpl: retryFetch, calls } = spyFetch();
  const outcome = await live(path, retryFetch);
  assert.equal(outcome.exitCode, 0);
  assert.equal(outcome.skipped, true);
  assert.equal(calls.length, 0);
});

test('live sends only the kinds prepared by its scoped claim', async () => {
  const path = tempPath();
  const prepared = await prepare(path, ['--only', 'holidays']);
  assert.equal(prepared.exitCode, 0);
  const { fetchImpl, calls } = spyFetch();
  const outcome = await live(path, fetchImpl, ['--only', 'holidays']);
  assert.deepEqual(outcome.sentKinds, ['holidays']);
  assert.equal(calls.filter((call) => call.method === 'sendPoll').length, 2);
});

// AC2 (R3): the successful alias becomes delivered immediately; a later run
// with a different claim cannot resend it after club's failure.
test('run does not resend a successful destination after another destination fails', async () => {
  const path = tempPath();
  await prepare(path);
  let firstAttempt = 0;
  const failingFetch = (async () => {
    firstAttempt += 1;
    if (firstAttempt === 2) return new Response(JSON.stringify({ ok: false }), { status: 403 });
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
  }) as unknown as typeof fetch;
  const failed = await live(path, failingFetch);
  assert.equal(failed.exitCode, 1);

  const { fetchImpl: recoveryFetch, calls } = spyFetch();
  const recovered = await live(path, recoveryFetch, [], 'run-2');
  assert.equal(calls.length, 0);
  assert.equal(recovered.exitCode, 1);
});

// AC4 (R5, R6): an ambiguous request leaves the pre-send claim in place. A
// different claim owner stops with no automatic recovery send.
test('run does not automatically resend a destination after an ambiguous timeout', async () => {
  const path = tempPath();
  await prepare(path);
  const timeoutFetch = (async () => {
    throw new DOMException('The operation was aborted.', 'TimeoutError');
  }) as unknown as typeof fetch;
  const ambiguous = await live(path, timeoutFetch);
  assert.equal(ambiguous.exitCode, 1);

  const { fetchImpl: recoveryFetch, calls } = spyFetch();
  const recovered = await live(path, recoveryFetch, [], 'run-2');
  assert.equal(calls.length, 0);
  assert.equal(recovered.exitCode, 1);
});

test('force replaces only a previous claim during prepare', async () => {
  const path = tempPath();
  await prepare(path);
  const forced = await run(
    parseConfig(env(), ['--prepare', '--claim', 'run-2', '--force']),
    deps(spyFetch().fetchImpl, path),
  );
  assert.equal(forced.exitCode, 0);
  const { fetchImpl, calls } = spyFetch();
  const outcome = await live(path, fetchImpl, [], 'run-2');
  assert.equal(outcome.exitCode, 0);
  assert.equal(calls.filter((call) => call.method === 'sendPoll').length, 8);
  // Spec 004: a full run also posts one roster per destination. This spy
  // returns no message id, so the roster is correctly not pinned and not
  // recorded; pinning is asserted where the spy supplies one.
  assert.equal(calls.filter((call) => call.method === 'sendMessage').length, 2);
  assert.equal(calls.filter((call) => call.method === 'pinChatMessage').length, 0);
  assert.equal(calls.length, 10);
});

test('force recovery can target only the inspected destination and kind', async () => {
  const path = tempPath();
  await prepare(path);
  let attempts = 0;
  const partialFailure = (async () => {
    attempts += 1;
    if (attempts === 2) return new Response(JSON.stringify({ ok: false }), { status: 403 });
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
  }) as unknown as typeof fetch;
  await live(path, partialFailure);

  const forced = await run(
    parseConfig(env(), [
      '--prepare',
      '--claim',
      'run-2',
      '--force',
      '--to',
      'club',
      '--only',
      'fridays',
    ]),
    deps(spyFetch().fetchImpl, path),
  );
  assert.equal(forced.exitCode, 0);

  const { fetchImpl, calls } = spyFetch();
  const recovered = await live(path, fetchImpl, ['--to', 'club', '--only', 'fridays'], 'run-2');
  assert.equal(recovered.exitCode, 0);
  assert.deepEqual(
    calls.map((call) => call.chatId),
    ['-1002'],
  );
  const state = readFileSync(path, 'utf8');
  assert.match(state, /"test"[\s\S]*"delivered"/);
});

test('preview contacts nothing and build failures occur before a claim or request', async () => {
  const { fetchImpl, calls } = spyFetch();
  const preview = await run(
    parseConfig(env(), ['--month', '2026-11']),
    deps(fetchImpl, tempPath()),
  );
  assert.equal(preview.exitCode, 0);
  assert.equal(calls.length, 0);

  const path = tempPath();
  const overflow = await run(
    parseConfig(env(), [
      '--prepare',
      '--claim',
      'run-1',
      '--month',
      '2026-10',
      '--slots',
      '10am-12pm,2-4pm,7-9pm',
    ]),
    deps(spyFetch().fetchImpl, path),
  );
  assert.equal(overflow.exitCode, 1);
  assert.throws(() => readFileSync(path, 'utf8'));
});

test('offline preview uses the snapshot without a false live-source warning', async () => {
  const outcome = await run(
    parseConfig(env(), ['--offline', '--month', '2026-11']),
    deps(spyFetch().fetchImpl, tempPath()),
  );
  assert.equal(outcome.exitCode, 0);
  assert.doesNotMatch(outcome.lines.join('\n'), /live holiday source unavailable/i);
});

test('covered empty month sends its informational message after prepare', async () => {
  const path = tempPath();
  await prepare(path, ['--month', '2026-12']);
  const { fetchImpl, calls } = spyFetch();
  const outcome = await live(path, fetchImpl, ['--month', '2026-12']);
  assert.equal(outcome.exitCode, 0);
  const sent = calls.filter((call) => call.method === 'sendMessage');
  // Spec 004 adds a roster message, so identify the informational one by text.
  assert.equal(sent.filter((call) => /No public holidays/.test(String(call.text))).length, 2);
  assert.equal(sent.filter((call) => /TT attendance/.test(String(call.text))).length, 2);
});

test('run omits holiday work when the target year is uncovered', async () => {
  const { fetchImpl, calls } = spyFetch();
  const outcome = await run(
    parseConfig(env(), ['--month', '2030-05']),
    deps(fetchImpl, tempPath()),
  );
  assert.equal(outcome.exitCode, 1);
  assert.equal(calls.length, 0);
  assert.doesNotMatch(outcome.lines.join('\n'), /\[poll: holidays\]|\[message: holidays\]/);
});

test('prepare claims Friday and Saturday work when holiday coverage is unavailable', async () => {
  const path = tempPath();
  const outcome = await run(
    parseConfig(env(), ['--prepare', '--claim', 'run-1', '--month', '2030-05']),
    deps(spyFetch().fetchImpl, path),
  );
  assert.equal(outcome.exitCode, 0);
  const state = readFileSync(path, 'utf8');
  assert.match(state, /"fridays"/);
  assert.match(state, /"saturdays"/);
  assert.doesNotMatch(state, /"holidays"/);
});

test('no source file derives a chat id from a Telegram response', () => {
  const files = readdirSync('src').filter((name) => name.endsWith('.ts'));
  for (const file of files) {
    const source = readFileSync(join('src', file), 'utf8');
    assert.ok(!/\.chat\??\.\s*id/.test(source), `${file} appears to read a chat id from Telegram`);
  }
});

// ---------------------------------------------------------------------------
// Spec 004 — attendance registration and the roster message
// ---------------------------------------------------------------------------

/** A fetch double that answers with realistic Telegram results. */
const attendanceFetch = () => {
  const calls: Array<{ method: string; chatId: unknown; body: Record<string, unknown> }> = [];
  let pollId = 0;
  let messageId = 100;
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const method = String(input).split('/').pop() ?? '';
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    calls.push({ method, chatId: body.chat_id, body });

    messageId += 1;
    if (method === 'sendPoll') {
      pollId += 1;
      const options = (body.options as Array<{ text: string }>).map((option, index) => ({
        text: option.text,
        persistent_id: `p${pollId}-${index}`,
      }));
      return new Response(
        JSON.stringify({
          ok: true,
          result: { message_id: messageId, poll: { id: `poll-${pollId}`, options } },
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ ok: true, result: { message_id: messageId } }), {
      status: 200,
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
};

const attendanceDeps = (fetchImpl: typeof fetch, deliveryPath: string, attendancePath: string) => ({
  now: NOW,
  snapshot: SNAPSHOT,
  deliveryPath,
  attendancePath,
  telegram: { fetchImpl },
});

const liveWithAttendance = (
  deliveryPath: string,
  attendancePath: string,
  fetchImpl: typeof fetch,
  claim = 'run-1',
) =>
  run(
    parseConfig(env(), ['--live', '--claim', claim]),
    attendanceDeps(fetchImpl, deliveryPath, attendancePath),
  );

const rosterMessages = (calls: Array<{ method: string; body: Record<string, unknown> }>) =>
  calls.filter(
    (call) => call.method === 'sendMessage' && /TT attendance/.test(String(call.body.text)),
  );

// AC9 (R9, R10): the poll id exists only in the send response, so it is bound
// to its destination there or not at all.
test('a live run registers every delivered poll against its destination', async () => {
  const deliveryPath = tempPath();
  const attendancePath = join(dirname(deliveryPath), 'attendance.json');
  await prepare(deliveryPath);
  const { fetchImpl } = attendanceFetch();

  await liveWithAttendance(deliveryPath, attendancePath, fetchImpl);

  const state = loadAttendanceState(attendancePath);
  const registered = Object.values(state.polls);
  assert.equal(registered.length, 8, 'four polls to each of two destinations');
  assert.deepEqual([...new Set(registered.map((poll) => poll.alias))].sort(), ['club', 'test']);
  assert.ok(registered.every((poll) => poll.month === '2026-11'));

  const friday = registered.find((poll) => poll.kind === 'fridays' && poll.alias === 'test');
  assert.ok(friday);
  assert.ok(friday.messageId > 0, 'the message id must be captured');
  // Sessions travel with the payload, so option meanings are exact.
  assert.deepEqual(friday.options[0]?.session, { date: '2026-11-06', slot: null });
  assert.equal(friday.options.at(-1)?.cmi, true, 'the opt-out answer is flagged, not a session');
  assert.ok(friday.options.every((option) => option.persistentId !== ''));
});

// AC10 (R11): attendance is optional; poll delivery is not.
test('a failed attendance registration still delivers every poll', async () => {
  const deliveryPath = tempPath();
  // A path whose parent is a file cannot be created, so every save throws.
  const blocked = join(deliveryPath, 'attendance.json');
  await prepare(deliveryPath);
  const { fetchImpl, calls } = attendanceFetch();

  const outcome = await liveWithAttendance(deliveryPath, blocked, fetchImpl);

  assert.equal(calls.filter((call) => call.method === 'sendPoll').length, 8);
  assert.ok(
    outcome.lines.some((line) => /attendance/i.test(line)),
    'the degradation must be reported',
  );
  const record = JSON.parse(readFileSync(deliveryPath, 'utf8'));
  assert.equal(record['2026-11'].test.fridays.status, 'delivered');
});

// AC14 (R15): the roster is claimed like a poll, so a retry cannot post two.
test('the roster is posted once per destination and never twice', async () => {
  const deliveryPath = tempPath();
  const attendancePath = join(dirname(deliveryPath), 'attendance.json');
  await prepare(deliveryPath);
  const first = attendanceFetch();

  await liveWithAttendance(deliveryPath, attendancePath, first.fetchImpl);
  assert.equal(rosterMessages(first.calls).length, 2, 'one roster per destination');

  const state = loadAttendanceState(attendancePath);
  assert.equal(Object.keys(state.rosters).length, 2);

  // A second run under a fresh claim must find the roster already delivered.
  const second = attendanceFetch();
  await prepare(deliveryPath);
  await liveWithAttendance(deliveryPath, attendancePath, second.fetchImpl, 'run-2');
  assert.equal(
    rosterMessages(second.calls).length,
    0,
    'a delivered roster must not be posted again',
  );
});

// AC15 (R16): a standalone message, pinned without waking anybody.
test('the roster is pinned without a notification', async () => {
  const deliveryPath = tempPath();
  const attendancePath = join(dirname(deliveryPath), 'attendance.json');
  await prepare(deliveryPath);
  const { fetchImpl, calls } = attendanceFetch();

  await liveWithAttendance(deliveryPath, attendancePath, fetchImpl);

  const pins = calls.filter((call) => call.method === 'pinChatMessage');
  assert.equal(pins.length, 2);
  assert.ok(
    pins.every((pin) => pin.body.disable_notification === true),
    'pinning must never notify',
  );
});

// R15, R23: a roster record without a message id is unusable — nothing can
// edit that message later — and it fails `parseAttendanceState` on the next
// load, which would then break every subsequent collection run. Telegram
// always returns a message id on success, so a missing one means something is
// wrong: record nothing rather than poison the state file.
test('no roster record is written when Telegram returns no message id', async () => {
  const deliveryPath = tempPath();
  const attendancePath = join(dirname(deliveryPath), 'attendance.json');
  await prepare(deliveryPath);
  const { fetchImpl, calls } = spyFetch();

  const outcome = await run(
    parseConfig(env(), ['--live', '--claim', 'run-1']),
    attendanceDeps(fetchImpl, deliveryPath, attendancePath),
  );

  assert.equal(outcome.exitCode, 0, 'poll delivery must still succeed');
  assert.equal(calls.filter((call) => call.method === 'sendPoll').length, 8);
  assert.deepEqual(loadAttendanceState(attendancePath).rosters, {});
  assert.equal(
    calls.filter((call) => call.method === 'pinChatMessage').length,
    0,
    'nothing can be pinned without a message id',
  );
  assert.ok(outcome.lines.some((line) => /message id/i.test(line)));
});

// Tests must never write into the repository's own state directory.
test('a run given no attendance path does not write into the repository', () => {
  const source = readFileSync('test/run.test.ts', 'utf8');
  assert.match(
    source,
    /attendancePath: join\(mkdtempSync/,
    'the shared deps helper must supply a temporary attendance path',
  );
});
