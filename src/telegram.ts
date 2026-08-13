import type { PollPayload } from './polls.ts';

export const TELEGRAM_API_BASE = 'https://api.telegram.org';

export interface TelegramConfig {
  readonly token: string;
  readonly apiBase?: string;
  readonly fetchImpl?: typeof fetch;
  readonly maxAttempts?: number;
  /** Injectable so tests can assert on wait durations without elapsing them. */
  readonly sleepImpl?: (ms: number) => Promise<void>;
}

/**
 * Telegram reported that the destination is now a supergroup with a different
 * chat id. The allow-list is static, so this must reach an operator rather than
 * be silently followed. (R28)
 */
export class SupergroupMigrationError extends Error {
  readonly fromChatId: string;
  readonly toChatId: number;

  constructor(fromChatId: string, toChatId: number) {
    super(
      `configured destination migrated to supergroup ${toChatId}; update runtime configuration`,
    );
    this.name = 'SupergroupMigrationError';
    this.fromChatId = fromChatId;
    this.toChatId = toChatId;
  }
}

/**
 * A request was transmitted but its outcome is unknown. Never retried: the
 * poll may have been delivered, and a duplicate in a live group is worse than
 * a missing one. (R27)
 */
export class AmbiguousDeliveryError extends Error {
  constructor(method: string, detail: string = 'outcome unknown') {
    super(`${method} ${detail}; not retrying`);
    this.name = 'AmbiguousDeliveryError';
  }
}

/** Replace the bot token wherever it appears. (R30) */
export function redactToken(text: string, token: string): string {
  return token ? text.split(token).join('«REDACTED»') : text;
}

/**
 * The subset of Telegram's objects this project reads.
 *
 * Deliberately structural and partial: Telegram adds fields continuously, and
 * declaring only what is consumed keeps an unrelated API addition from becoming
 * a type error. Field names stay in Telegram's snake_case so the shape can be
 * compared against the published documentation without a translation step.
 */
export interface TelegramPollOption {
  /** Stable across option additions and deletions; positions are not. (R5) */
  readonly persistent_id?: string;
  readonly text: string;
  readonly voter_count?: number;
}

export interface TelegramPoll {
  readonly id: string;
  readonly question: string;
  readonly options: readonly TelegramPollOption[];
}

export interface TelegramMessage {
  readonly message_id: number;
  readonly poll?: TelegramPoll;
}

export interface TelegramUser {
  readonly id: number;
  readonly first_name?: string;
  readonly last_name?: string;
  readonly username?: string;
}

export interface TelegramPollAnswer {
  readonly poll_id: string;
  readonly user?: TelegramUser;
  readonly option_ids?: readonly number[];
  readonly option_persistent_ids?: readonly string[];
}

export interface TelegramUpdate {
  readonly update_id: number;
  readonly poll?: TelegramPoll;
  readonly poll_answer?: TelegramPollAnswer;
}

/**
 * The only update kinds this bot can act on. (R1)
 *
 * Telegram's default set is "everything except a few", which would consume
 * updates nothing here handles. Naming the two explicitly keeps the offset
 * advancing only past updates the collection job understands.
 */
export const ALLOWED_UPDATES: readonly string[] = ['poll', 'poll_answer'];

/**
 * Telegram's per-call ceiling for `getUpdates`. The collection job pages until
 * a call returns fewer than this, so it is exported for that comparison.
 */
export const UPDATE_PAGE_SIZE = 100;

/**
 * Send one poll to one chat. (R11)
 *
 * Returns Telegram's `Message` because the poll id is assigned here and
 * nowhere else: discarding it would leave a live poll that no later run can
 * resolve to a destination. (R9)
 */
export async function sendPoll(
  config: TelegramConfig,
  chatId: string,
  poll: PollPayload,
): Promise<TelegramMessage> {
  return (await callApi(config, 'sendPoll', {
    chat_id: chatId,
    question: poll.question,
    // Bot API 7.3 changed this from strings to InputPollOption objects.
    options: poll.options.map((text) => ({ text })),
    is_anonymous: poll.isAnonymous,
    allows_multiple_answers: poll.allowsMultipleAnswers,
    allow_adding_options: poll.allowAddingOptions,
  })) as TelegramMessage;
}

