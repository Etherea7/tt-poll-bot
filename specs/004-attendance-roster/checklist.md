---
work: 004-attendance-roster
workflow: new-feature
status: in-progress
updated: 2026-08-14
links: { spec: spec.md, plan: plan.md, tasks: tasks.md }
---

# Checklist — Attendance roster from Telegram poll votes

Read on entry; resume from the first unchecked step. Every tick carries
evidence (command + observed result, or artifact path). Decisions are appended,
never rewritten.

## Decisions

- 2026-08-13 Direction settled before planning: in-Telegram roster message
  updated in place, fed by a scheduled `getUpdates` job. No hosting, database,
  web page, or Mini App. Rationale and rejected alternatives recorded in
  `docs/ATTENDANCE-DECISION.md`; not re-opened here.
- 2026-08-13 Spec number 004 chosen: `specs/` already holds 000-003
  (evidence: `next-spec-number.sh` → `004`).
- 2026-08-13 Round 1 answers (owner): private repo with committed state;
  monthly job owns the roster message; capture the `sendPoll` result to bind
  poll ID to destination; prune attendance after 60 days.
- 2026-08-14 Round 2 answers (owner): hourly collection; `cmi` stored but not
  displayed; oversized rosters degrade to counts; a failed collection run fails
  the workflow.
- 2026-08-14 Three low-stakes questions defaulted provisionally (Q6 name
  format, Q9 message placement, Q10 stop-updating point), each marked at the
  requirement it governs and justified against the decision rubric in the
  spec's Decisions section.

## Steps

- [x] Step 0 — resume check: no existing `specs/004-attendance-roster/`; new
  work item (evidence: `ls specs/` → 000-bootstrap, 001-monthly-telegram-polls,
  002-deployment-safety, 003-actions-git-auth, INDEX.md).
- [x] Step 1 — frame known vs unknown; draft spec created with R1-R19 and
  Q1-Q11 (evidence: `specs/004-attendance-roster/spec.md`).
- [x] Step 2 — clarification round 1: Q1-Q4 answered by the owner; Q1 exposed a
  contradiction in `docs/ATTENDANCE-DECISION.md`, which had suggested a public
  repository while also committing member names and attendance to Git. Resolved
  to a private repository (spec R23, R24).
- [x] Step 3 — clarification round 2: Q5, Q7, Q8, Q11 answered by the owner;
  Q6, Q9, Q10 adopted as provisional low-stakes defaults.
- [x] Step 4 — requirements rewritten as R1-R29 with AC1-AC26; R24 and R29
  recorded as review-verified rather than test-verified, with the reason stated
  in the spec.
- [x] Step 5 — consistency pass: 8/8 after 5 fixes (evidence:
  `references/consistency-pass.md` checks 1-8 applied to spec.md).
  Findings fixed:
  1. Goal 2 claimed "within one hour of the vote", which an hourly cadence can
     exceed for a vote landing just after a run. Restated as "by the completion
     of the next scheduled collection run".
  2. R21 (oversize degradation) did not say whether it covered R13's
     unresolved-option headings as well as sessions. Scoped to every attendee
     list in the message; AC21 updated to match.
  3. R17 stated editing as a universal while R18 carves out the
     identical-render case. Scoped R17 to "a change to the roster's rendered
     content", and folded the month-end stop into the same requirement.
  4. R11 said "the job's output" while two jobs exist. Named the monthly poll
     job.
  5. R10 said "durably record" without naming a location. Named
     `state/attendance.json` and "before the run exits".
- [x] Step 6 — persist: owner declined a direct commit to protected `main` and
  directed the work to a branch. Committed to `docs/004-attendance-roster`
  (evidence: `git log --oneline` → `a4b1ebb` docs: record attendance roster
  decision and rejected alternatives; `de61194` docs(spec):
  004-attendance-roster -- spec ready, +374 lines across spec.md and
  checklist.md). Secrets scan of the staged content before committing found no
  bot token, numeric chat ID, or credential assignment.

## Implementation phase (wf-feature)

Planning above is complete and its ticks are preserved. Implementation resumes
at the first unchecked step below.

### Worktree

- path: C:/Users/65876/Documents/tt-tele-poll/.worktrees/004-attendance-roster
- branch: feature/004-attendance-roster
- base branch: docs/004-attendance-roster (itself unmerged into protected main)
- base commit: 8822565
- destination: main (protected — merge needs explicit per-merge confirmation)
- verified (evidence: `git rev-parse --show-toplevel` → the path above;
  `git branch --show-current` → `feature/004-attendance-roster`;
  `git status --short --branch` → clean at creation; `npm ci` → exit 0,
  0 vulnerabilities).

### Implementation steps

- [x] F0 — isolation created and verified (evidence above).
- [x] F1 — plan.md and tasks.md written (evidence:
  `specs/004-attendance-roster/plan.md`, `tasks.md`).
- [x] F2 — T1/T2 transport. RED: `node --test test/telegram.test.ts` → exit 1,
  `SyntaxError: The requested module '../src/telegram.ts' does not provide an
  export named 'editMessageText'`. GREEN: same command → 18/18 pass. Regression
  `npm test` → 111/111, `npm run typecheck` → exit 0. Commit `5dda297`.
- [x] F3 — T3/T4 `src/attendance.ts`. RED: `node --test test/attendance.test.ts`
  → `ERR_MODULE_NOT_FOUND ... src/attendance.ts`. GREEN: 19/19 pass. Commit
  `5dda297`.
- [x] F4 — T5/T6 `src/roster.ts`. RED: `ERR_MODULE_NOT_FOUND ... src/roster.ts`.
  GREEN: `node --test test/roster.test.ts` → 10/10 pass. Commit `5dda297`.
