---
work: 001-monthly-telegram-polls
workflow: feature
status: in-progress
updated: 2026-08-01
links: { spec: spec.md, plan: plan.md, tasks: tasks.md }
---

# Checklist - monthly Telegram availability polls

> **Reconciliation, 2026-08-01.** This work item's clarification phase finished
> (`workflow: plan`, `status: done`) and implementation then began, so the
> frontmatter now tracks `workflow: feature`. The clarification record below is
> preserved verbatim and is still true; the feature record is appended at the
> end of this file. Nothing from the plan phase was rewritten.

Read on entry; resume from the first unchecked step. Every tick carries
evidence. Decisions are appended, never rewritten.

## Decisions

- 2026-08-01 Official holiday source identified as the MOM-managed consolidated
  dataset on data.gov.sg; Telegram Bot API supports the required monthly option
  counts.
- 2026-08-01 Chronological option ordering and concise English wording adopted
  provisionally as locally reversible presentation defaults.
- 2026-08-01 Q2 resolved as a static allow-list of one or more configured group
  IDs, beginning with a test group; self-service registration remains outside
  v1.
- 2026-08-01 Q3 resolved as non-anonymous, multi-select availability polls.
- 2026-08-01 Q1 resolved as GitHub Actions schedule plus manual dispatch in a
  **private** repository. The private-repository qualifier was added after
  verifying that the documented 60-day inactivity auto-disable for scheduled
  workflows applies to public repositories only - the exact failure mode a
  monthly job in a quiet repository would hit.
- 2026-08-01 Q4 resolved as Node.js 24 LTS with TypeScript. The draft's stated
  cost ("adds a compile/typecheck step") was found obsolete: type stripping is
  stable from Node 24.12, so `.ts` runs directly with no build step. `tsc
  --noEmit` is retained as a CI-only gate.
- 2026-08-01 Q5 **superseded by owner**. Scheduled runs execute on the 25th and
  target the *following* month, not the 1st targeting the current month.
  Rationale: a poll posted on the 1st gives no notice and, when the 1st is
  itself a public holiday, arrives after the date it asks about. Run time 09:17
  `Asia/Singapore` adopted provisionally (locally reversible cron edit).
- 2026-08-01 Q6 resolved: a covered month containing no holidays receives a
  short informational message rather than silence.
- 2026-08-01 Q7 resolved: gazetted plus observed substitute dates, de-duplicated
  against the Friday and Saturday polls.
- 2026-08-01 Q8 **closed as foreclosed**, not answered. Selecting a scheduled
  short-lived job (Q1) means no process exists to receive Telegram updates, so
  outbound-only is the only coherent v1 design. Q8 was never independent of Q1.
- 2026-08-01 Q9 resolved by splitting it: transport retries (429 with
  `retry_after`, pre-response 5xx and connection failures) are required because
  those provably did not deliver; run-level duplicate protection is a durable
  delivery record plus explicit month/scope/force inputs.
- 2026-08-01 Holiday-source failure degrades rather than blocks. The draft's R8
  would have withheld the Friday and Saturday polls - pure arithmetic that
  cannot fail - because a third-party dataset was unreachable.
- 2026-08-01 Three separate polls is forced by the Telegram maximum of 12
  answer options, not chosen for style: a worst-case month yields 5 Fridays +
  5 Saturdays + 3 holidays = 13 candidate dates.
- 2026-08-01 Delivery record tracks poll *kinds* per month, not whole months.
  Raised by the consistency pass - see the Consistency pass section.

## Steps

- [x] Create the planning artifacts. (evidence: `specs/001-monthly-telegram-polls/`
  instantiated on 2026-08-01)
- [x] Frame known facts and sweep open-question categories. (evidence: spec has
  goals, non-goals, draft requirements, and Q1-Q9 across scope, permissions,
  data, failure, integration, quality, and security/privacy)
- [x] Clarification round 1: resolve Q1-Q4. (evidence: Q2 and Q3 resolved
  2026-08-01; Q1 -> GitHub Actions + private repo and Q4 -> Node 24 + TypeScript
  resolved by owner on 2026-08-01 after implications were re-verified against
  primary sources)
- [x] Clarification round 2: resolve Q5-Q9 in no more than four questions.
  (evidence: four questions asked; Q5 superseded by the owner's 25th-of-month
  proposal, Q6/Q7/Q9 answered, Q8 closed as foreclosed by Q1, plus the new
  holiday-failure and snapshot-staleness decisions. Two rounds used of three.)
