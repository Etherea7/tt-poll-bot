import { fridaysIn, saturdaysIn } from './calendar.ts';
import type { YearMonth } from './clock.ts';
import { formatDateOption, formatMonthLabel, formatSlotOption } from './format.ts';

/**
 * Telegram's maximum answer options per poll (Bot API 9.1 raised it to 12).
 * The published docs have also shown 1-10 in places, so 12 is treated as an
 * upper bound to guard against, never as headroom to rely on.
 */
export const MAX_POLL_OPTIONS = 12;

/** Telegram's text limits. (R10) */
export const MAX_QUESTION_LENGTH = 300;
export const MAX_OPTION_LENGTH = 100;

/** Default Saturday time slots. Configuration, not code. (R39) */
export const DEFAULT_SLOTS: readonly string[] = ['10am-12pm', '7-9pm'];

export const QUESTIONS = {
  fridays: 'Friday TT Sessions @ marymount/bishan/northeast/tampines',
  saturdays: 'Saturday TT Sessions @ marymount/bishan/central/northeast',
  holidays: 'Public Holiday TT Sessions',
} as const;

export type PollKind = 'fridays' | 'saturdays' | 'holidays';

export interface PollPayload {
  readonly kind: PollKind;
  readonly question: string;
  readonly options: readonly string[];
  readonly isAnonymous: false;
  readonly allowsMultipleAnswers: true;
  readonly allowAddingOptions: boolean;
}

export interface MessagePayload {
  readonly kind: PollKind;
  readonly text: string;
}

export interface BuiltPolls {
  readonly polls: readonly PollPayload[];
  readonly messages: readonly MessagePayload[];
}

/** Every date-and-slot combination, ordered by date then by slot. (R38) */
export function saturdayOptions(dates: readonly string[], slots: readonly string[]): string[] {
  const options: string[] = [];
  for (const date of dates) {
    for (const slot of slots) {
      options.push(formatSlotOption(date, slot));
    }
  }
  return options;
}

/**
 * Build the three poll payloads for a target month.
 *
 * Pure: holiday dates are supplied by the caller rather than fetched, so this
 * has no I/O and does not depend on the holiday source.
 */
export function buildPolls(input: {
  target: YearMonth;
  holidayDates: readonly string[];
  slots?: readonly string[] | undefined;
}): BuiltPolls {
  const { target, holidayDates, slots = DEFAULT_SLOTS } = input;
  const { year, month } = target;

  const fridays = fridaysIn(year, month);
  const saturdays = saturdaysIn(year, month);

  // R7: a date already offered as a Friday or Saturday is not asked again in
  // the holiday poll, so no date appears in two polls.
  const alreadyOffered = new Set([...fridays, ...saturdays]);
  const holidays = [...holidayDates].filter((date) => !alreadyOffered.has(date)).sort();

  const polls: PollPayload[] = [
    {
      kind: 'fridays',
      question: QUESTIONS.fridays,
      options: fridays.map((date) => formatDateOption(date)),
      isAnonymous: false,
      allowsMultipleAnswers: true,
      allowAddingOptions: false,
    },
    {
      kind: 'saturdays',
      question: QUESTIONS.saturdays,
      options: saturdayOptions(saturdays, slots),
      isAnonymous: false,
      allowsMultipleAnswers: true,
      // R40: only Saturdays vary by time slot, so only this poll invites
      // members to add one the configuration does not yet cover.
      allowAddingOptions: true,
    },
  ];

  const messages: MessagePayload[] = [];

  if (holidays.length > 0) {
    polls.push({
      kind: 'holidays',
      question: QUESTIONS.holidays,
      options: holidays.map((date) => formatDateOption(date)),
      isAnonymous: false,
      allowsMultipleAnswers: true,
      allowAddingOptions: false,
    });
  } else {
    // R16: silence cannot be told apart from a broken run.
    messages.push({
      kind: 'holidays',
      text: `No public holidays in ${formatMonthLabel(year, month)}.`,
    });
  }

  assertWithinLimits(polls, formatMonthLabel(year, month));
  return { polls, messages };
}

/**
 * R41: refuse to send rather than truncate.
 *
 * Saturday options grow as dates x slots, so a fifth Saturday combined with a
 * third slot reaches 15 against a ceiling of 12. Truncating would silently drop
 * real sessions from the poll, so this fails before the first Telegram request
 * and names both numbers.
 */
function assertWithinLimits(polls: readonly PollPayload[], monthLabel: string): void {
  for (const poll of polls) {
    if (poll.options.length > MAX_POLL_OPTIONS) {
      throw new Error(
        `${poll.kind} poll for ${monthLabel} needs ${poll.options.length} options, ` +
          `exceeding the Telegram maximum of ${MAX_POLL_OPTIONS}. ` +
          'Reduce the configured time slots or split the poll.',
      );
    }
    if (poll.question.length > MAX_QUESTION_LENGTH) {
      throw new Error(
        `${poll.kind} question is ${poll.question.length} characters, ` +
          `exceeding the Telegram maximum of ${MAX_QUESTION_LENGTH}.`,
      );
    }
    for (const option of poll.options) {
      if (option.length > MAX_OPTION_LENGTH) {
        throw new Error(
          `${poll.kind} option "${option}" is ${option.length} characters, ` +
            `exceeding the Telegram maximum of ${MAX_OPTION_LENGTH}.`,
        );
      }
    }
  }
}
