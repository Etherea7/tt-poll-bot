import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseConfig } from '../src/config.ts';

const env = (overrides: Record<string, string | undefined> = {}) => ({
  TELEGRAM_BOT_TOKEN: '123:FAKE',
  TELEGRAM_DESTINATIONS: 'test=-1001,club=-1002',
  ...overrides,
});

type HardenedConfig = {
  readonly mode: 'preview' | 'prepare' | 'live';
  readonly claimId: string | undefined;
  readonly destinations: readonly { readonly alias: string; readonly chatId: string }[];
};

const hardened = (argv: readonly string[], overrides: Record<string, string | undefined> = {}) =>
  parseConfig(env(overrides), argv) as unknown as HardenedConfig;

// Only the negative grammar checks retain this legacy variable so the current
// parser reaches argv processing. Hardened configuration must not require it.
const withLegacyGroups = (
  argv: readonly string[],
  overrides: Record<string, string | undefined> = {},
) => hardened(argv, { TELEGRAM_GROUP_IDS: '-1001,-1002', ...overrides });

// AC7 (R9): no flag must be the safe mode. The current CLI defaults to live.
test('parseConfig defaults to preview without requiring a token', () => {
  const config = hardened([], { TELEGRAM_BOT_TOKEN: undefined });
  assert.equal(config.mode, 'preview');
});

test('parseConfig requires explicit live and prepare modes', () => {
  assert.throws(() => hardened(['--live']), /claim/i);
  const live = hardened(['--live', '--claim', 'run-123']);
  assert.equal(live.mode, 'live');

  assert.throws(() => hardened(['--prepare']), /claim/i);
  const prepared = hardened(['--prepare', '--claim', 'run-123']);
  assert.equal(prepared.mode, 'prepare');
  assert.equal(prepared.claimId, 'run-123');
  assert.throws(() => hardened(['--preview', '--live']), /exclusive|mode/i);
});

// AC7 (R10): each token is consumed exactly once. A malformed invocation must
// fail before holiday resolution or Telegram transport is reachable.
test('parseConfig rejects malformed flag grammar', () => {
  const invalidArgv = [
    ['--unknown'],
    ['--month'],
    ['--only'],
    ['--only', ''],
    ['--slots'],
    ['--slots', ''],
    ['--month', '2026-05', '--month', '2026-06'],
    ['--live', '--live'],
    ['--force', 'unexpected'],
  ];

  for (const argv of invalidArgv) {
    assert.throws(
      () => withLegacyGroups(argv),
      /flag|argument|value|duplicate|unknown|empty/i,
      argv.join(' '),
    );
  }
});

// AC7 (R10): state and logs use aliases, while chat IDs remain runtime-only.
test('parseConfig accepts unique destination aliases and rejects invalid mappings', () => {
  const config = hardened(['--preview']);
  assert.deepEqual(config.destinations, [
    { alias: 'test', chatId: '-1001' },
    { alias: 'club', chatId: '-1002' },
  ]);
});

test('parseConfig narrows destinations with a unique known --to alias list', () => {
  const config = hardened(['--to', 'club']);
  assert.deepEqual(config.destinations, [{ alias: 'club', chatId: '-1002' }]);
  for (const argv of [['--to'], ['--to', ''], ['--to', 'club,club'], ['--to', 'missing']]) {
    assert.throws(() => hardened(argv), /to|alias|value/i, argv.join(' '));
  }
});

test('parseConfig rejects invalid or duplicate destination aliases', () => {
  for (const destinations of [
    'test=-1001,test=-1002',
    'test=-1001,club=-1001',
    '=-1001',
    'test=',
    'test=not-a-group-id',
    'not-a-mapping',
  ]) {
    assert.throws(
      () => withLegacyGroups(['--preview'], { TELEGRAM_DESTINATIONS: destinations }),
      /destination|alias|mapping/i,
      destinations,
    );
  }
});
