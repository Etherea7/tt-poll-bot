---
work: 003-actions-git-auth
workflow: debug
status: in-progress
updated: 2026-08-02
links: { spec: null, plan: null, tasks: null }
---

# Debug checklist — GitHub Actions state-push authentication

Read on entry and resume at the first unchecked step. Append evidence; never
rewrite prior predictions, decisions, or failed results.

## Issue contract

- expected/source: `docs/USAGE.md` and the monthly workflow require the prepared
  claim commit to reach the default branch before Telegram delivery begins.
- actual: the live workflow creates local commit `b278bd8`, then
  `git fetch origin "$GITHUB_REF_NAME"` exits 128 with `fatal: could not read
  Username for 'https://github.com': No such device or address`.
- environment/input: GitHub-hosted Ubuntu runner, manual live dispatch,
  `actions/checkout@v6` with `persist-credentials: false`, masked
  `GITHUB_TOKEN` present, workflow commit
  `2c06ce844f108f38d77f4e6d9f083188cf5e9772`.
- reproduction: observed Actions shell log above; deterministic local oracle is
  `node --test test/workflow.test.ts` after adding an ordering assertion that
  every state-push block configures its GitHub auth header before `git fetch`.

## Worktree

- path: C:/Users/65876/Documents/tt-tele-poll/.worktrees/003-actions-git-auth
- branch: debug/003-actions-git-auth
- destination: main (protected)
- base commit: 2c06ce844f108f38d77f4e6d9f083188cf5e9772

## Decisions

- 2026-08-02 Repair is authorized; local tests and Git integration checks are
  in scope, but no Telegram request or workflow dispatch is authorized.
- 2026-08-02 Preserve `persist-credentials: false` so dependency lifecycle code
  does not inherit a write credential; scope authentication to the two state
  persistence steps.
- 2026-08-02 The failed claim commit existed only in the ephemeral runner. Fetch
  failed before rebase/push, the send step was skipped, and no force recovery is
  required for the later manual retry.

## Steps

- [x] Establish expected/actual behavior and safe scope — exact failing log and
  exit 128 supplied; no live reproduction is needed or safe.
- [x] Create/verify isolated debug worktree and branch — registered, clean,
  ignored worktree at the recorded base.
- [x] Observe and persist a valid reproduction before production edits —
  `node --test test/workflow.test.ts` exited 1 with 2 pass/1 fail; the new test
  failed exactly on `Push prepared delivery claims must authenticate before
  fetching` while existing workflow tests stayed green. Red oracle commit:
  `8a80e0556d3a591fe5183e6ce8e6f01542dcb6db`.
- [x] Gather independent investigation evidence — two neutral read-only audits
  independently identified the same command-ordering mechanism and state result.
- [x] Rank causal hypotheses and discriminating experiments
- [x] Resolve through bounded hypothesis loop — attempt 1/3 confirmed; only the
  existing auth setup moved before fetch in both state-push blocks.
- [x] Verify original repro, targeted tests, and regression gates — targeted
  workflow test 3/3, full suite 98/98, lint 28 files, typecheck, and snapshot
  coverage check all exited 0.
- [ ] Secrets-scan, commit, and persist truthful hashes
- [ ] Merge under destination policy and verify final tree

## Investigation findings

### Delegation evidence

- neutral brief 1:
  - role: explorer
  - task: independently diagnose the Git authentication failure and smallest
    safe correction.
  - required context: workflow, workflow tests, usage docs, exact exit-128 log,
    `persist-credentials: false`, masked token present; read-only, no Actions,
    Git push, Telegram call, or edits.
  - return format: execution order, auth mechanism, evidence for/against causes,
    smallest correction, test impact, and risks.
  - done-criteria: explain why fetch fails despite a present token and whether
    the later push authentication is otherwise sufficient.
- structured return 1:
  - observations/citations: both workflow blocks commit state, call unauthenticated
    `git fetch`, and only then configure the URL-scoped Basic auth extraheader;
    checkout explicitly opts out of persisted credentials.
  - candidate causes and supporting/contradicting evidence: auth ordering fully
    predicts the noninteractive username failure; a missing token is contradicted
    by the masked environment, and insufficient write permission would not
    explain an unauthenticated fetch prompt.
  - discriminating experiments: require extraheader configuration to precede
    fetch twice, then run the existing workflow ordering test.
  - unknowns/risks: later branch-policy rejection or rebase conflict is possible
    but distinct from this observed failure.
