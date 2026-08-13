import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildPolls,
  CMI_OPTION,
  MAX_OPTION_LENGTH,
  MAX_POLL_OPTIONS,
  MAX_QUESTION_LENGTH,
  slotOptions,
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
test('slotOptions produces every date-and-slot combination in order', () => {
  assert.deepEqual(slotOptions(['2026-09-05', '2026-09-12'], ['10am-12pm', '7-9pm']), [
    '5 Sep, 10am-12pm',
    '5 Sep, 7-9pm',
    '12 Sep, 10am-12pm',
    '12 Sep, 7-9pm',
  ]);
});

// AC34 (R44, R35, R45, R42): the exact agreed questions.
test('buildPolls uses the agreed poll questions', () => {
  const built = buildPolls({ target: SEPT, holidayDates: ['2026-09-15'] });
  assert.equal(
    poll(built, 'fridays').question,
    'Friday TT Sessions @ marymount/bishan/northeast/tampines, 7-10pm',
  );
  assert.equal(
    poll(built, 'saturdays').question,
    'Saturday TT Sessions @ marymount/bishan/central/northeast',
  );
  assert.equal(poll(built, 'sundays').question, 'Sunday TT Sessions @ MOE Evans, 5-7pm');
  assert.equal(poll(built, 'holidays').question, 'Public Holiday TT Sessions');
});

// AC8 (R8, R42): four separate polls, none over the option ceiling.
test('buildPolls emits four separate polls within the option ceiling', () => {
  const built = buildPolls({
    target: MAY,
    holidayDates: ['2026-05-01', '2026-05-13', '2026-05-27'],
  });
  assert.deepEqual(kinds(built), ['fridays', 'saturdays', 'sundays', 'holidays']);
  assert.equal(poll(built, 'fridays').options.length, 6); // 5 Fridays + cmi
  assert.equal(poll(built, 'saturdays').options.length, 11); // 5 Saturdays x 2 slots + cmi
  assert.equal(poll(built, 'sundays').options.length, 6); // 5 Sundays + cmi
  for (const built_poll of built.polls) {
    assert.ok(
      built_poll.options.length <= MAX_POLL_OPTIONS,
      `${built_poll.kind} exceeded ${MAX_POLL_OPTIONS}`,
    );
  }
});

// AC41 (R43): every poll ends with the same opt-out option.
test('every poll offers cmi as its final option', () => {
  const built = buildPolls({ target: SEPT, holidayDates: ['2026-09-15'] });
  assert.equal(built.polls.length, 4);
  for (const built_poll of built.polls) {
    assert.equal(built_poll.options.at(-1), CMI_OPTION);
    assert.equal(
      built_poll.options.filter((option) => option === CMI_OPTION).length,
      1,
      `${built_poll.kind} repeated the cmi option`,
    );
  }
});

// AC42 (R46): each holiday is asked as a morning and an afternoon session.
test('the holiday poll splits every date into AM and PM', () => {
  const built = buildPolls({ target: SEPT, holidayDates: ['2026-09-15', '2026-09-16'] });
  assert.deepEqual(poll(built, 'holidays').options, [
    '15 Sep, AM',
    '15 Sep, PM',
    '16 Sep, AM',
    '16 Sep, PM',
    CMI_OPTION,
  ]);
});

// AC43 (R42): Sunday options carry the date alone; the time lives in the title.
test('the Sunday poll renders bare dates', () => {
  const built = buildPolls({ target: SEPT, holidayDates: [] });
  assert.deepEqual(poll(built, 'sundays').options, ['6 Sep', '13 Sep', '20 Sep', '27 Sep', 'cmi']);
});

// AC7 (R7, R42): a holiday falling on a Friday, Saturday or Sunday is not asked twice.
test('buildPolls removes holiday dates already covered by another poll', () => {
  // 2026-05-01 is a Friday, 2026-05-02 a Saturday, 2026-05-03 a Sunday;
  // 2026-05-13 is none of them.
  const built = buildPolls({
    target: MAY,
    holidayDates: ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-13'],
  });
  assert.ok(poll(built, 'fridays').options.includes('1 May'));
  assert.ok(poll(built, 'sundays').options.includes('3 May'));
  assert.deepEqual(poll(built, 'holidays').options, ['13 May, AM', '13 May, PM', CMI_OPTION]);
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
  assert.equal(poll(built, 'sundays').allowAddingOptions, false);
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
  assert.deepEqual(kinds(built), ['fridays', 'saturdays', 'sundays']);
  assert.equal(built.messages.length, 1);
  assert.match(built.messages[0]?.text ?? '', /September 2026/);
});

