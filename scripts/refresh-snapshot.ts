/**
 * Regenerate the committed holiday snapshot from the live data.gov.sg dataset.
 *
 *   npm run snapshot:refresh
 *
 * Review the resulting diff before committing — this file is the fallback the
 * monthly run depends on when the live source is unreachable.
 */
import { writeFileSync } from 'node:fs';
import { DATASET_ID, fetchLiveHolidays } from '../src/holidays.ts';

const OUTPUT = 'data/holidays.json';

const holidays = await fetchLiveHolidays();

const snapshot = {
  source: `https://data.gov.sg/datasets/${DATASET_ID}/view`,
  refreshedOn: new Date().toISOString().slice(0, 10),
  holidays,
};

writeFileSync(OUTPUT, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

const years = [...new Set(holidays.map((row) => row.date.slice(0, 4)))].sort();
console.log(`wrote ${OUTPUT}: ${holidays.length} holidays covering ${years.join(', ')}`);
