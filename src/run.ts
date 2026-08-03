import { resolveTargetMonth } from './clock.ts';
import type { RunConfig } from './config.ts';
import {
  claimsForRun,
  loadDeliveryRecord,
  markDelivered,
  prepareClaims,
  saveDeliveryRecord,
} from './delivery.ts';
import { formatMonthLabel } from './format.ts';
import type { HolidayResult, HolidayRow } from './holidays.ts';
import { coversYear, holidaysInMonth, resolveHolidays } from './holidays.ts';
import type { PollKind } from './polls.ts';
import { buildPolls, DEFAULT_SLOTS } from './polls.ts';
import type { TelegramConfig } from './telegram.ts';
import { sendMessage, sendPoll } from './telegram.ts';

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
  readonly holidayFetchImpl?: typeof fetch;
  readonly telegram?: Partial<TelegramConfig>;
}

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
      const prepared = prepareClaims(record, monthKey, aliases, requested, claimId, config.force);
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

    const owned = claimsForRun(record, monthKey, aliases, requested, claimId);
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

    for (const poll of polls) {
      for (const destination of config.destinations) {
        if (!sendable.has(`${destination.alias}\u0000${poll.kind}`)) continue;
        await sendPoll(telegram, destination.chatId, poll);
        updated = markDelivered(updated, monthKey, destination.alias, poll.kind, claimId);
        saveDeliveryRecord(updated, deps.deliveryPath);
        sentKinds.add(poll.kind);
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

    lines.push(`delivered ${sentKinds.size} poll kind(s) to claimed destination(s)`);
    return { exitCode, lines, sentKinds: [...sentKinds], skipped: false };
  } catch (error) {
    lines.push(`run failed: ${error instanceof Error ? error.message : String(error)}`);
    return { exitCode: 1, lines, sentKinds: [...sentKinds], skipped: false };
  }
}
