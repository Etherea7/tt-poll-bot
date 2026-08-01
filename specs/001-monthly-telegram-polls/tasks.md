# Tasks — 001 monthly Telegram availability polls

Each implementation task names the failing test that proves it done. Red is
observed before any implementation. Requirement IDs refer to `spec.md`.

## This increment — pure domain logic, no I/O

- [x] T1. Target-month resolution in `Asia/Singapore` (R1, R2, R3).
  Test: `test/clock.test.ts` — AC1, AC2, AC3. Red observed
  2026-08-01T11:26:40Z, green 11:27:33Z.
- [x] T2. Saturday derivation (R5). Test: `test/calendar.test.ts` — AC5.
  Red observed 2026-08-01T11:26:40Z, green 11:27:33Z.
- [x] T3. Date and slot option rendering (R37, R38).
  Test: `test/format.test.ts` — AC35, AC36. Red observed
  2026-08-01T11:28:53Z, green 11:29:58Z.
- [x] T4. Poll builder: questions, de-duplication, ordering, option and length
  limits, `allow_adding_options`, empty-holiday message, overflow guard
  (R7, R8, R9, R10, R16, R34, R35, R36, R39, R40, R41).
  Test: `test/polls.test.ts` — AC7, AC8, AC9, AC10, AC16, AC34, AC37, AC38, AC39.
  Red observed 2026-08-01T11:28:53Z, green 11:29:58Z.

## Deferred to later increments

Listed so a cold reader sees the boundary, not because they are forgotten.

- [x] T5. Holiday source: data.gov.sg three-step download, snapshot fallback,
  schema validation (R6, R14, R15). — AC6, AC14, AC15.
  Test: `test/holidays.test.ts`. Red observed 2026-08-01T12:26:11Z (14
  failures), green 12:27:08Z (40/40).
- [x] T6. Snapshot staleness CI check (R17). — AC17.
  Test: `test/snapshot.test.ts`, script `scripts/check-snapshot.ts`. Red
  observed 2026-08-01T12:27:53Z (8 failures), green 12:29:03Z (48/48).
- [x] T7. Telegram client: retry taxonomy, migration detection, redaction
  (R11, R24-R30). — AC11, AC25-AC30. Test: `test/telegram.test.ts`.
  Red 2026-08-01T12:36:40Z, green 12:38:03Z.
- [x] T8. Delivery record and per-kind guard (R18-R23). — AC18-AC22.
  Test: `test/delivery.test.ts`. Same red/green runs as T7.
- [x] T9. Coordinator: config validation, build-before-send, preview, scope
  selector, fan-out (R12, R13, R31). — AC12, AC13, AC23, AC24, AC31.
  Test: `test/run.test.ts`. Red 2026-08-01T12:39:10Z, green 12:40:42Z.
- [x] T10. GitHub Actions workflows, secrets/variables, failure notification
  (R29, R32, R33). — AC29, AC32, AC33.
  `.github/workflows/monthly-polls.yml` and `ci.yml`.

## Notes

- The poll builder takes holiday dates as an argument rather than fetching
  them, so it stays a pure function and T4 does not depend on T5.
- `fridaysIn` already exists from the bootstrap first outcome and satisfies AC4.
