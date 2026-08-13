import type { AttendanceState, RegisteredOption } from './attendance.ts';
import {
  emptyAttendanceState,
  loadAttendanceState,
  registerPoll,
  rosterKey,
  saveAttendanceState,
} from './attendance.ts';
import { resolveTargetMonth } from './clock.ts';
import type { RunConfig } from './config.ts';
import { ALL_KINDS } from './config.ts';
import type { DeliveryKind } from './delivery.ts';
import {
  claimsForRun,
  loadDeliveryRecord,
  markDelivered,
  prepareClaims,
  ROSTER_KIND,
  saveDeliveryRecord,
} from './delivery.ts';
import { formatMonthLabel } from './format.ts';
import type { HolidayResult, HolidayRow } from './holidays.ts';
import { coversYear, holidaysInMonth, resolveHolidays } from './holidays.ts';
import type { PollKind, PollPayload } from './polls.ts';
import { buildPolls, CMI_OPTION, DEFAULT_SLOTS } from './polls.ts';
import { projectRoster, renderRoster, rosterTextHash } from './roster.ts';
import type { TelegramConfig, TelegramMessage } from './telegram.ts';
import { pinChatMessage, sendMessage, sendPoll } from './telegram.ts';

export interface RunOutcome {
  readonly exitCode: number;
  readonly lines: readonly string[];
  readonly sentKinds: readonly PollKind[];
  readonly skipped: boolean;
}

export interface RunDeps {
  readonly now: Date;
  readonly snapshot: readonly HolidayRow[];
  readonly deliveryPath: string;
  /**
   * Required, not defaulted: a caller that forgot it would silently write the
   * real state file, which is how the test suite once wrote into the repo.
   */
  readonly attendancePath: string;
  readonly holidayFetchImpl?: typeof fetch;
  readonly telegram?: Partial<TelegramConfig>;
}

/**
 * Bind a delivered poll to its destination and option meanings. (R5, R10)
 *
 * Telegram echoes the options in the order they were sent, so the payload's
 * aligned sessions supply each one's meaning.
 *
 * Returns null unless *every* option carries a persistent id. A registration
 * missing one option is worse than no registration: the vote for it is still
 * stored but the projection cannot see it, so that attendance silently
 * disappears — and if a later poll update supplies the id, the option comes
 * back with no session and a real session is filed under "Other options".
 */
function registrationOptions(poll: PollPayload, sent: TelegramMessage): RegisteredOption[] | null {
  const echoed = sent.poll?.options ?? [];
  if (echoed.length === 0) return null;

  const options: RegisteredOption[] = [];
  for (const [index, option] of echoed.entries()) {
    const persistentId = option.persistent_id;
    if (!persistentId) return null;
    const label = poll.options[index] ?? option.text;
    options.push({
      persistentId,
      label,
      session: poll.sessions[index] ?? null,
      cmi: label === CMI_OPTION,
    });
  }
  return options;
}

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Always fails, so snapshot-only tests and offline runs perform no network I/O. */
const noNetwork = (async () => new Response('', { status: 503 })) as unknown as typeof fetch;

