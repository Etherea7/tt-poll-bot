import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { AttendanceState, RegisteredPoll } from '../src/attendance.ts';
import {
  applyPollAnswer,
  applyPollUpdate,
  emptyAttendanceState,
  loadAttendanceState,
  MissingPersistentIdError,
  parseAttendanceState,
  pruneAttendance,
  registerPoll,
  rosterKey,
  saveAttendanceState,
} from '../src/attendance.ts';

const fridayPoll: RegisteredPoll = {
  alias: 'test',
  month: '2026-09',
  kind: 'fridays',
  messageId: 10,
  options: [
    {
      persistentId: 'p-4',
      label: '4 Sep',
      session: { date: '2026-09-04', slot: null },
      cmi: false,
    },
    {
      persistentId: 'p-11',
      label: '11 Sep',
      session: { date: '2026-09-11', slot: null },
      cmi: false,
    },
    { persistentId: 'p-cmi', label: 'cmi', session: null, cmi: true },
  ],
};

const withPoll = (): AttendanceState => registerPoll(emptyAttendanceState(), '5100', fridayPoll);

const alice = { id: 7, first_name: 'Alice', last_name: 'Tan' };

const votesFor = (state: AttendanceState, pollId: string, userId: number): readonly string[] =>
  state.votes[pollId]?.[String(userId)] ?? [];

// ---------------------------------------------------------------------------
// Parsing — malformed state must fail closed rather than silently reset.
// ---------------------------------------------------------------------------

test('parseAttendanceState accepts an empty state', () => {
  const state = parseAttendanceState({
    offset: 0,
    polls: {},
    users: {},
    votes: {},
    rosters: {},
    lastSync: null,
  });
  assert.equal(state.offset, 0);
});

test('parseAttendanceState rejects a non-object', () => {
  assert.throws(() => parseAttendanceState([]), /attendance state/i);
  assert.throws(() => parseAttendanceState(null), /attendance state/i);
});

test('parseAttendanceState rejects a non-numeric offset', () => {
  assert.throws(
    () =>
      parseAttendanceState({
        offset: 'twelve',
        polls: {},
        users: {},
        votes: {},
        rosters: {},
        lastSync: null,
      }),
    /offset/i,
  );
});

test('parseAttendanceState rejects an unsafe destination alias', () => {
  assert.throws(
    () =>
      parseAttendanceState({
        offset: 0,
        polls: { '5100': { ...fridayPoll, alias: '../escape' } },
        users: {},
        votes: {},
        rosters: {},
        lastSync: null,
      }),
    /alias/i,
  );
});

test('parseAttendanceState rejects a malformed month', () => {
  assert.throws(
    () =>
      parseAttendanceState({
        offset: 0,
        polls: { '5100': { ...fridayPoll, month: '2026-13' } },
        users: {},
        votes: {},
        rosters: {},
        lastSync: null,
      }),
    /month/i,
  );
});

// ---------------------------------------------------------------------------
// AC3, AC4, AC5 — replacement, retraction, persistent-id keying.
// ---------------------------------------------------------------------------

// AC3 (R3): Telegram sends the complete selection, so stored state is replaced
// wholesale. Merging would make a deselected session permanent.
test('applyPollAnswer replaces the previous selection entirely', () => {
  let state = withPoll();
  state = applyPollAnswer(state, {
    poll_id: '5100',
    user: alice,
    option_persistent_ids: ['p-4', 'p-11'],
  }).state;
  assert.deepEqual(votesFor(state, '5100', 7), ['p-4', 'p-11']);

  state = applyPollAnswer(state, {
    poll_id: '5100',
    user: alice,
    option_persistent_ids: ['p-11'],
  }).state;
  assert.deepEqual(votesFor(state, '5100', 7), ['p-11']);
});

// AC4 (R4): an empty set is a retraction, not a no-op.
test('applyPollAnswer with an empty selection removes the user from the poll', () => {
  let state = withPoll();
  state = applyPollAnswer(state, {
    poll_id: '5100',
    user: alice,
    option_persistent_ids: ['p-4'],
  }).state;
  state = applyPollAnswer(state, {
    poll_id: '5100',
    user: alice,
    option_persistent_ids: [],
  }).state;
  assert.deepEqual(votesFor(state, '5100', 7), []);
});

