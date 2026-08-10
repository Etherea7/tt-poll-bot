import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { DeliveryRecord } from '../src/delivery.ts';
import {
  claimsForRun,
  loadDeliveryRecord,
  markDelivered,
  parseDeliveryRecord,
  prepareClaims,
  saveDeliveryRecord,
} from '../src/delivery.ts';

const ALL = ['fridays', 'saturdays', 'sundays', 'holidays'] as const;
const tempPath = (name: string) => join(mkdtempSync(join(tmpdir(), 'ttpoll-')), name);

// AC1 (R1, R2): committed state contains only aliases and independently tracks
// every destination/kind claim or delivery.
test('parseDeliveryRecord retains per-alias delivery statuses without chat ids', () => {
  const persisted = {
    '2026-11': {
      test: {
        fridays: { status: 'delivered', claimId: 'run-1' },
        saturdays: { status: 'claimed', claimId: 'run-1' },
      },
      club: { fridays: { status: 'claimed', claimId: 'run-1' } },
    },
  } as const;
  const record = parseDeliveryRecord(persisted);
  assert.deepEqual(record, persisted);
  assert.doesNotMatch(JSON.stringify(record), /-100\d{6,}/);
});

test('parseDeliveryRecord rejects malformed state and chat ids masquerading as aliases', () => {
  assert.throws(() => parseDeliveryRecord([1, 2, 3]), /record/i);
  assert.throws(() => parseDeliveryRecord({ '2026-09': ['fridays'] }), /destination/i);
  assert.throws(() => parseDeliveryRecord({ '2026-09': { '-1001234567890': {} } }), /safe alias/i);
  assert.throws(
    () =>
      parseDeliveryRecord({
        '2026-09': { test: { mondays: { status: 'claimed', claimId: 'r' } } },
      }),
    /mondays/i,
  );
  assert.throws(
    () =>
      parseDeliveryRecord({
        '2026-09': { test: { fridays: { status: 'claimed', claimId: 'bad claim' } } },
      }),
    /claim id/i,
  );
});

test('saveDeliveryRecord then loadDeliveryRecord round-trips per-alias state', () => {
  const path = tempPath('delivered.json');
  const record: DeliveryRecord = {
    '2026-09': { test: { fridays: { status: 'delivered', claimId: 'run-1' } } },
  };
  saveDeliveryRecord(record, path);
  assert.deepEqual(loadDeliveryRecord(path), record);
  assert.doesNotMatch(readFileSync(path, 'utf8'), /-100\d{6,}/);
});

test('loadDeliveryRecord treats a missing file as empty and rejects a corrupt one', () => {
  assert.deepEqual(loadDeliveryRecord(tempPath('absent.json')), {});
  const path = tempPath('corrupt.json');
  writeFileSync(path, '{ not json');
  assert.throws(() => loadDeliveryRecord(path));
});

test('prepareClaims creates independently owned claims and preserves delivered work', () => {
  // Four poll kinds across two destinations.
  const prepared = prepareClaims({}, '2026-11', ['test', 'club'], ALL, 'run-1', false);
  assert.equal(prepared.claimed.length, 8);
  const delivered = markDelivered(prepared.record, '2026-11', 'test', 'fridays', 'run-1');
  const second = prepareClaims(delivered, '2026-11', ['test', 'club'], ALL, 'run-2', false);
  assert.equal(second.record['2026-11']?.test?.fridays?.status, 'delivered');
  assert.equal(second.blocked.length, 7);
});

test('a blocked prepare leaves every sibling claim unchanged', () => {
  const initial = prepareClaims({}, '2026-11', ['test'], ['fridays'], 'run-1', false).record;
  const attempted = prepareClaims(
    initial,
    '2026-11',
    ['test', 'club'],
    ['fridays'],
    'run-2',
    false,
  );
  assert.deepEqual(attempted.blocked, [{ alias: 'test', kind: 'fridays' }]);
  assert.deepEqual(attempted.claimed, []);
  assert.deepEqual(attempted.record, initial);
});

test('force explicitly reclaims delivered work during preparation', () => {
  const claimed = prepareClaims({}, '2026-11', ['test'], ['fridays'], 'run-1', false).record;
  const delivered = markDelivered(claimed, '2026-11', 'test', 'fridays', 'run-1');
  const forced = prepareClaims(delivered, '2026-11', ['test'], ['fridays'], 'run-2', true);
  assert.deepEqual(forced.claimed, [{ alias: 'test', kind: 'fridays' }]);
  assert.deepEqual(forced.record['2026-11']?.test?.fridays, {
    status: 'claimed',
    claimId: 'run-2',
  });
});

// AC3 (R4): an added alias has no historic state and remains eligible even
// when existing aliases already delivered the whole month.
test('prepareClaims leaves a newly configured alias eligible', () => {
  let record = prepareClaims({}, '2026-11', ['test'], ALL, 'run-1', false).record;
  for (const kind of ALL) record = markDelivered(record, '2026-11', 'test', kind, 'run-1');
  const prepared = prepareClaims(record, '2026-11', ['test', 'club'], ALL, 'run-2', false);
  assert.deepEqual(
    prepared.claimed,
    ALL.map((kind) => ({ alias: 'club', kind })),
  );
});

test('claimsForRun permits only the owning run and markDelivered is idempotent', () => {
  const prepared = prepareClaims({}, '2026-11', ['test'], ['fridays'], 'run-1', false).record;
  assert.deepEqual(claimsForRun(prepared, '2026-11', ['test'], ['fridays'], 'run-2'), {
    sendable: [],
    blocked: [{ alias: 'test', kind: 'fridays' }],
    missing: [],
  });
  const delivered = markDelivered(prepared, '2026-11', 'test', 'fridays', 'run-1');
  assert.deepEqual(markDelivered(delivered, '2026-11', 'test', 'fridays', 'run-1'), delivered);
});