/** Send one plain message to one chat. (R11) */
export async function sendMessage(
  config: TelegramConfig,
  chatId: string,
  text: string,
): Promise<TelegramMessage> {
  return (await callApi(config, 'sendMessage', {
    chat_id: chatId,
    text,
  })) as TelegramMessage;
}

/**
 * Fetch one page of pending updates. (R1)
 *
 * `timeout: 0` short-polls: this runs from a scheduled job that must exit, not
 * from a long-lived process. The caller pages until a short result arrives.
 */
export async function getUpdates(
  config: TelegramConfig,
  offset: number,
): Promise<TelegramUpdate[]> {
  return (await callApi(config, 'getUpdates', {
    offset,
    limit: UPDATE_PAGE_SIZE,
    timeout: 0,
    allowed_updates: ALLOWED_UPDATES,
  })) as TelegramUpdate[];
}

/**
 * Replace the text of an existing message. (R17)
 *
 * Editing reuses the message id, so the group sees no new message. Telegram
 * rejects an edit to identical text with "message is not modified", which is
 * why callers compare before calling. (R18)
 */
export async function editMessageText(
  config: TelegramConfig,
  chatId: string,
  messageId: number,
  text: string,
): Promise<void> {
  await callApi(config, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
  });
}

/** Pin a message without notifying the group. (R16) */
export async function pinChatMessage(
  config: TelegramConfig,
  chatId: string,
  messageId: number,
): Promise<void> {
  await callApi(config, 'pinChatMessage', {
    chat_id: chatId,
    message_id: messageId,
    disable_notification: true,
  });
}

interface ApiEnvelope {
  ok?: boolean;
  result?: unknown;
  description?: string;
  parameters?: { retry_after?: number; migrate_to_chat_id?: number };
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Fetch does not reveal whether a failing request reached Telegram, so every
 * thrown fetch error is conservatively ambiguous.
 */
const isTimeout = (error: unknown): boolean =>
  error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');

/**
 * Call a Bot API method with the retry taxonomy from R24-R27.
 *
 * Retried: HTTP 429 honouring `retry_after`.
 * Not retried: 5xx responses, thrown fetch errors, and any other 4xx.
 */
export async function callApi(
  config: TelegramConfig,
  method: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const doFetch = config.fetchImpl ?? fetch;
  const sleep = config.sleepImpl ?? defaultSleep;
  const maxAttempts = config.maxAttempts ?? 3;
  const url = `${config.apiBase ?? TELEGRAM_API_BASE}/bot${config.token}/${method}`;
  const redact = (text: string) => redactToken(text, config.token);

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response: Response;

    try {
      response = await doFetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      if (isTimeout(error)) {
        throw new AmbiguousDeliveryError(method, 'timed out after request submission');
      }
      throw new AmbiguousDeliveryError(
        method,
        redact(
          `failed without a response: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    const payload = (await response.json().catch(() => ({}))) as ApiEnvelope;

    if (response.ok && payload.ok) {
      return payload.result;
    }

    // R28: the static allow-list must be corrected by a human, not followed.
    const migrated = payload.parameters?.migrate_to_chat_id;
    if (migrated !== undefined) {
      throw new SupergroupMigrationError(String(body.chat_id ?? 'unknown'), migrated);
    }

    if (response.status === 429) {
      // R24: honour Telegram's own backoff instruction.
      const retryAfter = payload.parameters?.retry_after ?? 1;
      lastError = new Error(redact(`${method} rate limited (429), retry_after=${retryAfter}`));
      if (attempt < maxAttempts) {
        await sleep(retryAfter * 1000);
        continue;
      }
      throw lastError;
    }

    if (response.status >= 500) {
      throw new AmbiguousDeliveryError(method, `returned HTTP ${response.status}`);
    }

    // Any other 4xx is a request the bot must not repeat.
    throw new Error(
      redact(
        `${method} failed with ${response.status}: ${payload.description ?? 'no description'}`,
      ),
    );
  }

  throw lastError ?? new Error(`${method} failed after ${maxAttempts} attempts`);
}