- [x] Convert all settled decisions into testable requirements and acceptance
  criteria. (evidence: spec.md now carries R1-R33 grouped by concern and
  AC1-AC33, each AC naming the requirement it verifies)
- [x] Run the eight-check consistency pass and fix all findings. (evidence: see
  Consistency pass below; 3 findings, all fixed)
- [x] Persist only the spec/checklist files after a staged secrets scan and
  verify both documentation commits. (evidence: secrets scan clean on the
  staged diff; artifacts committed as `8e5f2bf` covering spec.md, plan.md and
  checklist.md, verified with `git log -1 --stat`; this checklist update
  committed as a follow-up - see Persistence)

## Consistency pass

Run 2026-08-01 against spec.md. Result: **pass after 3 fixes**.

| Check | Result |
|---|---|
| Every goal covered by a requirement | Pass - all six goals map to at least one of R1-R33 |
| Every requirement testable | **Fail -> fixed** (finding 1) |
| Every AC mapped to a requirement | Pass - AC1-AC33 each name a requirement |
| No contradiction between decisions and requirements | **Fail -> fixed** (finding 2) |
| No unquantified vagueness | **Fail -> fixed** (finding 3) |
| No open question silently assumed | Pass - no questions remain open |
| Non-goals fence the scope | Pass - inbound commands and result collection explicitly excluded |
| Provisional defaults justified as low-stakes | Pass - ordering, wording, and run time are all reversible by editing one line |

Findings and fixes:

1. **Untestable requirement.** The draft's AC10 asserted that an unconfigured
   group "cannot register itself as a destination". In an outbound-only design
   no code path receives Telegram updates, so nothing exists to exercise - the
   criterion tested an absence. Replaced with R13/AC13, a positive invariant a
   test can actually fail: no code path derives a destination from a Telegram
   response.
2. **Contradiction between R15 and the delivery record.** R15 degrades a run
   (send Friday and Saturday polls, skip holidays, exit non-zero) while the
   original R22 recorded a month only on *full* success. A degraded run would
   therefore record nothing, and the operator's recovery re-run would duplicate
   the two polls that had already landed. Fixed by tracking delivery per poll
   kind (R18-R23), which makes recovery self-healing with no flags to remember.
3. **Unquantified vagueness.** R14 fell back to the snapshot when the live
   fetch "returns unusable data". Quantified as non-2xx status, exceeding a
   bounded attempt budget, or failing schema validation.

## Verification log

External claims were re-checked against primary sources rather than carried
over from the draft. Four were wrong:

| Claim in draft | Source checked | Outcome |
|---|---|---|
| One-option polls may not be supported | Bot API changelog | **Wrong** - minimum is 1 since Bot API 7.0 (2023-12-29); maximum is 12 since 9.1 (2025-07-03) |
| Scheduled workflows "may be delayed" (only risk noted) | GitHub Actions docs | **Incomplete** - also auto-disabled after 60 days inactivity, public repositories only |
| Cron must be expressed in UTC | GitHub Actions changelog, March 2026 | **Wrong** - IANA `timezone:` is now supported alongside `cron:` |
| TypeScript "adds a compile/typecheck step" | nodejs.org/api/typescript.html | **Wrong** - type stripping stable from Node 24.12; no build step, typecheck only |
| Holiday data is a simple fetch | data.gov.sg developer guide | **Incomplete** - two-step `initiate-download` then poll `poll-download` for a signed CSV URL, ~5 req/min unauthenticated |
| Dataset coverage | data.gov.sg dataset page | Confirmed - consolidated dataset covers 2020-01 to 2027-12, refreshed around Q3 annually |

## Loop log

- No convergence failures. Two clarification rounds used of a maximum of three.

## Persistence

- Secrets scan run against the staged diff before committing; no token, chat
  identifier, or credential present. The artifacts are documentation only.
- `8e5f2bf` - docs(spec): 001-monthly-telegram-polls - spec ready. Contains
  spec.md, plan.md, checklist.md and nothing else (verified with
  `git log -1 --stat`). This is the repository's initial commit.
- A follow-up commit records this checklist's own persistence evidence, so the
  committed checklist is truthful to a cold reader who reads git rather than
  the working tree.
- No branch was created: `wf-plan` produces documents only, and branch and
  worktree creation belongs to the implementation workflows.

