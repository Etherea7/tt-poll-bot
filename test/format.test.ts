import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDateOption, formatMonthLabel, formatSlotOption } from '../src/format.ts';

// AC35 (R37): "6 Sep" — no leading zero, abbreviated month.
test('formatDateOption drops the leading zero and abbreviates the month', () => {
  assert.equal(formatDateOption('2026-09-06'), '6 Sep');
  assert.equal(formatDateOption('2026-09-26'), '26 Sep');
  assert.equal(formatDateOption('2027-01-01'), '1 Jan');
  assert.equal(formatDateOption('2026-12-25'), '25 Dec');
});

test('formatDateOption is not shifted by the host time zone', () => {
  // A local-time parse of "2026-09-01" would render as 31 Aug west of UTC.
  assert.equal(formatDateOption('2026-09-01'), '1 Sep');
});

// AC36 (R38): date, comma, slot.
test('formatSlotOption joins the date and slot with a comma', () => {
  assert.equal(formatSlotOption('2026-09-05', '10am-12pm'), '5 Sep, 10am-12pm');
  assert.equal(formatSlotOption('2026-09-12', '7-9pm'), '12 Sep, 7-9pm');
});

test('formatMonthLabel renders a full month name and year', () => {
  assert.equal(formatMonthLabel(2026, 9), 'September 2026');
  assert.equal(formatMonthLabel(2027, 1), 'January 2027');
});
