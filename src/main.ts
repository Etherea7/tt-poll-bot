import { readFileSync } from 'node:fs';
import { parseConfig } from './config.ts';
import { DELIVERY_PATH } from './delivery.ts';
import { run } from './run.ts';
import { parseSnapshot } from './snapshot.ts';

/**
 * Entry point.
 *
 * Scheduled runs execute on the 25th and target the following month. Manual
 * dispatch may override the month, narrow the scope, prepare durable claims,
 * or explicitly deliver only claims owned by its run identifier.
 */

const SNAPSHOT_PATH = 'data/holidays.json';

let exitCode = 0;

try {
  const config = parseConfig(process.env, process.argv.slice(2));
  const snapshot = parseSnapshot(JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')));

  const outcome = await run(config, {
    now: new Date(),
    snapshot: snapshot.holidays,
    deliveryPath: DELIVERY_PATH,
    // Omitted when offline so holidays resolve from the snapshot alone.
    ...(config.offline ? {} : { holidayFetchImpl: fetch }),
  });

  for (const line of outcome.lines) {
    console.log(line);
  }
  exitCode = outcome.exitCode;
} catch (error) {
  // Configuration and snapshot failures land here, before any Telegram
  // request has been issued. (R24)
  console.error(`run failed: ${error instanceof Error ? error.message : String(error)}`);
  exitCode = 1;
}

process.exit(exitCode);
