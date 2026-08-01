import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fridaysIn } from '../src/calendar.ts';

test('fridaysIn returns every Friday in September 2026', () => {
  assert.deepEqual(fridaysIn(2026, 9), ['2026-09-04', '2026-09-11', '2026-09-18', '2026-09-25']);
});

test('fridaysIn returns five Fridays in May 2026', () => {
  assert.equal(fridaysIn(2026, 5).length, 5);
});