// AC4 (R4): Telegram may omit the field entirely rather than send an empty
// array. With no option_ids either, that is unambiguously a retraction.
test('applyPollAnswer treats a wholly absent selection as a retraction', () => {
  let state = withPoll();
  state = applyPollAnswer(state, {
    poll_id: '5100',
    user: alice,
    option_persistent_ids: ['p-4'],
  }).state;
  state = applyPollAnswer(state, { poll_id: '5100', user: alice }).state;
  assert.deepEqual(votesFor(state, '5100', 7), []);
});

// AC5 (R5): the Saturday poll allows added options, so positions shift. Keying
// on position would silently reassign a member to a different session.
test('applyPollAnswer keys on persistent id, not option position', () => {
  let state = withPoll();
  state = applyPollAnswer(state, {
    poll_id: '5100',
    user: alice,
    option_persistent_ids: ['p-11'],
  }).state;

  // A member adds an option, shifting every later index by one.
  state = applyPollUpdate(state, {
    id: '5100',
    question: 'Friday TT Sessions',
    options: [
      { text: '4 Sep', persistent_id: 'p-4' },
      { text: 'extra', persistent_id: 'p-extra' },
      { text: '11 Sep', persistent_id: 'p-11' },
      { text: 'cmi', persistent_id: 'p-cmi' },
    ],
  });

  assert.deepEqual(votesFor(state, '5100', 7), ['p-11']);
});

// R5: with no persistent ids available, position is the only remaining key —
// and using it is exactly the silent misassignment R5 forbids. Fail closed.
test('applyPollAnswer refuses to fall back to positional option ids', () => {
  const state = withPoll();
  assert.throws(
    () => applyPollAnswer(state, { poll_id: '5100', user: alice, option_ids: [0, 1] }),
    MissingPersistentIdError,
  );
});

// ---------------------------------------------------------------------------
// AC6, AC7 — unknown polls create nothing.
// ---------------------------------------------------------------------------

// AC7 (R7): an inbound update must never become a source of configuration.
test('applyPollAnswer ignores an unregistered poll and reports it', () => {
  const state = withPoll();
  const outcome = applyPollAnswer(state, {
    poll_id: 'unknown-9',
    user: alice,
    option_persistent_ids: ['x'],
  });
  assert.equal(outcome.applied, false);
  assert.equal(outcome.state, state, 'state must be untouched');
  assert.deepEqual(Object.keys(outcome.state.polls), ['5100']);
  assert.deepEqual(outcome.state.users, {});
});

// AC6 (R6): a poll update refreshes metadata but never registers a poll.
test('applyPollUpdate ignores an unregistered poll', () => {
  const state = withPoll();
  const next = applyPollUpdate(state, {
    id: 'unknown-9',
    question: 'Friday TT Sessions',
    options: [{ text: '4 Sep', persistent_id: 'q-1' }],
  });
  assert.deepEqual(Object.keys(next.polls), ['5100']);
});

// AC12 (R13): a member-added option enters the registration unresolved, so its
// voters stay visible instead of being silently dropped.
test('applyPollUpdate records a member-added option as unresolved', () => {
  const state = applyPollUpdate(withPoll(), {
    id: '5100',
    question: 'Friday TT Sessions',
    options: [
      { text: '4 Sep', persistent_id: 'p-4' },
      { text: '11 Sep', persistent_id: 'p-11' },
      { text: 'cmi', persistent_id: 'p-cmi' },
      { text: '18 Sep 8pm please', persistent_id: 'p-new' },
    ],
  });

  const added = state.polls['5100']?.options.find((option) => option.persistentId === 'p-new');
  assert.ok(added, 'the added option should be registered');
  assert.equal(added?.session, null);
  assert.equal(added?.cmi, false);
  assert.equal(added?.label, '18 Sep 8pm please');
});

test('applyPollUpdate does not disturb an already-registered option', () => {
  const state = applyPollUpdate(withPoll(), {
    id: '5100',
    question: 'Friday TT Sessions',
    options: [{ text: '4 Sep', persistent_id: 'p-4' }],
  });
  const original = state.polls['5100']?.options.find((option) => option.persistentId === 'p-4');
  assert.deepEqual(original?.session, { date: '2026-09-04', slot: null });
});

// ---------------------------------------------------------------------------
// AC8 — identity refresh.
// ---------------------------------------------------------------------------