- [x] F5 — T7/T8 `src/collect.ts`. RED: `ERR_MODULE_NOT_FOUND ...
  src/collect.ts`. GREEN: `node --test test/collect.test.ts` → 11/11 pass.
  Commit `6a5af21`.
- [x] F6 — T9/T10 `src/run.ts` registration and roster delivery. RED:
  `node --test test/run.test.ts` → 4 new tests failing on behaviour
  (`actual 0, expected 2` registrations and pins). GREEN: 20/20 pass. Commit
  `6a5af21`.
- [x] F7 — T11/T12 collection workflow. RED: `node --test test/workflow.test.ts`
  → `ENOENT ... .github/workflows/attendance.yml`. GREEN: 8/8 pass. Commit
  `2090309`.
- [x] F8 — T13 docs and package script: `docs/USAGE.md` attendance section,
  `AGENTS.md` constraints, `npm run collect`. Commit `2090309`.
- [x] F9 — T14 full gates: `npm test` → 163 passing / 0 failing;
  `npm run typecheck` → exit 0; `npm run lint` → exit 0;
  `npm run snapshot:check` → exit 0 (104 holidays, covers to 2027-12);
  offline preview → renders payloads, `preview only — no Telegram request was
  made.` Secrets scan clean before each of the three commits.
- [x] F9a — self-review of `git diff docs/004-attendance-roster..HEAD` found two
  defects that the tests did not, both fixed in `ca2bd72`:
  1. The shared test `deps` helper passed no `attendancePath`, so `run()` fell
     back to `state/attendance.json` relative to the working directory and the
     suite wrote into the repository — a real `state/attendance.json` had been
     committed in `2090309`.
  2. That committed file had no `messageId` on either roster record, because
     `run()` recorded whatever Telegram returned and `JSON.stringify` drops
     `undefined`. The file then failed `parseAttendanceState` on the next load
     (observed: `invalid attendance state: roster "test|2026-11" has no message
     id`), which would have degraded every later monthly run and failed the
     hourly collection job permanently. Both roster and poll registration now
     require the identifiers they cannot work without.
- [x] F9b — measured the R21 degrade boundary rather than assuming it. Worst
  case the data model allows (4 polls x 12 options x 100-character labels)
  renders to **5792 characters as counts alone**, against Telegram's 4096, so
  R21's guarantee did not hold. `renderRoster` now raises
  `RosterTooLargeError`, and collection attempts each roster independently so
  one unrenderable roster no longer stops other groups updating. Fixed in
  `b51cc6e`.
- [ ] F10 — T15 independent review via `codex:rescue`. First run returned
  without findings (it handed off to a background Codex task); resumed and
  awaiting its output. **Not yet evidence of anything.**
- [x] F11a — merge integration verified without touching the protected branch:
  disposable worktree at `main` (447dacf), `git merge --no-ff --no-commit
  feature/004-attendance-roster` → `Automatic merge went well; stopped before
  committing as requested`, no conflicts. Gates on the integrated tree:
  `npm test` 167 passing, `npm run typecheck` exit 0, `npm run lint` exit 0,
  `npm run snapshot:check` exit 0, secrets scan clean. Merge aborted, worktree
  and branch removed; `main` still at 447dacf.
- [ ] F11 — merge gate: **blocked by design.** Destination `main` is protected
  and the owner is asleep. Requires explicit per-merge confirmation. Note the
  merge would bring both `docs/004-attendance-roster` and this branch, since
  the former is also unmerged.

## Loop log

- round 1/3: Q1-Q4 asked, all four answered, no contradictions between answers.
- round 2/3: Q5, Q7, Q8, Q11 asked, all four answered. Converged; no round 3
  needed.

## Handback — implementation

Not a bailout. The feature is implemented, tested, documented, and committed on
`feature/004-attendance-roster`; the only outstanding action is the merge, which
needs the owner.

**Requires the owner:**

- Merging into protected `main` — explicit per-merge confirmation. The merge was
  verified clean in a disposable worktree (F11a) but never run against `main`.
- **The repository must be private before this is enabled** (R24).
  `state/attendance.json` will hold member names, Telegram user IDs, and
  attendance. Nothing in code can enforce this.

**Never verified against a live Telegram group** — prohibited here, and both
assumptions are load-bearing:

- that editing a pinned message produces no notification (the whole "no spam"
  premise);
- that `poll` and `poll_answer` updates carry `persistent_id` /
  `option_persistent_ids` in practice. If they do not, `applyPollAnswer` raises
  `MissingPersistentIdError` and refuses to guess — collection will fail loudly
  rather than silently misattribute votes, which is the intended failure mode
  but does mean the feature will not work at all until it is corrected.
- Also unverified: that the bot may pin in the target groups. A failed pin is
  reported and non-fatal; the roster still updates.

## Handback — planning phase

Carried forward from planning:

- `docs/004-attendance-roster` is unmerged; merging it into protected `main`
  needs a separate explicit owner confirmation.
- `specs/INDEX.md` is stale: it lists 000-002 and omits both 003 and 004.
  `wf-improve` regenerates it from directory truth; it is never hand-edited.
- Two Telegram behaviours are asserted in `docs/ATTENDANCE-DECISION.md` but not
  yet observed in the test group: that editing a pinned message produces no
  notification, and that `poll` updates carry a populated `persistent_id` on
  the Saturday poll. Confirm both before implementation depends on them.
- Three provisional low-stakes defaults (Q6, Q9, Q10) are marked at their
  requirements and should be skim-audited on review.
- Natural next step: `wf-feature` against `specs/004-attendance-roster/spec.md`.
