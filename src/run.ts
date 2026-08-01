import { resolveTargetMonth } from './clock.ts';
import type { RunConfig } from './config.ts';
import { loadDeliveryRecord, markDelivered, pendingKinds, saveDeliveryRecord } from './delivery.ts';
import { formatMonthLabel } from './format.ts';
import type { HolidayRow } from './holidays.ts';
import { resolveHolidays } from './holidays.ts';
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
  /**
   * Deliberately separate from the Telegram transport. Sharing one `fetch`
   * would make "no Telegram request was issued" untestable, because holiday
   * resolution also uses the network. Omit it to resolve from the snapshot
   * alone with no network at all.
   */
  readonly holidayFetchImpl?: typeof fetch;
  readonly telegram?: Partial<TelegramConfig>;
}

/**
 * Orchestrate one run. (R12, R19-R23, R31)
 *
 * Order matters: resolve the month, consult the delivery record, resolve
 * holidays, and build every payload for every destination **before** the first
 * Telegram request, so a build failure cannot leave a month half-posted.
 */
/** Always fails, so `resolveHolidays` degrades to the snapshot with no network. */
const noNetwork = (async () => new Response('', { status: 503 })) as unknown as typeof fetch;

export async function run(config: RunConfig, deps: RunDeps): Promise<RunOutcome> {
  const lines: string[] = [];
  const sentKinds: PollKind[] = [];

  try {
    const target = resolveTargetMonth({ now: deps.now, override: config.targetMonth });
    const monthKey = `${target.year}-${String(target.month).padStart(2, '0')}`;
    const monthLabel = formatMonthLabel(target.year, target.month);
    lines.push(`target month: ${monthLabel}`);

    const record = loadDeliveryRecord(deps.deliveryPath);
    const pending = config.force ? [...config.kinds] : pendingKinds(record, monthKey, config.kinds);

    // R19: already delivered is a successful no-op, not a failure.
    if (pending.length === 0) {
      lines.push(`nothing to do: ${monthLabel} already delivered (${config.kinds.join(', ')})`);
      return { exitCode: 0, lines, sentKinds: [], skipped: true };
    }

    const holidays = await resolveHolidays({
      target,
      snapshot: deps.snapshot,
      fetchImpl: config.offline ? noNetwork : (deps.holidayFetchImpl ?? noNetwork),
      delayMs: 0,
    });
    if (holidays.warning) lines.push(`warning: ${holidays.warning}`);

    // R12: build every payload before the first request, so a build failure
    // cannot leave a month half-posted.
    const built = buildPolls({
      target,
      holidayDates: holidays.dates,
      slots: config.slots ?? DEFAULT_SLOTS,
    });
    const polls = built.polls.filter((poll) => pending.includes(poll.kind));
    const messages = built.messages.filter((message) => pending.includes(message.kind));

    // R15: an uncovered year still delivers the polls that never needed it.
    const exitCode = holidays.covered ? 0 : 1;
    if (!holidays.covered) {
      lines.push(
        `no holiday coverage for ${target.year}; Friday and Saturday polls are unaffected`,
      );
    }

    if (config.preview) {
      for (const poll of polls) {
        lines.push(`[poll: ${poll.kind}] ${poll.question}`);
        for (const option of poll.options) lines.push(`  - ${option}`);
      }
      for (const message of messages) lines.push(`[message: ${message.kind}] ${message.text}`);
      lines.push('preview only — no Telegram request was made.');
      return { exitCode, lines, sentKinds: [], skipped: false };
    }

    const telegram: TelegramConfig = { token: config.token, ...deps.telegram };
    let updated = record;

    // Record each kind as soon as it lands everywhere, so a later failure
    // cannot cause an earlier kind to be re-sent on the recovery run. (R23)
    for (const poll of polls) {
      for (const chatId of config.chatIds) {
        await sendPoll(telegram, chatId, poll);
      }
      updated = markDelivered(updated, monthKey, poll.kind);
      saveDeliveryRecord(updated, deps.deliveryPath);
      sentKinds.push(poll.kind);
      lines.push(`sent ${poll.kind} to ${config.chatIds.length} destination(s)`);
    }

    for (const message of messages) {
      for (const chatId of config.chatIds) {
        await sendMessage(telegram, chatId, message.text);
      }
      updated = markDelivered(updated, monthKey, message.kind);
      saveDeliveryRecord(updated, deps.deliveryPath);
      sentKinds.push(message.kind);
      lines.push(`sent ${message.kind} notice to ${config.chatIds.length} destination(s)`);
    }

    return { exitCode, lines, sentKinds, skipped: false };
  } catch (error) {
    lines.push(`run failed: ${error instanceof Error ? error.message : String(error)}`);
    return { exitCode: 1, lines, sentKinds, skipped: false };
  }
}