// AC8 (R8): the user id is the identity; names are display only.
test('applyPollAnswer refreshes display names without touching attendance', () => {
  let state = withPoll();
  state = applyPollAnswer(state, {
    poll_id: '5100',
    user: alice,
    option_persistent_ids: ['p-4'],
  }).state;
  const before = votesFor(state, '5100', 7);

  state = applyPollAnswer(state, {
    poll_id: '5100',
    user: { id: 7, first_name: 'Alice', last_name: 'Wong' },
    option_persistent_ids: ['p-4'],
  }).state;

  assert.equal(state.users['7']?.lastName, 'Wong');
  assert.deepEqual(votesFor(state, '5100', 7), before);
});

// ---------------------------------------------------------------------------
// AC23 — retention.
// ---------------------------------------------------------------------------

// AC23 (R26): 2026-06 ends on the 30th; 2026-08-30 is 61 days later.
test('pruneAttendance drops a month more than 60 days past its end', () => {
  let state = registerPoll(emptyAttendanceState(), '4000', { ...fridayPoll, month: '2026-06' });
  state = applyPollAnswer(state, {
    poll_id: '4000',
    user: alice,
    option_persistent_ids: ['p-4'],
  }).state;
  state = {
    ...state,
    rosters: {
      ...state.rosters,
      [rosterKey('test', '2026-06')]: { messageId: 1, textHash: 'h', pinned: true },
    },
  };

  const pruned = pruneAttendance(state, '2026-08-30');

  assert.deepEqual(Object.keys(pruned.polls), []);
  assert.deepEqual(Object.keys(pruned.votes), []);
  assert.deepEqual(Object.keys(pruned.rosters), []);
  // Data minimisation: a user no longer referenced by any vote is dropped too.
  assert.deepEqual(Object.keys(pruned.users), []);
});

test('pruneAttendance keeps a month still inside the retention window', () => {
  let state = registerPoll(emptyAttendanceState(), '4000', { ...fridayPoll, month: '2026-06' });
  state = applyPollAnswer(state, {
    poll_id: '4000',
    user: alice,
    option_persistent_ids: ['p-4'],
  }).state;

  const pruned = pruneAttendance(state, '2026-08-28');

  assert.deepEqual(Object.keys(pruned.polls), ['4000']);
  assert.deepEqual(Object.keys(pruned.users), ['7']);
});

// ---------------------------------------------------------------------------
// Persistence.
// ---------------------------------------------------------------------------

test('attendance state survives a save and load round trip', () => {
  const directory = mkdtempSync(join(tmpdir(), 'attendance-'));
  const path = join(directory, 'state', 'attendance.json');
  try {
    let state = withPoll();
    state = applyPollAnswer(state, {
      poll_id: '5100',
      user: alice,
      option_persistent_ids: ['p-4'],
    }).state;

    saveAttendanceState(state, path);
    assert.deepEqual(loadAttendanceState(path), state);
    // Written as pretty JSON with a trailing newline, like the delivery record.
    assert.match(readFileSync(path, 'utf8'), /\n$/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('loadAttendanceState returns an empty state when the file is absent', () => {
  const directory = mkdtempSync(join(tmpdir(), 'attendance-'));
  try {
    assert.deepEqual(loadAttendanceState(join(directory, 'missing.json')), emptyAttendanceState());
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

// A forced resend (`--prepare --force --only fridays --to test`) produces a new
// poll id for the same alias, month and kind. Appending it would leave the old
// poll registered and votable, so the roster would render every session twice
// with attendance split across the two polls.
test('registering a poll replaces any earlier one for the same alias, month and kind', () => {
  let state = registerPoll(emptyAttendanceState(), 'old-poll', fridayPoll);
  state = applyPollAnswer(state, {
    poll_id: 'old-poll',
    user: alice,
    option_persistent_ids: ['p-4'],
  }).state;

  state = registerPoll(state, 'new-poll', { ...fridayPoll, messageId: 99 });

  assert.deepEqual(Object.keys(state.polls), ['new-poll'], 'the superseded poll must be dropped');
  assert.equal(state.votes['old-poll'], undefined, 'its votes must go with it');
});

test('registering a poll leaves a different kind or month untouched', () => {
  let state = registerPoll(emptyAttendanceState(), 'fri', fridayPoll);
  state = registerPoll(state, 'sat', { ...fridayPoll, kind: 'saturdays' });
  state = registerPoll(state, 'fri-oct', { ...fridayPoll, month: '2026-10' });
  state = registerPoll(state, 'fri-club', { ...fridayPoll, alias: 'club' });

  assert.deepEqual(Object.keys(state.polls).sort(), ['fri', 'fri-club', 'fri-oct', 'sat']);
});
