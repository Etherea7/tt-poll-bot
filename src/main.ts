import { fridaysIn } from './calendar.ts';

/**
 * Bootstrap entry point.
 *
 * Scope note: this proves the development loop end to end. Target-month
 * resolution in `Asia/Singapore`, next-month targeting, Saturdays, holiday
 * sourcing, the delivery record, and the Telegram client are R1-R33 of
 * `specs/001-monthly-telegram-polls/spec.md` and belong to `wf-feature`.
 *
 * Sending is deliberately not implemented. Until it is, a non-preview
 * invocation must fail loudly rather than appear to have posted something.
 */

const args = process.argv.slice(2);

const flagValue = (flag: string): string | undefined => {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
};

const isPreview = args.includes('--preview');

if (!isPreview) {
  console.error('refusing to run: only --preview is implemented at this stage.');
  console.error('sending to Telegram is not built yet — see specs/001-monthly-telegram-polls/.');
  process.exit(2);
}

const now = new Date();
const requestedMonth =
  flagValue('--month') ??
  `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

const match = /^(\d{4})-(\d{2})$/.exec(requestedMonth);
if (!match) {
  console.error(`invalid --month "${requestedMonth}": expected YYYY-MM.`);
  process.exit(1);
}

const year = Number(match[1]);
const month = Number(match[2]);

if (month < 1 || month > 12) {
  console.error(`invalid --month "${requestedMonth}": month must be 01-12.`);
  process.exit(1);
}

const fridays = fridaysIn(year, month);

console.log(`preview — target month ${requestedMonth}`);
console.log(`Fridays (${fridays.length}):`);
for (const friday of fridays) {
  console.log(`  - ${friday}`);
}
console.log('\nno Telegram request was made.');
