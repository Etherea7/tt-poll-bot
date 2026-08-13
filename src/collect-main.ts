import { ATTENDANCE_PATH } from './attendance.ts';
import { collect } from './collect.ts';
import { parseCollectConfig } from './config.ts';

/**
 * Entry point for the hourly attendance collection job. (R1, R25)
 *
 * Unlike the monthly entry point there is no preview mode: collection only
 * reads updates and edits an existing roster message, so it can never post
 * something new to a group.
 */

let exitCode = 0;

try {
  const config = parseCollectConfig(process.env);
  const outcome = await collect(
    { ...config, statePath: ATTENDANCE_PATH },
    { now: new Date(), telegram: { fetchImpl: fetch } },
  );

  for (const line of outcome.lines) {
    console.log(line);
  }
  exitCode = outcome.exitCode;
} catch (error) {
  // Only configuration failures reach here, before any Telegram request. The
  // token cannot appear in these messages because it is never interpolated.
  console.error(`collection failed: ${error instanceof Error ? error.message : String(error)}`);
  exitCode = 1;
}

process.exit(exitCode);
