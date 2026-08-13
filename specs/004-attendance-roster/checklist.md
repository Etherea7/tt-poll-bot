---
work: 004-attendance-roster
workflow: plan
status: awaiting-human
updated: 2026-08-14
links: { spec: spec.md, plan: null, tasks: null }
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
- [ ] Step 6 — persist: commit `specs/004-attendance-roster/` and
  `docs/ATTENDANCE-DECISION.md`. **Blocked pending owner confirmation:** the
  session is on protected branch `main`, and both `AGENTS.md` and the project
  constitution require explicit owner confirmation for each exact
  protected-branch action. Nothing has been committed.

## Loop log

- round 1/3: Q1-Q4 asked, all four answered, no contradictions between answers.
- round 2/3: Q5, Q7, Q8, Q11 asked, all four answered. Converged; no round 3
  needed.

## Handback

- state: spec is complete and passes the consistency pass; `status: ready` in
  `spec.md`. The only outstanding item is the commit.
- blocker: committing to protected `main` needs explicit per-action owner
  confirmation. The working tree holds `specs/004-attendance-roster/spec.md`,
  `specs/004-attendance-roster/checklist.md`, and `docs/ATTENDANCE-DECISION.md`
  uncommitted, plus the deletion of the untracked, superseded
  `docs/ATTENDANCE-FEATURE-OPTIONS.md`.
- suggested next step for the human: either confirm a docs-only commit to
  `main`, or ask for a `docs/004-attendance-roster` branch instead. After that,
  `wf-feature` can implement the spec, and `wf-improve` should regenerate
  `specs/INDEX.md`, which is currently stale (it lists 000-002 and omits 003
  and 004).
