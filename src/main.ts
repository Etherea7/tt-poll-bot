import { readFileSync } from 'node:fs';
import { resolveTargetMonth } from './clock.ts';
import { formatMonthLabel } from './format.ts';
import { resolveHolidays } from './holidays.ts';
import { buildPolls, DEFAULT_SLOTS } from './polls.ts';
import { parseSnapshot } from './snapshot.ts';

/**
 * Preview entry point.
 *
 * Renders exactly the poll payloads a live run would send, without contacting
 * Telegram (R31). The Telegram client, the delivery record, and the scheduled
 * workflow are not built yet, so a non-preview invocation must fail loudly
 * rather than appear to have posted something.
 *
 * Holidays come from the live data.gov.sg dataset with the committed snapshot
 * as fallback (R14). `--holidays` overrides both, and `--offline` skips the
 * network entirely.
 */

const args = process.argv.slice(2);

const flagValue = (flag: string): string | undefined => {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
};

if (!args.includes('--preview')) {
  console.error('refusing to run: only --preview is implemented at this stage.');
  console.error('sending to Telegram is not built yet — see specs/001-monthly-telegram-polls/.');
  process.exit(2);
}

const slotsFlag = flagValue('--slots');
const slots = slotsFlag ? slotsFlag.split(',').map((value) => value.trim()) : DEFAULT_SLOTS;

const explicitHolidays = flagValue('--holidays');

try {
  const target = resolveTargetMonth({ now: new Date(), override: flagValue('--month') });
  const monthLabel = formatMonthLabel(target.year, target.month);

  let holidayDates: readonly string[];
  let holidaySource = 'manual (--holidays)';
  let covered = true;

  if (explicitHolidays !== undefined) {
    holidayDates = explicitHolidays
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  } else {
    const snapshot = parseSnapshot(JSON.parse(readFileSync('data/holidays.json', 'utf8')));
    const resolved = await resolveHolidays({
      target,
      snapshot: snapshot.holidays,
      // --offline exercises the fallback path without touching the network.
      ...(args.includes('--offline')
        ? { fetchImpl: (async () => new Response('', { status: 503 })) as unknown as typeof fetch }
        : {}),
    });
    holidayDates = resolved.dates;
    holidaySource = resolved.source;
    covered = resolved.covered;
    if (resolved.warning) console.warn(`warning: ${resolved.warning}`);
  }

  const { polls, messages } = buildPolls({ target, holidayDates, slots });

  console.log(`preview — target month ${monthLabel}`);
  console.log(`slots: ${slots.join(' | ')}`);
  console.log(`holiday source: ${holidaySource}\n`);

  for (const poll of polls) {
    console.log(`[poll: ${poll.kind}] ${poll.question}`);
    console.log(
      `  non-anonymous: ${!poll.isAnonymous}, multi-select: ${poll.allowsMultipleAnswers}, ` +
        `members may add options: ${poll.allowAddingOptions}`,
    );
    for (const option of poll.options) {
      console.log(`    - ${option}`);
    }
    console.log(`  (${poll.options.length} options)\n`);
  }

  for (const message of messages) {
    console.log(`[message: ${message.kind}] ${message.text}\n`);
  }

  console.log('no Telegram request was made.');

  // R15: no holiday coverage from either source still delivers the Friday and
  // Saturday polls, but exits non-zero so the gap is visible to an operator.
  if (!covered) {
    console.error(
      `\nno holiday coverage for ${target.year} in either the live source or the snapshot. ` +
        'Friday and Saturday polls are unaffected; the holiday poll was skipped.',
    );
    process.exit(1);
  }
} catch (error) {
  console.error(`preview failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
