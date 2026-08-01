const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const LONG_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/**
 * Split an ISO date by parsing the string directly rather than via `Date`.
 *
 * `new Date('2026-09-01')` is parsed as UTC midnight, and reading it back with
 * local getters renders 31 Aug for any host west of UTC. Parsing the text
 * sidesteps that class of bug entirely — these values carry no instant, only a
 * calendar date.
 */
function parseIsoDate(isoDate: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    throw new Error(`invalid date "${isoDate}": expected YYYY-MM-DD`);
  }

  const [, yearText = '', monthText = '', dayText = ''] = match;
  const month = Number(monthText);
  if (month < 1 || month > 12) {
    throw new Error(`invalid date "${isoDate}": month must be 01-12`);
  }

  return { year: Number(yearText), month, day: Number(dayText) };
}

/**
 * Render an ISO date as a poll option: day-of-month without a leading zero,
 * then the abbreviated month. `2026-09-06` becomes `6 Sep`. (R37)
 */
export function formatDateOption(isoDate: string): string {
  const { month, day } = parseIsoDate(isoDate);
  return `${day} ${SHORT_MONTHS[month - 1] ?? ''}`;
}

/**
 * Render an ISO date and a time slot as a Saturday poll option, e.g.
 * `6 Sep, 10am-12pm`. (R38)
 *
 * The comma separator is deliberate: the owner's original `<Date>-<Time>`
 * shorthand produced `6 Sep-10-12pm`, where the hyphens are ambiguous.
 */
export function formatSlotOption(isoDate: string, slot: string): string {
  return `${formatDateOption(isoDate)}, ${slot}`;
}

/** Render a target month for prose, e.g. `September 2026`. */
export function formatMonthLabel(year: number, month: number): string {
  if (month < 1 || month > 12) {
    throw new Error(`invalid month ${month}: must be 1-12`);
  }
  return `${LONG_MONTHS[month - 1] ?? ''} ${year}`;
}
