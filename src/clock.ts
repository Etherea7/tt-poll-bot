/** A calendar month. `month` is 1-based: 1 = January, 12 = December. */
export interface YearMonth {
  readonly year: number;
  readonly month: number;
}

/**
 * The calendar date in `Asia/Singapore` at the given instant, as `YYYY-MM-DD`.
 *
 * This is the ONLY time-zone-sensitive operation in the system. Everything
 * downstream is pure calendar arithmetic. Singapore observes no daylight
 * saving, but the IANA zone is used rather than a fixed +08:00 offset so the
 * rule stays correct if that ever changes.
 *
 * `en-CA` is used because it formats as `YYYY-MM-DD`, avoiding a manual
 * reassembly of the parts.
 */
export function singaporeDate(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** Parse a `YYYY-MM` string, rejecting anything else. */
export function parseYearMonth(value: string): YearMonth {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`invalid month "${value}": expected YYYY-MM`);
  }

  const [, yearText = '', monthText = ''] = match;
  const year = Number(yearText);
  const month = Number(monthText);

  if (month < 1 || month > 12) {
    throw new Error(`invalid month "${value}": month must be 01-12`);
  }

  return { year, month };
}

/** The calendar month immediately following the given one, rolling the year. */
export function nextMonth(yearMonth: YearMonth): YearMonth {
  const { year, month } = yearMonth;
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/**
 * The month the polls are about.
 *
 * Scheduled runs execute on the 25th and target the *following* month, so
 * members have notice before it begins — including when the 1st is itself a
 * public holiday. An explicit `YYYY-MM` override wins over the derived value.
 */
export function resolveTargetMonth(options: {
  now: Date;
  override?: string | undefined;
}): YearMonth {
  const { now, override } = options;

  if (override !== undefined) {
    return parseYearMonth(override);
  }

  // Derive from the Singapore date, not the host's, so a run near a UTC month
  // boundary still selects the month a Singapore reader would expect.
  const runMonth = parseYearMonth(singaporeDate(now).slice(0, 7));
  return nextMonth(runMonth);
}
