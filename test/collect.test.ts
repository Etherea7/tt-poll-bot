import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { AttendanceState, RegisteredPoll } from '../src/attendance.ts';
import {
  emptyAttendanceState,
  loadAttendanceState,
  registerPoll,
  rosterKey,
  saveAttendanceState,
} from '../src/attendance.ts';
import type { CollectConfig } from '../src/collect.ts';
import { collect } from '../src/collect.ts';

const TOKEN = '123456:FAKE-TEST-TOKEN-NOT-REAL';

const fridayPoll: RegisteredPoll = {
  alias: 'test',
  month: '2026-09',
  kind: 'fridays',
  messageId: 10,
  options: [
    {
      persistentId: 'f-4',
      label: '4 Sep',
      session: { date: '2026-09-04', slot: null },
      cmi: false,
    },
    { persistentId: 'f-cmi', label: 'cmi', session: null, cmi: true },
  ],
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Records every Bot API call and replays a scripted response per method. */
const recorder = (script: Array<() => Response | Promise<Response>>) => {
  const calls: Array<{ method: string; body: Record<string, unknown> }> = [];
  let index = 0;
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      method: url.slice(url.lastIndexOf('/') + 1),
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
    });
    const next = script[Math.min(index, script.length - 1)];
    index += 1;
    if (!next) throw new Error('no response configured');
    return next();
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
};

