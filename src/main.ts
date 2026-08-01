import { resolveTargetMonth } from './clock.ts';
import { formatMonthLabel } from './format.ts';
import { buildPolls, DEFAULT_SLOTS } from './polls.ts';

/**
 * Preview entry point.
 *
 * Renders exactly the poll payloads a live run would send, without contacting
 * Telegram (R31). Holiday sourcing, the Telegram client, the delivery record,
 * and the scheduled workflow are not built yet, so a non-preview invocation
 * must fail loudly rather than appear to have posted something.
 *
 * `--holidays` accepts comma-separated ISO dates so the holiday poll and the
 * de-duplication rule can be previewed before the real source exists.
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

const holidayDates = (flagValue('--holidays') ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter((value) => value.length > 0);

const slotsFlag = flagValue('--slots');
const slots = slotsFlag ? slotsFlag.split(',').map((value) => value.trim()) : DEFAULT_SLOTS;

try {
  const target = resolveTargetMonth({ now: new Date(), override: flagValue('--month') });
  const { polls, messages } = buildPolls({ target, holidayDates, slots });

  console.log(`preview — target month ${formatMonthLabel(target.year, target.month)}`);
  console.log(`slots: ${slots.join(' | ')}\n`);

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
} catch (error) {
  console.error(`preview failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
