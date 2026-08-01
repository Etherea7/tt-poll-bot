import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  loadDeliveryRecord,
  markDelivered,
  parseDeliveryRecord,
  pendingKinds,
  saveDeliveryRecord,
} from '../src/delivery.ts';

const ALL = ['fridays', 'saturdays', 'holidays'] as const;
const tempPath = (name: string) => join(mkdtempSync(join(tmpdir(), 'ttpoll-')), name);

test('parseDeliveryRecord accepts a well-formed record', () => {
  const record = parseDeliveryRecord({ '2026-09': ['fridays', 'saturdays'] });
  assert.deepEqual(record, { '2026-09': ['fridays', 'saturdays'] });
});

// A malformed record must not be read as "nothing delivered yet" — that would
// re-post an entire month to a live group.
test('parseDeliveryRecord rejects malformed input rather than assuming empty', () => {
  assert.throws(() => parseDeliveryRecord([1, 2, 3]), /record/i);
  assert.throws(() => parseDeliveryRecord({ '2026-09': 'fridays' }), /array/i);
  assert.throws(() => parseDeliveryRecord({ '2026-09': ['sundays'] }), /sundays/i);
  assert.throws(() => parseDeliveryRecord({ 'Sept 2026': ['fridays'] }), /YYYY-MM/i);
});

test('loadDeliveryRecord treats a missing file as empty', () => {
  assert.deepEqual(loadDeliveryRecord(tempPath('absent.json')), {});
});

test('saveDeliveryRecord then loadDeliveryRecord round-trips', () => {
  const path = tempPath('delivered.json');
  saveDeliveryRecord({ '2026-09': ['fridays'] }, path);
  assert.deepEqual(loadDeliveryRecord(path), { '2026-09': ['fridays'] });
  assert.match(readFileSync(path, 'utf8'), /2026-09/);
});

test('loadDeliveryRecord throws on a corrupt file', () => {
  const path = tempPath('corrupt.json');
  writeFileSync(path, '{ not json');
  assert.throws(() => loadDeliveryRecord(path));
});

// AC20 (R19): everything already delivered means nothing to send.
test('pendingKinds returns nothing when all requested kinds are recorded', () => {
  const record = { '2026-09': [...ALL] };
  assert.deepEqual(pendingKinds(record, '2026-09', ALL), []);
});

// AC21 (R20): a partially failed run resends only what is missing.
test('pendingKinds returns only the kinds not yet delivered', () => {
  assert.deepEqual(pendingKinds({ '2026-09': ['fridays', 'saturdays'] }, '2026-09', ALL), [
    'holidays',
  ]);
});

test('pendingKinds returns everything for an unseen month', () => {
  assert.deepEqual(pendingKinds({}, '2026-10', ALL), [...ALL]);
});

// AC23 (R22): the scope selector narrows what counts as requested.
test('pendingKinds respects a narrowed request', () => {
  assert.deepEqual(pendingKinds({}, '2026-10', ['holidays']), ['holidays']);
  assert.deepEqual(pendingKinds({ '2026-10': ['holidays'] }, '2026-10', ['holidays']), []);
});

// AC18/AC19 (R23): recorded per kind, and only on success.
test('markDelivered adds one kind without disturbing others', () => {
  let record = markDelivered({}, '2026-09', 'fridays');
  record = markDelivered(record, '2026-09', 'saturdays');
  record = markDelivered(record, '2026-10', 'fridays');
  assert.deepEqual(record, {
    '2026-09': ['fridays', 'saturdays'],
    '2026-10': ['fridays'],
  });
});

test('markDelivered is idempotent', () => {
  const once = markDelivered({}, '2026-09', 'fridays');
  assert.deepEqual(markDelivered(once, '2026-09', 'fridays'), { '2026-09': ['fridays'] });
});

test('markDelivered does not mutate its input', () => {
  const original = { '2026-09': ['fridays'] as const };
  const input = { '2026-09': [...original['2026-09']] };
  markDelivered(input, '2026-09', 'holidays');
  assert.deepEqual(input, { '2026-09': ['fridays'] });
});
