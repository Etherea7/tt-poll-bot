import { fridaysIn, saturdaysIn, sundaysIn } from './calendar.ts';
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

/**
 * Public-holiday sessions run in two halves rather than at a fixed clock time,
 * so each holiday date is asked twice. (R46)
 */
export const HOLIDAY_SLOTS: readonly string[] = ['AM', 'PM'];

/**
 * The shared opt-out answer, appended to every poll. (R43)
 *
 * A multi-select poll cannot distinguish "not coming" from "has not voted yet",
 * so without this an organiser is left guessing at every silent member.
 *
 * It is an ordinary answer option and therefore spends one of the twelve
 * Telegram allows — see `assertWithinLimits`.
 */
export const CMI_OPTION = 'cmi';

export const QUESTIONS = {
  fridays: 'Friday TT Sessions @ marymount/bishan/northeast/tampines, 7-10pm',
  saturdays: 'Saturday TT Sessions @ marymount/bishan/central/northeast',
  sundays: 'Sunday TT Sessions @ MOE Evans, 5-7pm',
  holidays: 'Public Holiday TT Sessions',
} as const;

export type PollKind = 'fridays' | 'saturdays' | 'sundays' | 'holidays';

/**
 * One bookable session. `slot` is null where the whole date is the session
 * (Fridays, Sundays) and set where a date splits (Saturdays by configured time,
 * public holidays by AM/PM half).
 */
export interface SessionRef {
  readonly date: string;
  readonly slot: string | null;
}

export interface PollPayload {
  readonly kind: PollKind;
  readonly question: string;
  readonly options: readonly string[];
  /**
   * Aligned 1:1 with `options`; null for the shared opt-out answer. (R10)
   *
   * Attendance registration is authoritative about what an option means, so the
   * meaning travels with the payload rather than being parsed back out of the
   * rendered label later.
   */
  readonly sessions: readonly (SessionRef | null)[];
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

/**
 * Every date-and-slot combination, ordered by date then by slot. (R38, R46)
 *
 * Serves both polls whose sessions split within a day: Saturdays by configured
 * time slot, public holidays by AM/PM half.
 */
export function slotOptions(dates: readonly string[], slots: readonly string[]): string[] {
  const options: string[] = [];
  for (const date of dates) {
    for (const slot of slots) {
      options.push(formatSlotOption(date, slot));
    }
  }
  return options;
}

/**
 * The sessions behind `slotOptions`, in the same order. (R10)
 *
 * Kept beside `slotOptions` deliberately: the two must not drift, since the
 * pairing is what lets a vote be resolved to a date and slot later.
 */
export function slotSessions(dates: readonly string[], slots: readonly string[]): SessionRef[] {
  const sessions: SessionRef[] = [];
  for (const date of dates) {
    for (const slot of slots) {
      sessions.push({ date, slot });
    }
  }
  return sessions;
}

/** The sessions behind a bare list of dates, in the same order. (R10) */
function dateSessions(dates: readonly string[]): SessionRef[] {
  return dates.map((date) => ({ date, slot: null }));
}

/** Append the shared opt-out answer as the final option. (R43) */
function withCmi(options: readonly string[]): string[] {
  return [...options, CMI_OPTION];
}

/** Match `withCmi`: the opt-out answer has no session. (R12, R43) */
function withCmiSession(sessions: readonly SessionRef[]): (SessionRef | null)[] {
  return [...sessions, null];
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
  const sundays = sundaysIn(year, month);

  // R7: a date already offered as a Friday, Saturday or Sunday is not asked
  // again in the holiday poll, so no date appears in two polls.
  const alreadyOffered = new Set([...fridays, ...saturdays, ...sundays]);
  const holidays = [...holidayDates].filter((date) => !alreadyOffered.has(date)).sort();

  const polls: PollPayload[] = [
    {
      kind: 'fridays',
      // R44: the single Friday start time lives in the question, so the options
      // stay bare dates.
      question: QUESTIONS.fridays,
      options: withCmi(fridays.map((date) => formatDateOption(date))),
      sessions: withCmiSession(dateSessions(fridays)),
      isAnonymous: false,
      allowsMultipleAnswers: true,
      allowAddingOptions: false,
    },
    {
      kind: 'saturdays',
      question: QUESTIONS.saturdays,
      options: withCmi(slotOptions(saturdays, slots)),
      sessions: withCmiSession(slotSessions(saturdays, slots)),
      isAnonymous: false,
      allowsMultipleAnswers: true,
      // R40: only Saturdays vary by time slot, so only this poll invites
      // members to add one the configuration does not yet cover.
      allowAddingOptions: true,
    },
    {
      kind: 'sundays',
      // R42: one venue, one fixed slot — same shape as the Friday poll.
      question: QUESTIONS.sundays,
      options: withCmi(sundays.map((date) => formatDateOption(date))),
      sessions: withCmiSession(dateSessions(sundays)),
      isAnonymous: false,
      allowsMultipleAnswers: true,
      allowAddingOptions: false,
    },
  ];

  const messages: MessagePayload[] = [];

  if (holidays.length > 0) {
    polls.push({
      kind: 'holidays',
      question: QUESTIONS.holidays,
      // R46: holiday sessions split into a morning and an afternoon half.
      options: withCmi(slotOptions(holidays, HOLIDAY_SLOTS)),
      sessions: withCmiSession(slotSessions(holidays, HOLIDAY_SLOTS)),
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
 * Two polls grow as dates x slots. Saturdays reach 16 with five Saturdays and
 * three slots; holidays reach 13 with six holidays, since each is asked twice.
 * The shared `cmi` answer (R43) spends one option in every poll, which is why a
 * third Saturday slot no longer fits any month. Truncating would silently drop
 * real sessions, so this fails before the first Telegram request and names both
 * numbers.
 */
function assertWithinLimits(polls: readonly PollPayload[], monthLabel: string): void {
  for (const poll of polls) {
    if (poll.options.length > MAX_POLL_OPTIONS) {
      throw new Error(
        `${poll.kind} poll for ${monthLabel} needs ${poll.options.length} options, ` +
          `exceeding the Telegram maximum of ${MAX_POLL_OPTIONS}. ` +
          'Reduce the configured time slots, narrow the dates, or split the poll.',
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