// AC37 (R39): slots are configuration; changing their values needs no code change.
test('non-default slot values are honoured without a code change', () => {
  const built = buildPolls({
    target: SEPT, // September 2026 has four Saturdays
    holidayDates: [],
    slots: ['9-11am', '2-4pm'],
  });
  const options = poll(built, 'saturdays').options;
  assert.equal(options.length, 9); // 4 Saturdays x 2 slots + cmi
  assert.deepEqual(options.slice(0, 3), ['5 Sep, 9-11am', '5 Sep, 2-4pm', '12 Sep, 9-11am']);
});

// AC44 (R43, R41): cmi occupies one of the twelve options, so three slots no
// longer fit in any month — every month has at least four Saturdays.
test('a third configured slot now overflows even a four-Saturday month', () => {
  assert.throws(
    () =>
      buildPolls({
        target: SEPT, // four Saturdays
        holidayDates: [],
        slots: ['10am-12pm', '2-4pm', '7-9pm'], // 4 x 3 + cmi = 13
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /13/);
      assert.match(error.message, /12/);
      return true;
    },
  );
});

// AC39 (R41): overflow fails loudly rather than truncating.
test('buildPolls refuses to truncate when Saturday options overflow', () => {
  assert.throws(
    () =>
      buildPolls({
        target: MAY, // five Saturdays
        holidayDates: [],
        slots: ['10am-12pm', '2-4pm', '7-9pm'], // 5 x 3 + cmi = 16
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /16/);
      assert.match(error.message, /12/);
      return true;
    },
  );
});

// AC45 (R46, R41): AM/PM doubles the holiday poll, so a six-holiday month is
// refused rather than silently truncated.
test('buildPolls refuses a holiday month whose AM/PM options overflow', () => {
  assert.throws(
    () =>
      buildPolls({
        target: SEPT,
        // Six holidays, none on a Fri/Sat/Sun: 6 x 2 + cmi = 13.
        holidayDates: [
          '2026-09-01',
          '2026-09-02',
          '2026-09-03',
          '2026-09-08',
          '2026-09-09',
          '2026-09-10',
        ],
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /holidays/);
      assert.match(error.message, /13/);
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// Spec 004 — session metadata for attendance registration
// ---------------------------------------------------------------------------

// R6, R10: registration is authoritative, so the session behind each option
// must travel with the payload. Reverse-parsing "5 Sep, 10am-12pm" later would
// be brittle and would guess at member-added options it cannot know.
test('every poll carries a session aligned with each option', () => {
  const built = buildPolls({ target: SEPT, holidayDates: ['2026-09-15'] });

  for (const candidate of built.polls) {
    assert.equal(
      candidate.sessions.length,
      candidate.options.length,
      `${candidate.kind} sessions must align 1:1 with options`,
    );
    // The shared opt-out answer is not a session.
    assert.equal(candidate.sessions[candidate.sessions.length - 1], null);
    assert.equal(candidate.options[candidate.options.length - 1], CMI_OPTION);
  }
});

test('Friday sessions carry a bare date and Saturday sessions carry a slot', () => {
  const built = buildPolls({ target: SEPT, holidayDates: [] });

  assert.deepEqual(poll(built, 'fridays').sessions[0], { date: '2026-09-04', slot: null });
  assert.deepEqual(poll(built, 'saturdays').sessions[0], {
    date: '2026-09-05',
    slot: '10am-12pm',
  });
  assert.deepEqual(poll(built, 'saturdays').sessions[1], { date: '2026-09-05', slot: '7-9pm' });
});

// R46: holidays split into halves, so the slot distinguishes them.
test('holiday sessions carry the AM and PM halves', () => {
  const built = buildPolls({ target: SEPT, holidayDates: ['2026-09-15'] });
  assert.deepEqual(poll(built, 'holidays').sessions.slice(0, 2), [
    { date: '2026-09-15', slot: 'AM' },
    { date: '2026-09-15', slot: 'PM' },
  ]);
});