## Handback

- state: **complete**. Spec is `status: ready` with no open questions and no
  parked consequential decisions.
- provisional defaults the owner may want to skim-audit: chronological option
  ordering; concise English wording with ISO month context; 09:17
  `Asia/Singapore` run time on the 25th. Each is reversible by editing one line
  and none is depended on by a requirement.
- known follow-ups for implementation, already captured in plan.md: confirm the
  `timezone:` cron key is accepted when the workflow is first committed (UTC
  fallback documented); avoid `enum`, `namespace` with runtime code, parameter
  properties, and decorators under Node type stripping.
- suggested next step for the human: run `wf-setup` to bootstrap the Node 24 +
  TypeScript scaffold and verified dev loop, then `wf-feature` against this spec
  following the implementation sequence in plan.md.

---

# Feature implementation record

## Isolation

- worktree: `C:\Users\65876\Documents\tt-tele-poll\.claude\worktrees\feature+001-monthly-telegram-polls`
- branch: `feature/001-monthly-telegram-polls`
- base branch: `main`, base commit: `07bf4cf`
- BAILOUT_N: 3

The native worktree facility places worktrees under `.claude/worktrees/`
rather than the `.worktrees/` path named in the skill. The branch was renamed
from the generated `worktree-feature+001-...` to `feature/001-...` to match the
workflow contract, and `.claude/worktrees/` was added to the tracked
`.gitignore` as part of this feature so the destination checkout stays clean.

## Scope of this increment

Pure domain logic only: target-month resolution, Saturday derivation, option
rendering, and the poll builder. No network, no filesystem, no Telegram. The
builder receives holiday dates as an argument so it does not depend on the
holiday source. Deferred work is listed explicitly in `tasks.md`.

## Gates

- [x] T1 red observed, then green: target-month resolution (AC1, AC2, AC3).
  Red 2026-08-01T11:26:40Z — 9 failures, all `Error: not implemented`.
  Green 11:27:33Z — 12/12.
- [x] T2 red observed, then green: Saturday derivation (AC5). Same red/green
  runs as T1.
- [x] T3 red observed, then green: option rendering (AC35, AC36).
  Red 2026-08-01T11:28:53Z — 14 failures, 13 `Error: not implemented` plus the
  overflow test correctly rejecting the stub's error. Green 11:29:58Z.
- [x] T4 red observed, then green: poll builder (AC7-AC10, AC16, AC34, AC37-AC39).
  Same red/green runs as T3.
- [x] Full regression suite green — `npm test` exit 0, tests 26 / pass 26 /
  fail 0, observed 2026-08-01T11:29:58Z and again after formatting.
