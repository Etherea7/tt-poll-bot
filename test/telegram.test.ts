import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PollPayload } from '../src/polls.ts';
import {
  AmbiguousDeliveryError,
  callApi,
  redactToken,
  SupergroupMigrationError,
  sendMessage,
  sendPoll,
} from '../src/telegram.ts';

const TOKEN = '123456:FAKE-TEST-TOKEN-NOT-REAL';

const poll: PollPayload = {
  kind: 'fridays',
  question: 'Friday TT Sessions',
  options: ['6 Nov', '13 Nov'],
  isAnonymous: false,
  allowsMultipleAnswers: true,
  allowAddingOptions: false,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Returns a fetch double plus the log of requests it saw. */
const recorder = (responses: Array<() => Response | Promise<Response>>) => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  let index = 0;
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
    });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    if (!next) throw new Error('no response configured');
    return next();
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
};

const config = (fetchImpl: typeof fetch) => ({
  token: TOKEN,
  fetchImpl,
  baseDelayMs: 0,
});

// R30: the token must never reach a log or an error message.
test('redactToken removes the token from arbitrary text', () => {
  const url = `https://api.telegram.org/bot${TOKEN}/sendPoll`;
  const redacted = redactToken(`failed calling ${url}`, TOKEN);
  assert.ok(!redacted.includes(TOKEN));
  assert.match(redacted, /REDACTED/);
});

// AC11 (R11): the poll payload maps onto Telegram's field names.
test('sendPoll posts the expected Bot API payload', async () => {
  const { fetchImpl, calls } = recorder([() => json({ ok: true, result: {} })]);
  await sendPoll(config(fetchImpl), '-1001234567890', poll);

  assert.equal(calls.length, 1);
  assert.match(calls[0]?.url ?? '', /\/sendPoll$/);
  // Bot API 7.3 changed `options` from strings to InputPollOption objects.
  assert.deepEqual(calls[0]?.body, {
    chat_id: '-1001234567890',
    question: 'Friday TT Sessions',
    options: [{ text: '6 Nov' }, { text: '13 Nov' }],
    is_anonymous: false,
    allows_multiple_answers: true,
    allow_adding_options: false,
  });
});

test('sendPoll sets allow_adding_options when the poll allows it', async () => {
  const { fetchImpl, calls } = recorder([() => json({ ok: true, result: {} })]);
  await sendPoll(config(fetchImpl), '-1001', { ...poll, allowAddingOptions: true });
  assert.equal(calls[0]?.body.allow_adding_options, true);
});

test('sendMessage posts chat_id and text', async () => {
  const { fetchImpl, calls } = recorder([() => json({ ok: true, result: {} })]);
  await sendMessage(config(fetchImpl), '-1001', 'No public holidays in September 2026.');
  assert.match(calls[0]?.url ?? '', /\/sendMessage$/);
  assert.deepEqual(calls[0]?.body, {
    chat_id: '-1001',
    text: 'No public holidays in September 2026.',
  });
});

// AC25 (R24): honour retry_after on 429.
test('callApi waits for retry_after then retries a 429', async () => {
  const { fetchImpl, calls } = recorder([
    () => json({ ok: false, error_code: 429, parameters: { retry_after: 2 } }, 429),
    () => json({ ok: true, result: 'done' }),
  ]);
  const waits: number[] = [];
  const result = await callApi(
    {
      token: TOKEN,
      fetchImpl,
      baseDelayMs: 0,
      sleepImpl: async (ms: number) => {
        waits.push(ms);
      },
    },
    'sendPoll',
    {},
  );
  assert.equal(result, 'done');
  assert.equal(calls.length, 2);
  assert.ok((waits[0] ?? 0) >= 2000, `expected a wait of at least 2000ms, got ${waits[0]}`);
});

// AC26 (R25): retry 5xx with increasing delay.
test('callApi retries a 5xx and succeeds', async () => {
  const { fetchImpl, calls } = recorder([
    () => json({ ok: false }, 500),
    () => json({ ok: false }, 502),
    () => json({ ok: true, result: 'done' }),
  ]);
  const result = await callApi(config(fetchImpl), 'sendPoll', {});
  assert.equal(result, 'done');
  assert.equal(calls.length, 3);
});

test('callApi gives up after the attempt budget', async () => {
  const { fetchImpl, calls } = recorder([() => json({ ok: false }, 500)]);
  await assert.rejects(callApi(config(fetchImpl), 'sendPoll', {}), /500|attempt/i);
  assert.equal(calls.length, 3);
});

// R25: a connection failure before any response is safe to retry.
test('callApi retries a pre-response connection failure', async () => {
  let attempts = 0;
  const fetchImpl = (async () => {
    attempts += 1;
    if (attempts < 3) throw new TypeError('fetch failed');
    return json({ ok: true, result: 'done' });
  }) as unknown as typeof fetch;
  assert.equal(await callApi(config(fetchImpl), 'sendPoll', {}), 'done');
  assert.equal(attempts, 3);
});

// AC27 (R26): a post-transmission timeout is never retried.
test('callApi does not retry an ambiguous timeout', async () => {
  let attempts = 0;
  const fetchImpl = (async () => {
    attempts += 1;
    throw new DOMException('The operation was aborted.', 'TimeoutError');
  }) as unknown as typeof fetch;

  await assert.rejects(callApi(config(fetchImpl), 'sendPoll', {}), AmbiguousDeliveryError);
  assert.equal(attempts, 1, 'an ambiguous outcome must not be retried');
});

// AC28 (R27): supergroup migration names the replacement id.
test('callApi raises a migration error carrying the new chat id', async () => {
  const { fetchImpl } = recorder([
    () =>
      json(
        {
          ok: false,
          error_code: 400,
          description: 'Bad Request: group chat was upgraded to a supergroup chat',
          parameters: { migrate_to_chat_id: -1009876543210 },
        },
        400,
      ),
  ]);
  await assert.rejects(callApi(config(fetchImpl), 'sendPoll', { chat_id: '-100123' }), (error) => {
    assert.ok(error instanceof SupergroupMigrationError);
    assert.equal(error.toChatId, -1009876543210);
    assert.match(error.message, /-1009876543210/);
    return true;
  });
});

test('callApi does not retry an ordinary 4xx', async () => {
  const { fetchImpl, calls } = recorder([
    () => json({ ok: false, error_code: 403, description: 'Forbidden: bot was blocked' }, 403),
  ]);
  await assert.rejects(callApi(config(fetchImpl), 'sendPoll', {}), /403|Forbidden/i);
  assert.equal(calls.length, 1);
});

// AC30 (R29): the token never appears in a thrown error.
test('callApi errors never contain the bot token', async () => {
  const { fetchImpl } = recorder([() => json({ ok: false, description: 'nope' }, 403)]);
  await assert.rejects(callApi(config(fetchImpl), 'sendPoll', {}), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.ok(!error.message.includes(TOKEN), 'token leaked into the error message');
    return true;
  });
});
