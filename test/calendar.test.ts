import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fridaysIn, saturdaysIn, sundaysIn } from '../src/calendar.ts';

test('fridaysIn returns every Friday in September 2026', () => {
  assert.deepEqual(fridaysIn(2026, 9), ['2026-09-04', '2026-09-11', '2026-09-18', '2026-09-25']);
});

test('fridaysIn returns five Fridays in May 2026', () => {
  assert.equal(fridaysIn(2026, 5).length, 5);
});

// AC5 (R5): every and only Saturday, ascending.
test('saturdaysIn returns every Saturday in September 2026', () => {
  assert.deepEqual(saturdaysIn(2026, 9), ['2026-09-05', '2026-09-12', '2026-09-19', '2026-09-26']);
});

test('saturdaysIn returns five Saturdays in August 2026', () => {
  assert.deepEqual(saturdaysIn(2026, 8), [
    '2026-08-01',
    '2026-08-08',
    '2026-08-15',
    '2026-08-22',
    '2026-08-29',
  ]);
});

// Leap-year boundary: February 2028 has 29 days, and the 29th is a Tuesday.
test('saturdaysIn handles a leap February', () => {
  assert.deepEqual(saturdaysIn(2028, 2), ['2028-02-05', '2028-02-12', '2028-02-19', '2028-02-26']);
});

// AC40 (R42): Sundays are derived by the same UTC-only arithmetic.
test('sundaysIn returns every Sunday in September 2026', () => {
  assert.deepEqual(sundaysIn(2026, 9), ['2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27']);
});

// A month can open on a Sunday and still hold five of them.
test('sundaysIn returns five Sundays in March 2026', () => {
  assert.deepEqual(sundaysIn(2026, 3), [
    '2026-03-01',
    '2026-03-08',
    '2026-03-15',
    '2026-03-22',
    '2026-03-29',
  ]);
});