export async function run(config: RunConfig, deps: RunDeps): Promise<RunOutcome> {
  const lines: string[] = [];
  const sentKinds = new Set<PollKind>();

  try {
    const target = resolveTargetMonth({ now: deps.now, override: config.targetMonth });
    const monthKey = `${target.year}-${String(target.month).padStart(2, '0')}`;
    const monthLabel = formatMonthLabel(target.year, target.month);
    lines.push(`target month: ${monthLabel}`);

    const snapshotCovered = coversYear(deps.snapshot, target.year);
    const offlineHolidays: HolidayResult = snapshotCovered
      ? {
          covered: true,
          source: 'snapshot',
          dates: holidaysInMonth(deps.snapshot, target.year, target.month),
        }
      : {
          covered: false,
          source: 'none',
          dates: [],
          warning: `committed snapshot does not cover ${target.year}`,
        };
    const holidays = config.offline
      ? offlineHolidays
      : await resolveHolidays({
          target,
          snapshot: deps.snapshot,
          fetchImpl: deps.holidayFetchImpl ?? noNetwork,
        });
    if (holidays.warning) lines.push(`warning: ${holidays.warning}`);

    // Build every payload before state mutation or transport. Missing coverage
    // has no holiday work at all: an empty month is a distinct covered state.
    const built = buildPolls({
      target,
      holidayDates: holidays.dates,
      slots: config.slots ?? DEFAULT_SLOTS,
    });
    const requested = config.kinds.filter((kind) => holidays.covered || kind !== 'holidays');
    // R15: the roster is claimed alongside the polls so a retried run cannot
    // post a second one. It is not a poll kind and never reaches `buildPolls`.
    //
    // A run narrowed with `--only` is an operator recovering specific polls;
    // dragging the roster into that scope would post one for a month whose
    // other polls are not being sent. Only a full run owns the roster.
    const fullRun = config.kinds.length === ALL_KINDS.length;
    const deliveryKinds: DeliveryKind[] = fullRun ? [...requested, ROSTER_KIND] : [...requested];
    const polls = built.polls.filter((poll) => requested.includes(poll.kind));
    const messages = built.messages.filter((message) => requested.includes(message.kind));
    const exitCode = holidays.covered ? 0 : 1;
    if (!holidays.covered) {
      lines.push(`no holiday coverage for ${target.year}; holiday work was omitted`);
    }

    if (config.mode === 'preview') {
      for (const poll of polls) {
        lines.push(`[poll: ${poll.kind}] ${poll.question}`);
        for (const option of poll.options) lines.push(`  - ${option}`);
      }
      for (const message of messages) lines.push(`[message: ${message.kind}] ${message.text}`);
      lines.push('preview only — no Telegram request was made.');
      return { exitCode, lines, sentKinds: [], skipped: false };
    }

    const record = loadDeliveryRecord(deps.deliveryPath);
    const aliases = config.destinations.map((destination) => destination.alias);
    const claimId = config.claimId;
    if (!claimId) throw new Error(`--${config.mode} requires a claim id`);

    if (config.mode === 'prepare') {
      const prepared = prepareClaims(
        record,
        monthKey,
        aliases,
        deliveryKinds,
        claimId,
        config.force,
      );
      if (prepared.record !== record) saveDeliveryRecord(prepared.record, deps.deliveryPath);
      if (prepared.blocked.length > 0) {
        lines.push(
          'delivery preparation blocked by an existing claim; operator recovery is required',
        );
        return { exitCode: 1, lines, sentKinds: [], skipped: false };
      }
      if (prepared.claimed.length === 0) {
        lines.push(`nothing to prepare: ${monthLabel} is already delivered`);
        return { exitCode: 0, lines, sentKinds: [], skipped: true };
      }
      lines.push(`prepared ${prepared.claimed.length} delivery claim(s)`);
      return { exitCode: 0, lines, sentKinds: [], skipped: false };
    }

    const owned = claimsForRun(record, monthKey, aliases, deliveryKinds, claimId);
    if (owned.blocked.length > 0 || owned.missing.length > 0) {
      lines.push('delivery blocked: every destination/kind must be prepared by this claim id');
      return { exitCode: 1, lines, sentKinds: [], skipped: false };
    }
    if (owned.sendable.length === 0) {
      lines.push(`nothing to do: ${monthLabel} is already delivered`);
      return { exitCode, lines, sentKinds: [], skipped: true };
    }

    const sendable = new Set(owned.sendable.map((target) => `${target.alias}\u0000${target.kind}`));
    const telegram: TelegramConfig = { token: config.token, ...deps.telegram };
    let updated = record;

    // R11: attendance is optional and poll delivery is not, so every attendance
    // step below is isolated. A failure degrades attendance and is reported; it
    // never resends, withholds, or delays a poll.
    const attendancePath = deps.attendancePath;
    let attendance = emptyAttendanceState();
    let attendanceHealthy = true;
    const degradeAttendance = (what: string, error: unknown): void => {
      attendanceHealthy = false;
      lines.push(`attendance ${what} failed; poll delivery unaffected: ${describe(error)}`);
    };
    const recordAttendance = (
      mutate: (state: AttendanceState) => AttendanceState,
      what: string,
    ): void => {
      if (!attendanceHealthy) return;
      try {
        attendance = mutate(attendance);
        saveAttendanceState(attendance, attendancePath);
      } catch (error) {
        degradeAttendance(what, error);
      }
    };
    try {
      attendance = loadAttendanceState(attendancePath);
    } catch (error) {
      degradeAttendance('state load', error);
    }

    for (const poll of polls) {
      for (const destination of config.destinations) {
        if (!sendable.has(`${destination.alias}\u0000${poll.kind}`)) continue;
        const sent = await sendPoll(telegram, destination.chatId, poll);
        updated = markDelivered(updated, monthKey, destination.alias, poll.kind, claimId);
        saveDeliveryRecord(updated, deps.deliveryPath);
        sentKinds.add(poll.kind);

        // R10: the poll id is assigned here and nowhere else. Both identifiers
        // are required — a registration missing either cannot be resolved later
        // and would fail state validation on the next load, so record nothing
        // rather than write state that poisons every following run.
        const pollId = sent.poll?.id;
        const options = registrationOptions(poll, sent);
        if (!pollId || !Number.isSafeInteger(sent.message_id) || !options) {
          lines.push(
            `attendance registration skipped for ${destination.alias}/${poll.kind}: ` +
              'Telegram returned no poll id, message id, or a persistent id for every option',
          );
        } else {
          recordAttendance(
            (state) =>
              registerPoll(state, pollId, {
                alias: destination.alias,
                month: monthKey,
                kind: poll.kind,
                messageId: sent.message_id,
                options,
              }),
            `registration for ${destination.alias}/${poll.kind}`,
          );
        }
      }
    }
    for (const message of messages) {
      for (const destination of config.destinations) {
        if (!sendable.has(`${destination.alias}\u0000${message.kind}`)) continue;
        await sendMessage(telegram, destination.chatId, message.text);
        updated = markDelivered(updated, monthKey, destination.alias, message.kind, claimId);
        saveDeliveryRecord(updated, deps.deliveryPath);
        sentKinds.add(message.kind);
      }
    }

    // R15, R16: one standalone roster per destination, pinned silently. Posted
    // after the polls so it already reflects the registrations recorded above.
    for (const destination of config.destinations) {
      if (!sendable.has(`${destination.alias}\u0000${ROSTER_KIND}`)) continue;
      const text = renderRoster(projectRoster(attendance, destination.alias, monthKey), {
        syncedAt: null,
      });
      const sent = await sendMessage(telegram, destination.chatId, text);
      updated = markDelivered(updated, monthKey, destination.alias, ROSTER_KIND, claimId);
      saveDeliveryRecord(updated, deps.deliveryPath);

      // Without a message id nothing can ever edit this roster, and the record
      // would fail state validation on the next load. The message itself is
      // already delivered, so report and move on.
      const messageId = sent.message_id;
      if (!Number.isSafeInteger(messageId)) {
        lines.push(
          `roster for ${destination.alias} returned no message id; ` +
            'it was posted but cannot be kept up to date',
        );
        continue;
      }

      // Pinning needs a permission the bot may not hold. The roster message is
      // already delivered, so a failed pin is reported and never fatal — but it
      // is recorded, because delivery never revisits a delivered roster and
      // collection is the only thing left that can retry the pin.
      let pinned = true;
      try {
        await pinChatMessage(telegram, destination.chatId, messageId);
      } catch (error) {
        pinned = false;
        lines.push(
          `roster pin failed for ${destination.alias}; collection will retry: ${describe(error)}`,
        );
      }

      recordAttendance(
        (state) => ({
          ...state,
          rosters: {
            ...state.rosters,
            [rosterKey(destination.alias, monthKey)]: {
              messageId,
              textHash: rosterTextHash(text),
              pinned,
            },
          },
        }),
        `roster record for ${destination.alias}`,
      );
    }

    lines.push(`delivered ${sentKinds.size} poll kind(s) to claimed destination(s)`);
    return { exitCode, lines, sentKinds: [...sentKinds], skipped: false };
  } catch (error) {
    lines.push(`run failed: ${error instanceof Error ? error.message : String(error)}`);
    return { exitCode: 1, lines, sentKinds: [...sentKinds], skipped: false };
  }
}
