import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AttendanceState, RegisteredPoll } from '../src/attendance.ts';
import { applyPollAnswer, emptyAttendanceState, registerPoll } from '../src/attendance.ts';
import {
  MAX_MESSAGE_LENGTH,
  projectRoster,
  RosterTooLargeError,
  renderRoster,
} from '../src/roster.ts';

const fridays = (alias: string): RegisteredPoll => ({
  alias,
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
    {
      persistentId: 'f-11',
      label: '11 Sep',
      session: { date: '2026-09-11', slot: null },
      cmi: false,
    },
    { persistentId: 'f-cmi', label: 'cmi', session: null, cmi: true },
  ],
});

const saturdays: RegisteredPoll = {
  alias: 'test',
  month: '2026-09',
  kind: 'saturdays',
  messageId: 11,
  options: [
    {
      persistentId: 's-5-am',
      label: '5 Sep, 10am-12pm',
      session: { date: '2026-09-05', slot: '10am-12pm' },
      cmi: false,
    },
    {
      persistentId: 's-5-pm',
      label: '5 Sep, 7-9pm',
      session: { date: '2026-09-05', slot: '7-9pm' },
      cmi: false,
    },
    { persistentId: 's-cmi', label: 'cmi', session: null, cmi: true },
  ],
};

const vote = (
  state: AttendanceState,
  pollId: string,
  user: { id: number; first_name: string; last_name?: string },
  ids: readonly string[],
): AttendanceState =>
  applyPollAnswer(state, { poll_id: pollId, user, option_persistent_ids: ids }).state;

const syncedAt = new Date('2026-09-01T06:35:00Z'); // 14:35 in Singapore

// AC11 (R12): cmi is an opt-out answer, not a session, and the owner chose not
// to surface it to members at all.
test('cmi voters appear in no session and produce no roster line', () => {
  let state = registerPoll(emptyAttendanceState(), '1', fridays('test'));
  state = vote(state, '1', { id: 1, first_name: 'Alice' }, ['f-cmi']);
  state = vote(state, '1', { id: 2, first_name: 'Bob' }, ['f-4']);

  const projection = projectRoster(state, 'test', '2026-09');
  const attendees = projection.sessions.flatMap((session) => session.attendees);
  assert.ok(!attendees.includes('Alice'), 'a cmi voter must not attend a session');
  assert.deepEqual(
    projection.sessions.find((session) => session.session.date === '2026-09-04')?.attendees,
    ['Bob'],
  );

  const text = renderRoster(projection, { syncedAt });
  assert.doesNotMatch(text, /cmi/i);
  assert.doesNotMatch(text, /Alice/);
});

// AC19 (R19): a session nobody picked still has to appear, or members cannot
// tell an empty session from a missing one.
test('a session with no attendees is still listed', () => {
  let state = registerPoll(emptyAttendanceState(), '1', fridays('test'));
  state = vote(state, '1', { id: 2, first_name: 'Bob' }, ['f-4']);

  const projection = projectRoster(state, 'test', '2026-09');
  const empty = projection.sessions.find((session) => session.session.date === '2026-09-11');
  assert.ok(empty, '11 Sep must be present');
  assert.deepEqual(empty?.attendees, []);
  assert.match(renderRoster(projection, { syncedAt }), /11 Sep/);
});

// AC13 (R14): one poll id maps to exactly one destination.
test('a destination roster never contains another destination votes', () => {
  let state = registerPoll(emptyAttendanceState(), '1', fridays('test'));
  state = registerPoll(state, '2', fridays('club'));
  state = vote(state, '1', { id: 1, first_name: 'Alice' }, ['f-4']);
  state = vote(state, '2', { id: 2, first_name: 'Bob' }, ['f-4']);

  const test1 = projectRoster(state, 'test', '2026-09');
  const club = projectRoster(state, 'club', '2026-09');

  assert.deepEqual(test1.sessions[0]?.attendees, ['Alice']);
  assert.deepEqual(club.sessions[0]?.attendees, ['Bob']);
});

// AC12 (R13): a member-added option has no session meaning, but hiding its
// voters would silently lose real attendance.
test('an unresolved option renders under its own heading with its voters', () => {
  let state = registerPoll(emptyAttendanceState(), '2', saturdays);
  state = {
    ...state,
    polls: {
      ...state.polls,
      '2': {
        ...saturdays,
        options: [
          ...saturdays.options,
          { persistentId: 's-new', label: '12 Sep, 3-5pm', session: null, cmi: false },
        ],
      },
    },
  };
  state = vote(state, '2', { id: 3, first_name: 'Carol' }, ['s-new']);

  const projection = projectRoster(state, 'test', '2026-09');
  assert.deepEqual(projection.unresolved, [{ label: '12 Sep, 3-5pm', attendees: ['Carol'] }]);
  assert.match(renderRoster(projection, { syncedAt }), /12 Sep, 3-5pm/);
});

