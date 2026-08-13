---
id: 004-attendance-roster
spec: spec.md
plan: plan.md
updated: 2026-08-14
---

# Tasks — Attendance roster from Telegram poll votes

Ordered by dependency: transport, then state, then projection, then the two
orchestrators, then wiring and gates. Every implementation task names the
failing test that proves it done.

| # | Task | Verifies | Size | Delegable |
|---|---|---|---|---|
| T1 | Red: `sendPoll` returns the `Message` result; `getUpdates`, `editMessageText`, `pinChatMessage` post the documented payloads and stay inside the existing retry taxonomy | R9, R28 / AC9, AC26 | S | no — defines transport oracle |
| T2 | Green: extend `src/telegram.ts` without altering `callApi` retry behaviour | T1 | M | implementer |
| T3 | Red: attendance state parses fails-closed, saves atomically, registers polls, replaces selections, retracts on empty, ignores unknown polls, refreshes names, prunes >60 days | R3-R8, R10, R23, R26 / AC3-AC8, AC23 | M | no — state semantics are the risk |
| T4 | Green: implement `src/attendance.ts` | T3 | L | implementer |
| T5 | Red: projection excludes `cmi`, isolates destinations, renders empty sessions, headings for unresolved options, SGT sync time, name collisions, 4096 degrade-to-counts | R12-R14, R19-R22 / AC11-AC13, AC19-AC22 | M | no — degrade path is subtle |
| T6 | Green: implement `src/roster.ts` as pure functions | T5 | L | implementer |
| T7 | Red: collection calls `getUpdates` with the exact `allowed_updates`, applies before advancing the offset, skips identical renders, stops after month end, exits non-zero on failure, never sends a poll or touches delivery claims | R1, R17, R18, R25, R27 / AC1, AC16-AC18, AC24, AC25 | M | no — offset ordering is the risk |
| T8 | Green: implement `src/collect.ts` and `src/collect-main.ts` | T7 | L | implementer |
| T9 | Red: monthly run records registrations, degrades without resending on registration failure, posts exactly one roster per destination/month, pins silently | R11, R15, R16 / AC10, AC14, AC15 | M | no — touches live delivery path |
| T10 | Green: widen `DeliveryKind`, wire `src/run.ts` | T9 | M | implementer |
| T11 | Red: workflow declares an hourly schedule and a concurrency group; no `setWebhook` anywhere | R2 / AC2 | S | no |
| T12 | Green: add `.github/workflows/attendance.yml` | T11 | S | implementer |
| T13 | Docs: `docs/USAGE.md` collection job, roster behaviour, and the R24 private-repository obligation; `package.json` script | R24 | S | no |
| T14 | Full gates: `npm test`, `npm run typecheck`, `npm run lint`; diff review for scope, secrets, weakened tests | all | S | no — final judgment |
| T15 | Independent review via `codex:rescue`, then commit on `feature/004-attendance-roster` | all | S | no |

## Not in this pass

- Merging into `main` — protected, needs explicit owner confirmation (Step 8).
- Verifying the two unconfirmed Telegram behaviours (pinned-edit notification,
  `persistent_id` population) — both need a live test group, which is
  prohibited here.
