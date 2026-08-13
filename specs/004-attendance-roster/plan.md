---
id: 004-attendance-roster
spec: spec.md
updated: 2026-08-14
---

# Implementation plan — Attendance roster from Telegram poll votes

## Approach

Two independent entry points sharing one state file:

1. **The monthly poll job** (existing `src/run.ts`) gains registration and
   roster posting. After each successful `sendPoll` it records the returned
   poll ID, message ID, and per-option `persistent_id` → session mapping into
   `state/attendance.json` (R10). After the polls, it posts and pins the
   month's roster as an additional delivery kind (R15, R16).
2. **A new hourly collection job** (`src/collect.ts` + `src/collect-main.ts`)
   calls `getUpdates`, applies `poll_answer` updates with full replacement
   semantics, prunes old months, re-renders each live roster, and edits the
   message in place when the render changed (R1, R3-R8, R17, R18, R26).

### Design decisions and rejected alternatives

- **Registration is authoritative; option text is never reverse-parsed.**
  `sendPoll`'s response echoes our options in order, so index → session is known
  at send time and is stored against each `persistent_id`. *Rejected:* parsing
  `6 Sep, 10am-12pm` back into a date. It is brittle, and spec R6 already makes
  registration the source of truth. This also means "unresolved option" (R13)
  is simply "a `persistent_id` absent from the registration", with no parsing.
- **`DeliveryKind = PollKind | 'roster'` rather than widening `PollKind`.**
  The roster is not a poll; widening `PollKind` would let `--only roster` reach
  `buildPolls` and would put a non-poll into `ALL_KINDS`. `src/delivery.ts`
  moves to the wider type; `src/polls.ts` is untouched by it.
- **The last-sent roster is stored as a SHA-256 hash, not as text** (R18).
  `node:crypto` is built in, so this costs no dependency, and it keeps the
  committed state diff small — the roster text would otherwise be duplicated in
  Git on every change.
- **Collection is a separate process from delivery** so R27 holds structurally:
  the collection entry point has no code path that calls `sendPoll` or writes
  `state/delivered.json`.

## Files to touch

| Path | Change | Risk |
|---|---|---|
| `src/telegram.ts` | `sendPoll`/`sendMessage` return the `Message` result; add `getUpdates`, `editMessageText`, `pinChatMessage` | On the live delivery path — the retry taxonomy must not change |
| `src/attendance.ts` | New: state shape, strict parse, atomic save, registration, vote application, pruning | Fails-closed parsing must match `delivery.ts` discipline |
| `src/roster.ts` | New: pure projection and rendering, 4096 guard, name collisions | Pure; the 4096 degrade path is the subtle part |
| `src/collect.ts` | New: collection run orchestration | Offset handling must not drop updates on a partial failure |
| `src/collect-main.ts` | New: CLI entry mirroring `src/main.ts` | Low |
| `src/delivery.ts` | `PollKind` → `DeliveryKind`; allow `roster` | Existing state must still parse |
| `src/run.ts` | Record registrations; post and pin the roster | Must not alter existing poll delivery ordering |
| `src/config.ts` | Attendance state path; collection config | Low |
| `.github/workflows/attendance.yml` | New: hourly, concurrency group | Cannot be executed here; verified by `test/workflow.test.ts` |
| `docs/USAGE.md` | Document the collection job and the roster | Low |
| `package.json` | `npm run collect` script | Low |

## Test strategy

- **Red tests first**, one file per module, mapped to acceptance criteria:
  `test/attendance.test.ts` (AC3-AC9, AC23), `test/roster.test.ts`
  (AC11-AC13, AC19-AC22), `test/collect.test.ts` (AC1, AC7, AC16-AC18, AC24,
  AC25), `test/telegram.test.ts` extensions (AC9, AC26),
  `test/workflow.test.ts` extensions (AC2), `test/run.test.ts` extensions
  (AC10, AC14, AC15).
- **Exact green commands:** `npm test`, `npm run typecheck`, `npm run lint`.
  All three must exit 0.
- **Regression scope:** the entire existing suite. `src/telegram.ts`,
  `src/delivery.ts`, and `src/run.ts` are shared with spec 001, so
  `test/telegram.test.ts`, `test/delivery.test.ts`, `test/run.test.ts`, and
  `test/workflow.test.ts` must stay green unchanged except where a signature
  change requires an assertion update.
- **No network.** Every Telegram interaction is exercised through an injected
  `fetchImpl` double, per the existing `recorder` helper. No test may contact
  `api.telegram.org`.

## Delegation plan

- explorer: none — the codebase was read directly during planning and is small.
- implementer: none planned. The work is mostly judgment-dense (state
  semantics, degrade paths); mechanical delegation would cost more in briefing
  than it saves. Reassess if a task turns out to be purely repetitive.
- review: `codex:rescue` after the suite is green, before the merge gate.

## Risks & unknowns

- **`persistent_id` availability is unverified** (spec handback). If Telegram
  omits it in practice, R5 keying breaks. → Isolate the read behind one
  accessor in `src/attendance.ts` so a fallback to `option_ids` is a
  single-function change, and make the parser fail closed with a named error
  rather than silently keying on position.
- **Editing a pinned message may notify** (spec handback, unverified). → Pin is
  a separate call from edit; if it turns out to notify, the pin can be dropped
  without touching the roster logic.
- **`sendPoll` returning a value changes a live-path signature.** → Callers
  ignore the return except in `run.ts`; the retry taxonomy in `callApi` is not
  touched, and existing `telegram.test.ts` assertions on request bodies must
  remain unchanged to prove that.
- **Offset semantics**: acknowledging updates before they are durably applied
  would lose votes irrecoverably (24h retention). → Apply and save state
  *before* advancing the stored offset; a crash then reprocesses, which is safe
  because R3 replacement is idempotent.
- **R24 (repository must be private) cannot be enforced or verified in code.**
  → Documented in `docs/USAGE.md` and left as an owner action.
