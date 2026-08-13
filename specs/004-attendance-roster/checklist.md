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
- [ ] F2 — T1/T2 transport: `sendPoll` returns `Message`; `getUpdates`,
  `editMessageText`, `pinChatMessage` added.
- [ ] F3 — T3/T4 `src/attendance.ts` state and vote application.
- [ ] F4 — T5/T6 `src/roster.ts` projection and rendering.
- [ ] F5 — T7/T8 `src/collect.ts` collection orchestration.
- [ ] F6 — T9/T10 `src/run.ts` registration and roster delivery.
- [ ] F7 — T11/T12 collection workflow.
- [ ] F8 — T13 docs and package script.
- [ ] F9 — T14 full gates green (`npm test`, `npm run typecheck`,
  `npm run lint`) and diff reviewed.
- [ ] F10 — T15 independent review via `codex:rescue`, then commit.
- [ ] F11 — merge gate: blocked by design; destination `main` is protected and
  the owner is unavailable.

## Loop log

- round 1/3: Q1-Q4 asked, all four answered, no contradictions between answers.
- round 2/3: Q5, Q7, Q8, Q11 asked, all four answered. Converged; no round 3
  needed.

## Handback

Not a bailout — planning completed and persisted. Carried forward for whoever
picks this up:

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
