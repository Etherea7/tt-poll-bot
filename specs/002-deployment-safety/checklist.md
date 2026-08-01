---
work: 002-deployment-safety
workflow: debug
status: in-progress
updated: 2026-08-01
links: { spec: specs/002-deployment-safety/spec.md, plan: null, tasks: null }
---

# Debug checklist — deployment-safe delivery and input hardening

Read on entry and resume at the first unchecked step. Append evidence; never
rewrite prior predictions, decisions, or failed results.

## Issue contract

- expected/source: Constitution principles 1-4 and spec 002 R1-R16: no
  automatic duplicate risk, truthful holiday degradation, explicit live mode,
  and a pre-send durable claim.
- actual: global per-kind state duplicates an earlier destination after a later
  destination fails; ambiguous 5xx/fetch failures retry; uncovered holidays
  render a false no-holidays message; malformed flags are accepted; workflow
  persists state only after sending.
- environment/input: Node 24.18.1, npm 10.8.3, Windows PowerShell, commit
  11e14e3dd38182c29dceb031e597c9bd7a5f8197; mocked transports only.
- reproduction: regression tests to be added and committed before production
  edits; no live Telegram request is authorized.

## Worktree

- path: C:/Users/65876/Documents/tt-tele-poll/.worktrees/002-deployment-safety
- branch: debug/002-deployment-safety
- destination: main (protected)
- base commit: 11e14e3dd38182c29dceb031e597c9bd7a5f8197

## Decisions

- 2026-08-01 The owner's approved cleanup list resolves the requirements gate;
  the testable contract is recorded in spec.md and passed the wf-plan
  consistency sweep 8/8.
- 2026-08-01 Use destination aliases rather than hashes because operators must
  be able to identify and recover a blocked destination without exposing its
  Telegram chat ID.
- 2026-08-01 Use a durable pre-send claim keyed to a run identifier; automatic
  recovery from stale/ambiguous claims is intentionally excluded.
- 2026-08-01 Add `--to` destination scoping so an inspected group/kind can be
  force-recovered without reclaiming already-delivered work in another group.
- 2026-08-01 Correct the root-anchored Biome exclusion from `!**/.worktrees` to
  `!.worktrees`; the former ignored every file from inside the required debug
  worktree and made the lint gate vacuous.

## Steps

- [x] Establish expected/actual behavior and safe scope — spec 002 R1-R16; no
  live Telegram requests and no protected-branch mutation.
- [x] Create/verify isolated debug worktree and branch — worktree above is clean
  at the recorded base commit.
- [x] Observe valid reproductions before production edits — `npm test` on the
  unchanged production tree exited 1 with 100 tests, 83 pass and 17 expected
  failures; the added uncovered-holiday test separately exited 1 by rendering
  `[message: holidays] No public holidays in May 2030.` Red oracle persisted as
  commit `3a7f0ae` after a clean equivalent secrets scan.
- [x] Gather independent investigation evidence — two neutral explorers cited
  the state/transport and holiday/config/workflow mechanisms; both independently
  ran the unchanged baseline suite at 87/87.
- [x] Rank causal hypotheses and discriminating experiments — the four
  high-confidence mechanisms below have direct code evidence and deterministic
  regression oracles.
- [x] Resolve through bounded hypothesis loop — attempt 1/3 confirmed and fixed
  all four supported mechanisms; no alternative hypothesis was needed.
- [x] Verify original repro, targeted tests, and regression gates — `npm test`
  97/97, lint 28 files, typecheck, snapshot check, audit, coverage, offline
  preview, and live-source preview all exited 0; no Telegram transport ran.
- [ ] Secrets-scan, commit, and persist truthful hashes
- [ ] Merge under destination policy and verify final tree

## Investigation findings

### Delegation evidence

- neutral brief 1:
  - role: explorer
  - task: independently audit per-destination state, ambiguous retries, and
    post-send Git persistence.
  - required context: AGENTS.md, constitution, delivery/run/telegram/main code,
    tests, workflow, usage, spec 001; read-only; no live calls.
  - return format: observations; candidate causes for/against; discriminating
    experiments; unknowns/risks.
  - done-criteria: evidence for ranked causes and deterministic regression tests.
- neutral brief 2:
  - role: explorer
  - task: independently audit holiday degradation, strict CLI parsing, and
    GitHub Actions deployment readiness.
  - required context: AGENTS.md, constitution, config/holiday/run/main code,
    tests, workflows, docs/specs/package; read-only; no live calls.
  - return format: observations; candidate causes for/against; discriminating
    experiments; unknowns/risks.
  - done-criteria: evidence for tests of coverage, fallback, timeout/quota,
    config rejection, and state-persistence safety.
