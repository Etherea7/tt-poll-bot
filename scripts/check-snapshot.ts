/**
 * Fail when the committed holiday snapshot no longer reaches far enough ahead.
 * (R17)
 *
 *   npm run snapshot:check
 *
 * Runs in CI so staleness surfaces during ordinary development, not during a
 * scheduled run that has already lost its live source.
 */
import { readFileSync } from 'node:fs';
import { checkCoverage, parseSnapshot, REQUIRED_COVERAGE_MONTHS } from '../src/snapshot.ts';

const PATH = 'data/holidays.json';

let snapshot: ReturnType<typeof parseSnapshot>;
try {
  snapshot = parseSnapshot(JSON.parse(readFileSync(PATH, 'utf8')));
} catch (error) {
  console.error(`snapshot check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const report = checkCoverage(snapshot.holidays, today);

if (!report.ok) {
  console.error(
    `snapshot is stale: covers to ${report.latest}, but must reach ${report.required} ` +
      `(${REQUIRED_COVERAGE_MONTHS} months ahead of ${today}).`,
  );
  console.error('Run "npm run snapshot:refresh" and commit the result.');
  process.exit(1);
}

console.log(
  `snapshot ok: ${snapshot.holidays.length} holidays, covers to ${report.latest} ` +
    `(needs ${report.required}), last refreshed ${snapshot.refreshedOn}.`,
);