// AC22 (R22): a bare first name is the default; the last initial appears only
// where it is needed to tell two attendees apart.
test('a last initial is added only when two first names collide', () => {
  let state = registerPoll(emptyAttendanceState(), '1', fridays('test'));
  state = vote(state, '1', { id: 1, first_name: 'Alice', last_name: 'Tan' }, ['f-4']);
  state = vote(state, '1', { id: 2, first_name: 'Alice', last_name: 'Wong' }, ['f-4']);
  state = vote(state, '1', { id: 3, first_name: 'Bob', last_name: 'Lee' }, ['f-4']);

  const attendees = projectRoster(state, 'test', '2026-09').sessions[0]?.attendees ?? [];
  assert.ok(attendees.includes('Alice T.'), `expected "Alice T." in ${JSON.stringify(attendees)}`);
  assert.ok(attendees.includes('Alice W.'), `expected "Alice W." in ${JSON.stringify(attendees)}`);
  assert.ok(attendees.includes('Bob'), 'a unique first name needs no initial');
});

// AC20 (R20): members need to know how current the roster is.
test('the roster carries the sync time in Singapore time', () => {
  const state = registerPoll(emptyAttendanceState(), '1', fridays('test'));
  const text = renderRoster(projectRoster(state, 'test', '2026-09'), { syncedAt });
  assert.match(text, /14:35/);
});

test('the roster says so when it has never synced', () => {
  const state = registerPoll(emptyAttendanceState(), '1', fridays('test'));
  const text = renderRoster(projectRoster(state, 'test', '2026-09'), { syncedAt: null });
  assert.match(text, /never|not yet/i);
});

// AC21 (R21): truncation would silently drop attendance, so names are dropped
// wholesale instead — from every list in the message, not only the sessions.
test('an oversized roster degrades to counts rather than truncating', () => {
  let state = registerPoll(emptyAttendanceState(), '1', fridays('test'));
  state = {
    ...state,
    polls: {
      ...state.polls,
      '1': {
        ...fridays('test'),
        options: [
          ...fridays('test').options,
          { persistentId: 'f-new', label: 'an added option', session: null, cmi: false },
        ],
      },
    },
  };

  for (let id = 1; id <= 220; id++) {
    state = vote(
      state,
      '1',
      { id, first_name: `Verylongfirstname${id}`, last_name: `Verylonglastname${id}` },
      ['f-4', 'f-new'],
    );
  }

  const projection = projectRoster(state, 'test', '2026-09');
  const named = renderRoster(projection, { syncedAt, degrade: false });
  assert.ok(named.length > MAX_MESSAGE_LENGTH, 'fixture must actually overflow');

  const text = renderRoster(projection, { syncedAt });
  assert.ok(
    text.length <= MAX_MESSAGE_LENGTH,
    `degraded roster is ${text.length} characters, over the ${MAX_MESSAGE_LENGTH} limit`,
  );
  assert.doesNotMatch(text, /Verylongfirstname/, 'no names may survive the degrade');
  assert.match(text, /220/, 'the session count must still be shown');
  assert.match(text, /omitted/i, 'the omission must be stated');
});

test('a roster within the limit keeps its names', () => {
  let state = registerPoll(emptyAttendanceState(), '1', fridays('test'));
  state = vote(state, '1', { id: 1, first_name: 'Alice' }, ['f-4']);
  const text = renderRoster(projectRoster(state, 'test', '2026-09'), { syncedAt });
  assert.match(text, /Alice/);
  assert.doesNotMatch(text, /omitted/i);
});

// R19: sessions are read chronologically, across polls.
test('sessions from different polls are ordered by date then slot', () => {
  let state = registerPoll(emptyAttendanceState(), '1', fridays('test'));
  state = registerPoll(state, '2', saturdays);

  const projection = projectRoster(state, 'test', '2026-09');
  assert.deepEqual(
    projection.sessions.map((session) => [session.session.date, session.session.slot]),
    [
      ['2026-09-04', null],
      ['2026-09-05', '10am-12pm'],
      ['2026-09-05', '7-9pm'],
      ['2026-09-11', null],
    ],
  );
});

// R21: names are dropped when the roster overflows, but counts alone can still
// overflow — option labels may be 100 characters and members can add options.
// Four full polls of maximum-length labels render to ~5800 characters as
// counts. Sending that would have Telegram reject the edit every hour forever,
// so the render refuses instead of quietly dropping sessions to fit.
test('a roster that overflows even without names refuses to render', () => {
  let state = emptyAttendanceState();
  const kinds = ['fridays', 'saturdays', 'sundays', 'holidays'] as const;
  kinds.forEach((kind, index) => {
    state = registerPoll(state, `poll-${index}`, {
      alias: 'test',
      month: '2026-09',
      kind,
      messageId: index,
      options: Array.from({ length: 12 }, (_, option) => ({
        persistentId: `p-${index}-${option}`,
        label: 'x'.repeat(100),
        session: { date: `2026-09-0${(option % 9) + 1}`, slot: 'slot' },
        cmi: false,
      })),
    });
  });

  const projection = projectRoster(state, 'test', '2026-09');
  assert.throws(() => renderRoster(projection, { syncedAt }), RosterTooLargeError);
});

test('a roster that fits once names are dropped still renders', () => {
  let state = registerPoll(emptyAttendanceState(), '1', fridays('test'));
  for (let id = 1; id <= 220; id++) {
    state = vote(state, '1', { id, first_name: `Verylongfirstname${id}` }, ['f-4']);
  }
  const text = renderRoster(projectRoster(state, 'test', '2026-09'), { syncedAt });
  assert.ok(text.length <= MAX_MESSAGE_LENGTH);
  assert.match(text, /220/);
});