- structured return 1:
  - observations/citations: `src/delivery.ts:DeliveryRecord` has no destination
    dimension; `src/run.ts:run` records a kind only after every destination;
    `src/telegram.ts:callApi` retries 5xx/generic failures; the workflow pushes
    state only after sending; `saveDeliveryRecord` writes the live file directly.
  - candidate causes: global state deterministically resends an earlier group;
    ambiguous transport outcomes have no durable claim; post-send Git state can
    be lost; direct writes can corrupt recovery state.
  - discriminating experiments: partial-destination and timeout recovery tests,
    per-response retry tests, and prepare-before-send workflow ordering.
  - unknowns/risks: Git cannot atomically couple a Telegram side effect; the
    safe trade-off is a durable pre-send claim and possible missed poll/manual
    recovery.
- structured return 2:
  - observations/citations: `src/holidays.ts:resolveHolidays` never checks the
    snapshot after a valid-but-uncovered live result; live fetches lack timeouts;
    `src/run.ts` overrides delay to zero; `src/config.ts:parseConfig` has no argv
    grammar; workflow write permission spans install and plain push follows send.
  - candidate causes: target coverage collapses into a valid empty month;
    unbounded/burst live calls; positional parsing accepts malformed invocation;
    remote state failure occurs after irreversible delivery.
  - discriminating experiments: target-year live-gap fallback, uncovered-output,
    timeout/quota, argv matrix, and workflow-order assertions.
  - unknowns/risks: actual repository branch protection and Actions write policy
    require an owner-observed GitHub run; schedule timezone syntax is not a defect.
- orchestrator citation validation: all cited symbols and workflow order were
  re-read in this worktree; the targeted state/transport red run below reproduced
  six failures without network access.

| Rank | Hypothesis | Supporting evidence | Contradicting evidence | Confidence | Discriminating experiment |
|---:|---|---|---|---|---|
| 1 | Global delivery state and post-send-only persistence violate the at-most-once contract | Existing code keys only month/kind and workflow pushes after all sends | None observed | high | Regression tests for partial destinations and workflow step ordering |
| 2 | Transport retry taxonomy classifies ambiguous outcomes as safe | 5xx and generic fetch errors enter retry loop | 429 is explicitly non-delivery and remains safely retryable | high | One-response-per-class transport tests |
| 3 | Holiday coverage is checked after empty-holiday payload construction | Uncovered input produces the same empty list as a covered empty month | Friday/Saturday payloads remain valid | high | Uncovered preview assertion plus live-gap/snapshot test |
| 4 | Positional flag parsing lacks a token grammar | A following flag is consumed as a value and unknown flags are ignored | Existing valid cases parse | high | Table-driven invalid argv tests |

## Loop log

- attempt 1/3: hypothesis: the four high-confidence mechanisms above jointly
  explain the deployment-safety defect | prediction: deterministic regression
  tests fail on the base implementation and pass after the smallest cohesive
  state/transport/holiday/config/workflow changes | experiment/change: tests
  added without production edits across delivery, run, Telegram, holiday,
  config, and workflow behaviour | observed result: prediction confirmed;
  combined `npm test` exited 1 (100 tests, 83 pass, 17 fail), and the separate
  uncovered-output oracle also failed exactly on the false holiday message.
- attempt 1/3 outcome after change: confirmed root-cause fix. Full suite exited
  0 (97/97); transport tests issue one call for 5xx/generic/timeout and only
  retry 429; per-alias claim/recovery, snapshot fallback, request timeout/quota,
  strict config, and workflow ordering regressions are green. Coverage is
  95.80% lines, 85.49% branches, 97.40% functions.

## Infrastructure events

- event: installed Bash scanner could not start because WSL2/Virtual Machine
  Platform is unavailable | command/tool: wf-debug `secrets-check.sh` | scoped
  retry: read the script and applied its exact regex classes to staged added
  lines with PowerShell | result: clean; hypothesis count unchanged at 0.

## Handback

- state: implementation and local verification complete; persistence and
  protected-destination integration verification pending.
- exact repro/current result: `npm test` exits 1 on the red oracle; targeted
  uncovered test command is recorded above. Red-oracle commit: `3a7f0ae`.
- attempted hypotheses and findings: attempt 1/3 confirmed; all four causal
  mechanisms resolved without a failed hypothesis.
- supported facts vs inference: code-level findings are supported; workflow
  failure recovery remains to be verified through tests and inspection.
- remaining hypotheses/evidence needed: none locally. GitHub-hosted permissions,
  branch rules, and the real test-group Bot API behaviour require the documented
  owner-observed rollout after merge.
- risks and intentionally unchanged areas: no live group or bot token; main is
  unchanged; no production destination will be configured.
- recommended next experiment or human decision: commit and verify the fix,
  form a clean protected-main integration candidate, then request the exact
  merge decision.
- cleanup/retained state: debug worktree retained while work is in progress;
  Claude's pre-existing locked feature worktree is untouched.
