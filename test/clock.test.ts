import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextMonth, resolveTargetMonth, singaporeDate } from '../src/clock.ts';

// AC1 (R1): a scheduled run on the 25th targets the following month.
test('resolveTargetMonth derives the month after the run date', () => {
  const now = new Date('2026-08-25T01:17:00Z'); // 09:17 in Singapore
  assert.deepEqual(resolveTargetMonth({ now }), { year: 2026, month: 9 });
});

// AC2 (R2): an explicit override wins regardless of the run date.
test('resolveTargetMonth honours an explicit override', () => {
  const now = new Date('2026-08-25T01:17:00Z');
  assert.deepEqual(resolveTargetMonth({ now, override: '2027-01' }), {
    year: 2027,
    month: 1,
  });
});

// AC3 (R3): month selection follows Singapore, not UTC.
// 2026-08-31T20:00Z is already 2026-09-01 in Singapore, so the target month is
// October. Reading this instant as UTC would wrongly yield September.
test('resolveTargetMonth uses the Singapore calendar date across a UTC boundary', () => {
  const now = new Date('2026-08-31T20:00:00Z');
  assert.equal(singaporeDate(now), '2026-09-01');
  assert.deepEqual(resolveTargetMonth({ now }), { year: 2026, month: 10 });
});

test('singaporeDate is unaffected by an instant late in the UTC day', () => {
  assert.equal(singaporeDate(new Date('2026-01-31T16:30:00Z')), '2026-02-01');
  assert.equal(singaporeDate(new Date('2026-01-31T15:59:00Z')), '2026-01-31');
});

test('nextMonth rolls the year over from December', () => {
  assert.deepEqual(nextMonth({ year: 2026, month: 12 }), { year: 2027, month: 1 });
  assert.deepEqual(nextMonth({ year: 2026, month: 1 }), { year: 2026, month: 2 });
});

test('resolveTargetMonth rolls into the next year from December', () => {
  const now = new Date('2026-12-25T01:17:00Z');
  assert.deepEqual(resolveTargetMonth({ now }), { year: 2027, month: 1 });
});

// Asserts the specific rejection reason, not merely "something threw" — a
// bare assert.throws would also pass against an unimplemented stub.
test('resolveTargetMonth rejects a malformed override', () => {
  const now = new Date('2026-08-25T01:17:00Z');
  assert.throws(() => resolveTargetMonth({ now, override: '2026-13' }), {
    message: 'invalid month "2026-13": month must be 01-12',
  });
  assert.throws(() => resolveTargetMonth({ now, override: 'August' }), {
    message: 'invalid month "August": expected YYYY-MM',
  });
  assert.throws(() => resolveTargetMonth({ now, override: '2026-9' }), {
    message: 'invalid month "2026-9": expected YYYY-MM',
  });
});
