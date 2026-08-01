import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { coversYear } from '../src/holidays.ts';
import {
  addMonths,
  checkCoverage,
  latestCoveredMonth,
  parseSnapshot,
  REQUIRED_COVERAGE_MONTHS,
} from '../src/snapshot.ts';

const rows = [
  { date: '2026-05-01', name: 'Labour Day' },
  { date: '2026-12-25', name: 'Christmas Day' },
  { date: '2027-01-01', name: 'New Year’s Day' },
];

test('addMonths rolls the year', () => {
  assert.equal(addMonths('2026-08', 6), '2027-02');
  assert.equal(addMonths('2026-01', 1), '2026-02');
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(addMonths('2026-06', 12), '2027-06');
});

test('latestCoveredMonth finds the furthest month', () => {
  assert.equal(latestCoveredMonth(rows), '2027-01');
});

test('parseSnapshot accepts a well-formed snapshot', () => {
  const parsed = parseSnapshot({ source: 'x', refreshedOn: '2026-08-01', holidays: rows });
  assert.equal(parsed.holidays.length, 3);
});

test('parseSnapshot rejects a malformed snapshot', () => {
  assert.throws(() => parseSnapshot(null), /snapshot/i);
  assert.throws(() => parseSnapshot({ holidays: 'nope' }), /holidays/i);
  assert.throws(() => parseSnapshot({ holidays: [{ date: 'nope', name: 'x' }] }), /date/i);
});

// AC17 (R17): a snapshot reaching only three months ahead must fail the check.
test('checkCoverage fails when the snapshot reaches only three months ahead', () => {
  const report = checkCoverage(rows, '2026-10-15');
  assert.equal(report.ok, false); // latest 2027-01 vs required 2027-04
  assert.equal(report.latest, '2027-01');
  assert.equal(report.required, '2027-04');
});

test('checkCoverage passes when the snapshot reaches far enough ahead', () => {
  const report = checkCoverage(rows, '2026-05-01');
  assert.equal(report.ok, true); // required 2026-11, latest 2027-01
});

test('checkCoverage treats exactly-sufficient coverage as passing', () => {
  const report = checkCoverage(rows, '2026-07-31');
  assert.equal(report.required, '2027-01');
  assert.equal(report.ok, true);
});

// The committed snapshot must be real, parseable, and currently sufficient.
test('the committed snapshot is valid and covers the required horizon', () => {
  const snapshot = parseSnapshot(JSON.parse(readFileSync('data/holidays.json', 'utf8')));
  assert.ok(snapshot.holidays.length > 0);
  assert.ok(coversYear(snapshot.holidays, 2026), 'snapshot must cover 2026');
  assert.ok(coversYear(snapshot.holidays, 2027), 'snapshot must cover 2027');

  const today = new Date().toISOString().slice(0, 10);
  const report = checkCoverage(snapshot.holidays, today);
  assert.equal(
    report.ok,
    true,
    `committed snapshot is stale: covers to ${report.latest}, needs ${report.required}. ` +
      `Run "npm run snapshot:refresh".`,
  );
  assert.equal(REQUIRED_COVERAGE_MONTHS, 6);
});