- [x] Lint and typecheck green — `npm run lint` exit 0 ("Checked 12 files, no
  fixes applied"); `npm run typecheck` exit 0. Lint reached green on attempt 2;
  see Feature loop log.
- [x] Preview verified — `node src/main.ts --preview --month 2026-09 --holidays
  2026-09-15` exit 0, rendering all three polls with the agreed questions and
  option formats. The R41 guard was exercised live: five Saturdays with three
  slots exited 1 with "needs 15 options, exceeding the Telegram maximum of 12".
- [x] Docs updated — `docs/USAGE.md` covers preview invocation, what gets
  posted, the slot ceiling and its arithmetic, and what is not built yet.
- [x] Secrets scan and feature commit verified — `secrets-check: clean`;
  commit `1eeae2d`, 13 files changed, 771 insertions, verified with
  `git log -1 --stat`.
- [x] Pre-merge verification on a clean checkout — `git merge --no-ff
  --no-commit` formed on a disposable worktree at `main`, never in the
  protected checkout. Secrets scan on the merged staged diff: clean. This
  surfaced a real defect; see Feature loop log attempt 3.
- [x] Fresh-checkout gates green, 2026-08-01T11:34:54Z — a detached worktree at
  the feature branch (simulating a post-merge clone) ran `npm ci`, then
  `npm test` exit 0 (26/26), `npm run lint` exit 0, `npm run typecheck` exit 0,
  and preview exit 0.
- [ ] Merge gate: explicit owner confirmation for the protected destination

## Feature loop log

- **Attempt 1 — weak oracle caught during red.** `resolveTargetMonth rejects a
  malformed override` passed against a stub that throws unconditionally,
  because `assert.throws` with no matcher is satisfied by any error. It would
  have kept passing with the validation deleted. Strengthened to assert the
  exact message for three distinct malformed inputs, so it can only pass for
  the right reason.
- **Attempt 2 — lint gate.** Prediction: lint would pass after implementation.
  Observed: exit 1, six formatter-only errors, one per newly written file.
  Change: `biome check --write`. Result: exit 0; the diff was purely
  cosmetic line-collapsing, and tests plus typecheck were re-run green
  afterwards to confirm no assertion changed.

- **Attempt 3 — CRLF defect found by pre-merge verification.** Prediction: the
  gates green in the feature worktree would be green on the merged tree.
  Observed: `npm run lint` exit 1 on a clean checkout, with every file reported
  as needing reformatting and `␍` visible in the diff. Diagnosis: Git converts
  LF to CRLF on checkout under Windows autocrlf, so the authoring worktree
  (files written with LF) passed while any fresh clone failed — and a Linux CI
  runner would have passed while a Windows clone failed, hiding the defect from
  whoever introduced it. Change: added `.gitattributes` with `* text=auto
  eol=lf` and ran `git add --renormalize .`, which confirmed the committed
  blobs were already LF. Result: a fresh detached checkout of the feature
  branch passes lint, tests, typecheck and preview, all exit 0. Committed as
  `dcf0c7d`.

  This is why the verification forms the merge on a clean checkout rather than
  trusting the worktree the code was written in.

- **Attempt 4 — nested worktree broke lint on the destination.** Prediction:
  gates green on a fresh checkout would be green on merged `main`. Observed:
  `npm run lint` exit 1 on `main` while tests and typecheck passed. First
  hypothesis (residual CRLF in the pre-existing checkout) was tested by forcing
  a re-checkout with `git rm --cached -r . && git reset --hard`; lint still
  failed, so the hypothesis was wrong. Inspecting the actual failing path
  showed Biome was linting the feature worktree nested at
  `.claude/worktrees/`, including its own `node_modules` and config copies. The
  excludes listed `.worktrees` — the path raw `git worktree` uses — but this
  session's native facility places worktrees under `.claude/worktrees/`, and
  `vcs.enabled` was `false`, so gitignoring the path did not help because Biome
  was not reading `.gitignore`. Change: enable `vcs.useIgnoreFile` and add an
  explicit `!**/.claude` exclude. Result: lint exit 0, "Checked 12 files"
  rather than the whole nested tree. Committed as `4dc7877`.

## Increment 2 — holiday source and snapshot (T5, T6)

- [x] T5 red observed 2026-08-01T12:26:11Z (14 failures, all traceable to
  `not implemented`), green 12:27:08Z (40/40).
- [x] T6 red observed 2026-08-01T12:27:53Z (8 failures: 7 `not implemented`
  plus the deliberately absent `data/holidays.json`), green 12:29:03Z (48/48).
- [x] Snapshot generated from the live source: `npm run snapshot:refresh` →
  104 holidays covering 2020-2027, 7.6 KB.
- [x] `npm run snapshot:check` exit 0 — "covers to 2027-12 (needs 2027-02)".
- [x] All gates green 2026-08-01T12:30:54Z — tests 48/48, lint, typecheck,
  snapshot:check, preview, all exit 0.
- [x] Exit codes verified individually against the spec: offline fallback 0,
  uncovered year 1 (R15), covered-but-empty month 0 (R16), non-preview 2.
- [x] Docs updated — `docs/USAGE.md` gains the holiday source, the
  never-derive-observed-days rule, snapshot commands, and an exit-code table;
  `AGENTS.md` gains the same constraints so future agents do not re-derive them.
- [x] Secrets scan clean; commit `11feb88`, 12 files, 1133 insertions.

### Increment 2 decisions

- 2026-08-01 **Observed holidays are taken from the dataset, never derived.**
  Probing the live source before designing showed MOM marks them `(Observed)`
  as their own rows. Critically, the substitute is not always the following
  Monday: `2022-05-03,Tuesday,Labour Day (Observed)` — Labour Day fell on
  Sunday 1 May and Monday 2 May was already Hari Raya Puasa. A derived
  "Sunday → next Monday" rule would have produced a wrong date roughly once
  every few years, in a way no unit test written against the rule would catch.
  That row is now a regression fixture.
- 2026-08-01 Snapshot keeps all years the source publishes (2020 onward) rather
  than only future ones. It is 7.6 KB, and a straight copy has no transformation
  step that can go wrong at refresh time.
- 2026-08-01 Snapshot shape is trimmed to `{date, name}` per owner decision;
  the dataset's `day` column is derivable and was dropped.

### Increment 2 loop log

- **Attempt 5 — Biome ignore pattern made the lint gate vacuous.** Prediction:
  the `!**/.claude` exclude added in `4dc7877` was safe. Observed: running lint
  from inside the feature worktree reported "Checked 0 files" and exit 1,
  because the worktree's own absolute path lives under `.claude/worktrees/` and
  matched the pattern. Had Biome not errored on an empty file set, this would
  have been a gate that silently verified nothing. Change: narrowed the pattern
  to `!.claude` so it anchors at the project root. Result verified in **both**
  contexts — 19 files checked from inside the worktree, 12 from the repository
  root with the nested tree still excluded.

## Increment 3 — Telegram client, delivery record, coordinator, workflows (T7-T10)

- [x] T7/T8 red observed 2026-08-01T12:36:40Z (22 failures, all
  `not implemented`), green 12:38:03Z (72/72).
- [x] T9 red observed 2026-08-01T12:39:10Z (14 failures), green 12:40:42Z
  (87/87).
- [x] T10 workflows written: `monthly-polls.yml` (cron `17 9 25 * *` with
  `timezone: Asia/Singapore`, `workflow_dispatch` with month/preview/only/force,
  `permissions: contents: write`, concurrency group) and `ci.yml` (tests, lint,
  typecheck, snapshot freshness).
- [x] All gates green — tests 87/87, lint, typecheck, snapshot:check, all exit 0.
- [x] End-to-end through the real entry point: `node src/main.ts --preview
  --month 2026-11` rendered all three polls with live holiday data, exit 0.

### Increment 3 decisions

- 2026-08-01 `manual dispatch defaults preview to true`. An accidental click on
  "Run workflow" must not post to a live group.
- 2026-08-01 Workflow inputs are passed through the **environment**, never
  interpolated into the `run:` script. `${{ inputs.month }}` inlined into a
  shell command would let a crafted input execute as shell.
- 2026-08-01 The delivery record is committed with `if: always()`, so kinds
  that did land are recorded even when a later kind failed. Without this, the
  recovery re-run would duplicate the polls that succeeded.
- 2026-08-01 `RunDeps` separates `holidayFetchImpl` from the Telegram
  transport. Sharing one `fetch` would make "no Telegram request was issued"
  untestable, because holiday resolution also uses the network.
- 2026-08-01 The token is optional in preview mode. Requiring a secret to
  render text would discourage using the one mode that cannot post.

### Increment 3 loop log

- **Attempt 6 — typecheck caught what the tests could not.** Prediction: green
  tests meant the increment was done. Observed: `npm test` exit 0 but
  `npm run typecheck` exit 1 — `test/delivery.test.ts` used `as const`,
  producing a `readonly` tuple that is not assignable to the mutable
  `DeliveryRecord` index signature. The test runner strips types and never saw
  it. Change: dropped the `as const`. Result: typecheck exit 0, tests still
  87/87. This is the case for keeping `tsc --noEmit` as a separate gate even
  though nothing compiles the code.

## Merge record

- merge commit: `28ce65f` — `feature/001-monthly-telegram-polls` into `main`
  with `--no-ff`, after explicit owner confirmation for this exact merge.
- follow-up fix on `main`: `4dc7877` (lint scope, see loop log attempt 4).
- destination gates verified on the merged tree at 2026-08-01T12:15:50Z:
  `npm test` exit 0 (26/26), `npm run lint` exit 0, `npm run typecheck` exit 0,
  preview exit 0.
- pushed: `origin/main` at `4dc7877`, confirmed with `git ls-remote`.

## Feature handback

- state: **increment complete and merged**
- scope delivered: R1-R3, R5, R7-R10, R16, R34-R41 (pure domain layer),
  merged to `main` and pushed
- scope explicitly deferred: holiday source, snapshot staleness check, delivery
  record, Telegram client, coordinator, GitHub Actions workflow — T5-T10 in
  `tasks.md`. Nothing can post to Telegram yet; a non-preview run exits 2.
- next action: T5 and T6 — the data.gov.sg holiday source, committed snapshot
  fallback, and the CI staleness check (R6, R14, R15, R17)
