import type { AttendanceState } from './attendance.ts';
import {
  applyPollAnswer,
  applyPollUpdate,
  loadAttendanceState,
  pruneAttendance,
  rosterKey,
  saveAttendanceState,
} from './attendance.ts';
import { singaporeDate } from './clock.ts';
import type { Destination } from './config.ts';
import { projectRoster, renderRoster, rosterTextHash } from './roster.ts';
import type { TelegramConfig } from './telegram.ts';
import {
  editMessageText,
  getUpdates,
  pinChatMessage,
  redactToken,
  UPDATE_PAGE_SIZE,
} from './telegram.ts';

export interface CollectConfig {
  readonly token: string;
  readonly destinations: readonly Destination[];
  readonly statePath: string;
}

export interface CollectDeps {
  readonly now: Date;
  readonly telegram?: Partial<TelegramConfig>;
}

export interface CollectOutcome {
  readonly exitCode: number;
  readonly lines: readonly string[];
  readonly applied: number;
  readonly ignored: number;
  readonly edits: number;
}

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * One collection run. (R1, R3-R8, R17, R18, R25, R26, R27)
 *
 * This module is deliberately unable to reach poll delivery: it imports no
 * transport that can create a message and no module that records delivery
 * claims, so no failure here can disturb the monthly job's guarantees. (R27)
 */
export async function collect(config: CollectConfig, deps: CollectDeps): Promise<CollectOutcome> {
  const lines: string[] = [];
  const telegram: TelegramConfig = { token: config.token, ...deps.telegram };
  const redact = (text: string) => redactToken(text, config.token);

  let state = loadAttendanceState(config.statePath);
  let applied = 0;
  let ignored = 0;
  let edits = 0;
  let failure: string | null = null;
  const unregistered = new Set<string>();

  try {
    // Exactly one page per run, deliberately.
    //
    // Requesting a later offset is what makes Telegram discard the updates
    // below it, and those updates are unrecoverable after 24 hours. Paging
    // within a run would acknowledge page 1 while page 1 existed only on an
    // ephemeral Actions runner — the durable copy is not written until the
    // workflow commits and pushes after this process exits, so a cancelled
    // runner, a rebase conflict, or a failed push would lose it for good.
    //
    // With one call, the only offset ever acknowledged is the one a previous
    // run already pushed. A crash or failed push simply means the next run
    // re-reads the same updates, which is harmless because applying them is
    // idempotent (R3 replaces rather than merges).
    const updates = await getUpdates(telegram, state.offset);

    if (updates.length > 0) {
      let next = state;
      let highest = state.offset - 1;
      for (const update of updates) {
        highest = Math.max(highest, update.update_id);
        if (update.poll) next = applyPollUpdate(next, update.poll);
        if (update.poll_answer) {
          const outcome = applyPollAnswer(next, update.poll_answer);
          next = outcome.state;
          if (outcome.applied) applied += 1;
          else {
            ignored += 1;
            unregistered.add(update.poll_answer.poll_id);
          }
        }
      }

      state = { ...next, offset: highest + 1 };
      saveAttendanceState(state, config.statePath);

      if (updates.length >= UPDATE_PAGE_SIZE) {
        lines.push(
          `page was full (${updates.length}); more updates remain and will be read next run`,
        );
      }
    }
  } catch (error) {
    failure = redact(describe(error));
  }

  if (failure === null) {
    state = pruneAttendance(
      { ...state, lastSync: deps.now.toISOString() },
      singaporeDate(deps.now),
    );
    saveAttendanceState(state, config.statePath);

    const result = await publishRosters(state, config, telegram, deps.now, lines);
    state = result.state;
    edits = result.edits;
    saveAttendanceState(state, config.statePath);
    if (result.failures.length > 0) failure = redact(result.failures.join('; '));
  }

  lines.push(`applied ${applied} vote update(s); ignored ${ignored} unregistered`);
  // R7: an aggregate count leaves an operator unable to find the poll whose
  // registration is missing. Ids only -- never the update's contents.
  if (unregistered.size > 0) {
    lines.push(`unregistered poll id(s): ${[...unregistered].sort().join(', ')}`);
  }
  if (edits > 0) lines.push(`edited ${edits} roster message(s)`);
  if (failure !== null) {
    // R25: a failed run must go red so the operator finds out; members
    // separately see the sync time in the roster stop advancing.
    lines.push(`collection failed: ${failure}`);
    return { exitCode: 1, lines, applied, ignored, edits };
  }

  return { exitCode: 0, lines, applied, ignored, edits };
}

/**
 * Re-render every live roster and edit the ones whose text changed.
 *
 * One roster's failure must not hide the rest: a group whose roster is
 * unrenderable would otherwise stop every other group from updating too. Each
 * is attempted independently and the failures are returned together.
 */
async function publishRosters(
  initial: AttendanceState,
  config: CollectConfig,
  telegram: TelegramConfig,
  now: Date,
  lines: string[],
): Promise<{ state: AttendanceState; edits: number; failures: string[] }> {
  const currentMonth = singaporeDate(now).slice(0, 7);
  const failures: string[] = [];
  let state = initial;
  let edits = 0;

  for (const destination of config.destinations) {
    const months = new Set(
      Object.values(state.polls)
        .filter((poll) => poll.alias === destination.alias)
        .map((poll) => poll.month),
    );

    for (const month of [...months].sort()) {
      // R17: a month that has ended stops being updated.
      if (month < currentMonth) continue;

      const key = rosterKey(destination.alias, month);
      const record = state.rosters[key];
      if (!record) {
        // The monthly job owns roster creation (R15); nothing to edit yet.
        lines.push(`no roster message recorded for ${destination.alias} ${month}`);
        continue;
      }

      try {
        // A pin that failed at delivery is retried here; nothing else ever
        // revisits a delivered roster.
        let pinned = record.pinned;
        if (!pinned) {
          await pinChatMessage(telegram, destination.chatId, record.messageId);
          pinned = true;
          state = {
            ...state,
            rosters: { ...state.rosters, [key]: { ...record, pinned } },
          };
        }

        const text = renderRoster(projectRoster(state, destination.alias, month), {
          syncedAt: state.lastSync === null ? null : new Date(state.lastSync),
        });
        const textHash = rosterTextHash(text);
        // R18: Telegram rejects an edit to identical text, and a no-op edit is
        // pure waste against the per-group rate limit.
        if (textHash === record.textHash) continue;

        await editMessageText(telegram, destination.chatId, record.messageId, text);
        edits += 1;
        state = {
          ...state,
          rosters: {
            ...state.rosters,
            [key]: { messageId: record.messageId, textHash, pinned },
          },
        };
      } catch (error) {
        failures.push(`roster ${destination.alias} ${month}: ${describe(error)}`);
      }
    }
  }

  return { state, edits, failures };
}