- neutral brief 2:
  - role: explorer
  - task: independently audit delivery-state and safe-retry consequences of the
    failed pre-send Git operation.
  - required context: workflow, delivery/run code, tests, docs, local-only state
    commit followed by failed fetch; read-only and no external mutations.
  - return format: step gating, Telegram contact, state consequences, retry
    inputs, duplicate risk, and unknowns.
  - done-criteria: determine whether retrying after the fix risks duplicates or
    stale claims.
- structured return 2:
  - observations/citations: prepare precedes claim push, which precedes live;
    the fetch failure aborts before push and live, while the final state step
    sees a clean already-committed state path and cannot publish it.
  - candidate causes and supporting/contradicting evidence: the claim remained
    runner-local; no Telegram request and no durable claim resulted.
  - discriminating experiments: inspect remote state before retry; absent an
    independent claim, retry the same scope with `force=false`.
  - unknowns/risks: only an unrelated run could have created remote state for
    the same scope.
- orchestrator citation validation: re-read `.github/workflows/monthly-polls.yml`,
  `test/workflow.test.ts`, `src/run.ts`, and the supplied log. Both cited command
  orders and the prepare/push/live gating match the repository at the base hash.

| Rank | Hypothesis | Supporting evidence | Contradicting evidence | Confidence | Discriminating experiment |
|---:|---|---|---|---|---|
| 1 | Git auth is configured after the first network command | Exact workflow order and username prompt with persisted credentials disabled | None | high | Static test requires auth-before-fetch in both blocks; reorder only those lines |
| 2 | `GITHUB_TOKEN` lacks write permission | Push needs write access | Fetch failed before push; workflow requests `contents: write` | low | After ordering fix, an authorization failure would be an HTTP 403 at push |
| 3 | Remote branch policy blocks state commits | Direct state pushes could be restricted | Failure is credential prompting during fetch, not policy rejection | low | Integrated workflow run after merge reaches authenticated fetch/push |

## Loop log

- attempt 1/3: hypothesis: auth-after-fetch is the root cause | prediction:
  a two-block ordering oracle fails on the base tree, then passes when only the
  existing auth setup moves before fetch in each block; all other workflow and
  repository gates remain green | experiment/change: add the deterministic
  oracle in `test/workflow.test.ts`, preserve it as a red commit, then change
  `.github/workflows/monthly-polls.yml` only.
- attempt 1/3 red observation: prediction confirmed on the unchanged workflow;
  targeted command exited 1 with 2/3 passing and the sole failure at the first
  state-push block's auth-before-fetch assertion.
- attempt 1/3 green observation: after moving the four existing auth lines
  before fetch in each block, the exact oracle exited 0 (3/3). Full `npm test`
  exited 0 (98/98), `npm run lint` checked 28 files, `npm run typecheck` exited
  0, and `npm run snapshot:check` confirmed 104 holidays through 2027-12.

## Infrastructure events

- none.

## Handback

- state: implementation verified locally; commit and protected integration gate
  remain.
- exact repro/current result: external exit-128 reproduction is preserved above;
  deterministic local oracle at `8a80e05` exits 1 with the expected ordering
  failure after commit verification.
- attempted hypotheses and findings: attempt 1/3 confirmed; auth-after-fetch was
  the root cause and the smallest two-block reorder turns the oracle green.
- supported facts vs inference: command order and failed operation are facts;
  the repaired hosted run remains to be owner-observed after merge.
- remaining hypotheses/evidence needed: none locally; the hosted live workflow
  must be owner-observed after protected-main integration.
- risks and intentionally unchanged areas: no bot token, group ID, delivery
  state, or Telegram transport will be accessed by this repair.
- recommended next experiment or human decision: commit and validate an exact
  protected-main integration candidate, then request merge approval.
- cleanup/retained state: debug worktree retained while in progress; existing
  record/002 and Claude-locked feature worktrees remain untouched.
