/**
 * Day-of-week indices as returned by `Date.prototype.getUTCDay()`.
 *
 * A `const` object rather than a TypeScript `enum`: Node executes this file by
 * stripping types without transforming syntax, and `enum` emits runtime code.
 * `tsconfig.json` sets `erasableSyntaxOnly` so that constraint fails the
 * typecheck gate rather than the job.
 */
const WEEKDAY = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
} as const;

/**
 * Every Friday in the given month, ascending.
 * `month` is 1-based (1 = January, 12 = December).
 * Returns ISO date strings, e.g. ["2026-09-04", "2026-09-11", ...].
 *
 * Pure calendar arithmetic: carries no time-zone meaning.
 *
 * Every date is constructed and read in UTC. A local-time `new Date(y, m, d)`
 * would render as the previous day for any host west of UTC, silently shifting
 * every poll option by one day. The only time-zone-sensitive question in this
 * project is "what is today's date in Singapore", and it is answered elsewhere.
 */
export function fridaysIn(year: number, month: number): string[] {
  // Day 0 of the following month is the last day of this one, which also
  // handles leap Februaries without a special case.
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const fridays: string[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCDay() === WEEKDAY.friday) {
      fridays.push(date.toISOString().slice(0, 10));
    }
  }

  return fridays;
}
