import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildPolls,
  MAX_OPTION_LENGTH,
  MAX_POLL_OPTIONS,
  MAX_QUESTION_LENGTH,
  saturdayOptions,
} from '../src/polls.ts';

const SEPT = { year: 2026, month: 9 };
// May 2026 is the worst realistic case: five Fridays AND five Saturdays.
const MAY = { year: 2026, month: 5 };

const kinds = (built: ReturnType<typeof buildPolls>) => built.polls.map((poll) => poll.kind);
const poll = (built: ReturnType<typeof buildPolls>, kind: string) => {
  const found = built.polls.find((candidate) => candidate.kind === kind);
  assert.ok(found, `expected a ${kind} poll`);
  return found;
};

// AC36 (R38): ordered by date, then by slot.
test('saturdayOptions produces every date-and-slot combination in order', () => {
  assert.deepEqual(saturdayOptions(['2026-09-05', '2026-09-12'], ['10am-12pm', '7-9pm']), [
    '5 Sep, 10am-12pm',
    '5 Sep, 7-9pm',
    '12 Sep, 10am-12pm',
    '12 Sep, 7-9pm',
  ]);
});

// AC34 (R34, R35, R36): the exact agreed questions.
test('buildPolls uses the agreed poll questions', () => {
  const built = buildPolls({ target: SEPT, holidayDates: ['2026-09-15'] });
  assert.equal(
    poll(built, 'fridays').question,
    'Friday TT Sessions @ marymount/bishan/northeast/tampines',
  );
  assert.equal(
    poll(built, 'saturdays').question,
    'Saturday TT Sessions @ marymount/bishan/central/northeast',
  );
  assert.equal(poll(built, 'holidays').question, 'Public Holiday TT Sessions');
});

// AC8 (R8): three separate polls, none over the option ceiling.
test('buildPolls emits three separate polls within the option ceiling', () => {
  const built = buildPolls({
    target: MAY,
    holidayDates: ['2026-05-01', '2026-05-13', '2026-05-27'],
  });
  assert.deepEqual(kinds(built), ['fridays', 'saturdays', 'holidays']);
  assert.equal(poll(built, 'fridays').options.length, 5);
  assert.equal(poll(built, 'saturdays').options.length, 10); // 5 Saturdays x 2 slots
  for (const built_poll of built.polls) {
    assert.ok(
      built_poll.options.length <= MAX_POLL_OPTIONS,
      `${built_poll.kind} exceeded ${MAX_POLL_OPTIONS}`,
    );
  }
});

// AC7 (R7): a holiday falling on a Friday or Saturday is not asked twice.
test('buildPolls removes holiday dates already covered by another poll', () => {
  // 2026-05-01 is a Friday and 2026-05-02 is a Saturday; 2026-05-13 is neither.
  const built = buildPolls({
    target: MAY,
    holidayDates: ['2026-05-01', '2026-05-02', '2026-05-13'],
  });
  assert.ok(poll(built, 'fridays').options.includes('1 May'));
  assert.deepEqual(poll(built, 'holidays').options, ['13 May']);
});

// AC9 (R9): non-anonymous, multi-select.
test('every poll is non-anonymous and allows multiple answers', () => {
  const built = buildPolls({ target: SEPT, holidayDates: ['2026-09-15'] });
  for (const built_poll of built.polls) {
    assert.equal(built_poll.isAnonymous, false);
    assert.equal(built_poll.allowsMultipleAnswers, true);
  }
});

// AC38 (R40): members may add slots to the Saturday poll only.
test('only the Saturday poll allows adding options', () => {
  const built = buildPolls({ target: SEPT, holidayDates: ['2026-09-15'] });
  assert.equal(poll(built, 'saturdays').allowAddingOptions, true);
  assert.equal(poll(built, 'fridays').allowAddingOptions, false);
  assert.equal(poll(built, 'holidays').allowAddingOptions, false);
});

// AC10 (R10): Telegram text limits.
test('questions and options stay within Telegram length limits', () => {
  const built = buildPolls({ target: MAY, holidayDates: ['2026-05-13'] });
  for (const built_poll of built.polls) {
    assert.ok(built_poll.question.length <= MAX_QUESTION_LENGTH);
    for (const option of built_poll.options) {
      assert.ok(option.length <= MAX_OPTION_LENGTH, `option too long: ${option}`);
    }
  }
});

// AC16 (R16): a covered month with no holidays gets a message, not a poll.
test('a month with no holidays yields an informational message', () => {
  const built = buildPolls({ target: SEPT, holidayDates: [] });
  assert.deepEqual(kinds(built), ['fridays', 'saturdays']);
  assert.equal(built.messages.length, 1);
  assert.match(built.messages[0]?.text ?? '', /September 2026/);
});

// AC37 (R39): slots are configuration; three slots need no code change.
test('a third configured slot is honoured without a code change', () => {
  const built = buildPolls({
    target: SEPT, // September 2026 has four Saturdays
    holidayDates: [],
    slots: ['10am-12pm', '2-4pm', '7-9pm'],
  });
  const options = poll(built, 'saturdays').options;
  assert.equal(options.length, 12); // 4 Saturdays x 3 slots
  assert.deepEqual(options.slice(0, 3), ['5 Sep, 10am-12pm', '5 Sep, 2-4pm', '5 Sep, 7-9pm']);
});

// AC39 (R41): overflow fails loudly rather than truncating.
test('buildPolls refuses to truncate when Saturday options overflow', () => {
  assert.throws(
    () =>
      buildPolls({
        target: MAY, // five Saturdays
        holidayDates: [],
        slots: ['10am-12pm', '2-4pm', '7-9pm'], // 5 x 3 = 15
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /15/);
      assert.match(error.message, /12/);
      return true;
    },
  );
});