const withTempState = <T>(state: AttendanceState, body: (path: string) => T): T => {
  const directory = mkdtempSync(join(tmpdir(), 'collect-'));
  const path = join(directory, 'state', 'attendance.json');
  try {
    saveAttendanceState(state, path);
    return body(path);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

const config = (statePath: string): CollectConfig => ({
  token: TOKEN,
  destinations: [{ alias: 'test', chatId: '-1001' }],
  statePath,
});

const NOW = new Date('2026-09-01T06:35:00Z');

const answer = (updateId: number, ids: readonly string[]) => ({
  update_id: updateId,
  poll_answer: {
    poll_id: '5100',
    user: { id: 7, first_name: 'Alice' },
    option_persistent_ids: ids,
  },
});

// AC1 (R1): the run resumes from the stored offset and persists the new one.
test('collect resumes from the stored offset and advances it', async () => {
  const base = { ...registerPoll(emptyAttendanceState(), '5100', fridayPoll), offset: 12 };

  await withTempState(base, async (statePath) => {
    const { fetchImpl, calls } = recorder([
      () => json({ ok: true, result: [answer(30, ['f-4'])] }),
      () => json({ ok: true, result: true }),
    ]);

    const outcome = await collect(config(statePath), {
      now: NOW,
      telegram: { fetchImpl },
    });

    assert.equal(outcome.exitCode, 0);
    assert.equal(calls[0]?.method, 'getUpdates');
    assert.equal(calls[0]?.body.offset, 12);
    assert.deepEqual(calls[0]?.body.allowed_updates, ['poll', 'poll_answer']);

    const saved = loadAttendanceState(statePath);
    assert.equal(saved.offset, 31, 'offset must advance past the highest update id');
    assert.deepEqual(saved.votes['5100']?.['7'], ['f-4']);
  });
});

// R1: paging within one run would acknowledge page 1 on Telegram's side while
// page 1 existed only on the ephemeral runner -- the durable copy is not pushed
// until after this process exits. One page per run means the only offset ever
// acknowledged is one a previous run already pushed.
test('collect reads exactly one page per run even when the page is full', async () => {
  const full = Array.from({ length: 100 }, (_, index) => answer(index + 1, ['f-4']));

  await withTempState(registerPoll(emptyAttendanceState(), '5100', fridayPoll), async (path) => {
    const { fetchImpl, calls } = recorder([
      () => json({ ok: true, result: full }),
      () => json({ ok: true, result: [answer(101, ['f-4'])] }),
    ]);

    const outcome = await collect(config(path), { now: NOW, telegram: { fetchImpl } });

    assert.equal(
      calls.filter((call) => call.method === 'getUpdates').length,
      1,
      'a second page must wait for the next run, after this one is pushed',
    );
    assert.equal(loadAttendanceState(path).offset, 101);
    assert.ok(
      outcome.lines.some((line) => /page was full/.test(line)),
      'a full page must say more updates remain',
    );
  });
});

// The offset only ever advances past updates a previous run already pushed, so
// a crash or a failed push simply re-reads them. Replaying is harmless because
// applying an answer replaces rather than merges (R3).
test('re-reading the same updates is idempotent', async () => {
  await withTempState(registerPoll(emptyAttendanceState(), '5100', fridayPoll), async (path) => {
    const replay = () =>
      recorder([() => json({ ok: true, result: [answer(5, ['f-4'])] })]).fetchImpl;

    await collect(config(path), { now: NOW, telegram: { fetchImpl: replay() } });
    const first = loadAttendanceState(path);

    // Simulate a failed push: the durable offset never advanced.
    saveAttendanceState({ ...first, offset: 0 }, path);
    await collect(config(path), { now: NOW, telegram: { fetchImpl: replay() } });

    assert.deepEqual(loadAttendanceState(path).votes, first.votes);
  });
});

// AC7 (R7): an update for a poll this system never registered changes nothing.
test('collect ignores updates for unregistered polls and counts them', async () => {
  await withTempState(emptyAttendanceState(), async (path) => {
    const { fetchImpl } = recorder([() => json({ ok: true, result: [answer(5, ['f-4'])] })]);

    const outcome = await collect(config(path), { now: NOW, telegram: { fetchImpl } });

    assert.equal(outcome.exitCode, 0);
    assert.equal(outcome.ignored, 1);
    const saved = loadAttendanceState(path);
    assert.deepEqual(saved.polls, {});
    assert.deepEqual(saved.votes, {});
    assert.deepEqual(saved.users, {});
  });
});

// AC16 (R17): a roster change is published by editing, never by a new message.
test('collect edits the roster in place when the render changed', async () => {
  const base: AttendanceState = {
    ...registerPoll(emptyAttendanceState(), '5100', fridayPoll),
    rosters: { [rosterKey('test', '2026-09')]: { messageId: 99, textHash: 'stale', pinned: true } },
  };

  await withTempState(base, async (path) => {
    const { fetchImpl, calls } = recorder([
      () => json({ ok: true, result: [answer(5, ['f-4'])] }),
      () => json({ ok: true, result: { message_id: 99 } }),
    ]);

    await collect(config(path), { now: NOW, telegram: { fetchImpl } });

    const edits = calls.filter((call) => call.method === 'editMessageText');
    assert.equal(edits.length, 1);
    assert.equal(edits[0]?.body.chat_id, '-1001');
    assert.equal(edits[0]?.body.message_id, 99);
    assert.match(String(edits[0]?.body.text), /Alice/);
    assert.equal(
      calls.filter((call) => call.method === 'sendMessage').length,
      0,
      'the roster must never be re-sent as a new message',
    );
  });
});

// AC18 (R18): Telegram rejects an unchanged edit, and a no-op edit is waste.
test('collect makes no edit when the render is unchanged', async () => {
  await withTempState(registerPoll(emptyAttendanceState(), '5100', fridayPoll), async (path) => {
    // First run establishes the roster hash.
    const first = recorder([
      () => json({ ok: true, result: [answer(5, ['f-4'])] }),
      () => json({ ok: true, result: { message_id: 99 } }),
    ]);
    const seeded: AttendanceState = {
      ...loadAttendanceState(path),
      rosters: {
        [rosterKey('test', '2026-09')]: { messageId: 99, textHash: 'stale', pinned: true },
      },
    };
    saveAttendanceState(seeded, path);
    await collect(config(path), { now: NOW, telegram: { fetchImpl: first.fetchImpl } });

    // Second run sees no new votes, so the render is identical.
    const second = recorder([() => json({ ok: true, result: [] })]);
    await collect(config(path), { now: NOW, telegram: { fetchImpl: second.fetchImpl } });

    assert.equal(
      second.calls.filter((call) => call.method === 'editMessageText').length,
      0,
      'an identical render must not be re-sent',
    );
  });
});

// AC17 (R17): once the month is over the roster stops changing.
test('collect leaves a roster alone once its month has ended', async () => {
  const base: AttendanceState = {
    ...registerPoll(emptyAttendanceState(), '5100', fridayPoll),
    rosters: { [rosterKey('test', '2026-09')]: { messageId: 99, textHash: 'stale', pinned: true } },
  };

  await withTempState(base, async (path) => {
    const { fetchImpl, calls } = recorder([
      () => json({ ok: true, result: [answer(5, ['f-4'])] }),
      () => json({ ok: true, result: { message_id: 99 } }),
    ]);

    await collect(config(path), {
      now: new Date('2026-10-02T02:00:00Z'),
      telegram: { fetchImpl },
    });

    assert.equal(calls.filter((call) => call.method === 'editMessageText').length, 0);
  });
});

// AC24 (R25): a failed run must go red so the operator finds out.
test('collect exits non-zero when getUpdates fails', async () => {
  await withTempState(emptyAttendanceState(), async (path) => {
    const { fetchImpl } = recorder([() => json({ ok: false, description: 'nope' }, 403)]);
    const outcome = await collect(config(path), { now: NOW, telegram: { fetchImpl } });
    assert.equal(outcome.exitCode, 1);
    assert.ok(outcome.lines.some((line) => /nope|403/.test(line)));
  });
});

// AC26 (R28): the token never reaches the output.
test('collect never prints the bot token', async () => {
  await withTempState(emptyAttendanceState(), async (path) => {
    const fetchImpl = (async () => {
      throw new TypeError(`connect failed to https://api.telegram.org/bot${TOKEN}/getUpdates`);
    }) as unknown as typeof fetch;

    const outcome = await collect(config(path), { now: NOW, telegram: { fetchImpl } });

    assert.equal(outcome.exitCode, 1);
    const printed = outcome.lines.join('\n');
    assert.ok(!printed.includes(TOKEN), 'token leaked into the run output');
    assert.match(printed, /REDACTED/);
  });
});

// AC25 (R27): collection cannot post a poll or disturb a delivery claim. The
// import graph is the guarantee — there is no code path to misuse.
test('the collection module cannot reach poll delivery', () => {
  const source = readFileSync(new URL('../src/collect.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bsendPoll\b/, 'collection must not be able to send a poll');
  assert.doesNotMatch(source, /delivery\.ts/, 'collection must not touch delivery claims');
  assert.doesNotMatch(source, /delivered\.json/);
});

// AC25 (R27): and the delivery record is untouched on disk even when a run fails.
test('a failing collection run leaves the delivery record untouched', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'collect-'));
  const statePath = join(directory, 'state', 'attendance.json');
  const deliveredPath = join(directory, 'state', 'delivered.json');
  try {
    saveAttendanceState(emptyAttendanceState(), statePath);
    const original = '{"2026-09":{"test":{"fridays":{"status":"delivered","claimId":"c-1"}}}}';
    writeFileSync(deliveredPath, original, 'utf8');

    const { fetchImpl } = recorder([() => json({ ok: false, description: 'boom' }, 500)]);
    const outcome = await collect(config(statePath), { now: NOW, telegram: { fetchImpl } });

    assert.equal(outcome.exitCode, 1);
    assert.equal(readFileSync(deliveredPath, 'utf8'), original);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

// Delivery marks the roster delivered before pinning and never revisits it, so
// without a retry here a transient permission error would leave that month's
// roster unpinned for good.
test('collect retries a pin that failed at delivery, once', async () => {
  const base: AttendanceState = {
    ...registerPoll(emptyAttendanceState(), '5100', fridayPoll),
    rosters: {
      [rosterKey('test', '2026-09')]: { messageId: 99, textHash: 'stale', pinned: false },
    },
  };

  await withTempState(base, async (path) => {
    const first = recorder([
      () => json({ ok: true, result: [answer(5, ['f-4'])] }),
      () => json({ ok: true, result: true }),
    ]);
    await collect(config(path), { now: NOW, telegram: { fetchImpl: first.fetchImpl } });

    assert.equal(
      first.calls.filter((call) => call.method === 'pinChatMessage').length,
      1,
      'the outstanding pin must be retried',
    );
    assert.equal(loadAttendanceState(path).rosters['test|2026-09']?.pinned, true);

    // A later run must not pin again.
    const second = recorder([() => json({ ok: true, result: [] })]);
    await collect(config(path), { now: NOW, telegram: { fetchImpl: second.fetchImpl } });
    assert.equal(second.calls.filter((call) => call.method === 'pinChatMessage').length, 0);
  });
});
