---
work: 000-bootstrap
workflow: project-setup
status: done
updated: 2026-08-01
links: { spec: spec.md, plan: plan.md, tasks: tasks.md }
---

# Checklist — bootstrap tt-tele-poll

Read on entry; resume from the first unchecked step. Ticks require observed
evidence. Decisions and attempts are appended, never rewritten.

## Identity

- absolute target: `C:\Users\65876\Documents\tt-tele-poll`
- branch: `setup/000-bootstrap`
- starting state: existing Git repository on `main` with two docs-only commits
  (`8e5f2bf`, `78bc6c0`) from the `wf-plan` run for `001-monthly-telegram-polls`.
  Not a greenfield directory; the bootstrap branch was created from `main` so
  that history is preserved rather than orphaned.
- preserved paths: `specs/001-monthly-telegram-polls/{spec,plan,checklist}.md`
  — inventoried before any write and not modified by this bootstrap.
- BAILOUT_N: 3

## Decisions

- 2026-08-01 Runtime is Node.js 24 LTS. Verified locally as **v24.18.1**, which
  is at or past 24.12 where TypeScript type stripping became *stable* rather
  than experimental. This is what allows the project to run `.ts` directly with
  no build step, no bundler, and no `dist/`.
- 2026-08-01 Test runner is the built-in `node:test` with `node:assert/strict`.
  Empirically verified before adoption: `node --test` discovers and executes a
  `.ts` test file under type stripping with no flags and no extra tooling.
  Chosen over Vitest/Jest because it adds zero dependencies and cannot drift
  from the runtime the product actually uses.
- 2026-08-01 Package manager is npm 10.8.3 (bundled with Node 24). No
  alternative manager is introduced for a project with zero runtime
  dependencies.
- 2026-08-01 Lint and format is Biome (owner choice; labelled reversible — it
  is one dev dependency plus one config file, and replacing it touches no
  product code).
- 2026-08-01 No web framework and no Telegram framework. The product is an
  outbound-only scheduled job; `fetch` is built in. Recorded in
  `specs/001-monthly-telegram-polls/plan.md` as decision Q4.
- 2026-08-01 Build/package gate is **N/A**: type stripping means there is no
  compile or bundle step to run. `tsc --noEmit` is retained as a typecheck gate
  only, and never emits artifacts.
- 2026-08-01 Readiness-probe gate is **N/A**: the product is a batch CLI that
  runs to completion and exits. There is no long-running process to probe. The
  run gate instead executes the CLI and observes its output and exit status.
- 2026-08-01 First observable outcome for the bootstrap loop is Friday
  derivation for a target month (`AC4` of spec 001). Chosen because it is a
  pure function with no I/O, no time zone, and no configuration, so a red-green
  cycle proves the loop without pre-empting design decisions that belong to
  `wf-feature`.

## Steps

- [x] Target inventory and Git-parent discovery recorded. (evidence: `find`
  inventory showed only `specs/001-monthly-telegram-polls/` present; `git
  branch --show-current` = `main`, clean tree, 2 commits; branch
  `setup/000-bootstrap` created from `main`)
- [x] Requirements, non-goals, stack, and exact commands resolved. (evidence:
  Decisions above; runtime and test runner verified empirically before
  adoption, not assumed)
- [x] Project rules, constitution, spec, plan, tasks, and INDEX instantiated
  with no unresolved markers. (evidence: `AGENTS.md`, `CLAUDE.md`,
  `docs/CONSTITUTION.md`, `specs/000-bootstrap/{spec,plan,tasks}.md`,
  `specs/INDEX.md` written; structural checker result recorded below)
- [x] Scaffold created without overwriting an inventoried path. (evidence:
  `package.json`, `tsconfig.json`, `biome.json`, `.nvmrc`, `src/calendar.ts`,
  `test/calendar.test.ts` created by a delegated implementer; orchestrator
  independently read each file and confirmed `git diff --stat` shows no change
  to any preserved path. One defect found and corrected in review — see Loop
  log attempt 1.)

## Development-loop gates — all required before any commit

All commands run from `C:\Users\65876\Documents\tt-tele-poll` on
`setup/000-bootstrap`, Node v24.18.1 / npm 10.8.3. Each gate below carries the
timestamp of the final evidence pass, run consecutively between
**2026-08-01T11:03:37Z** and **11:03:42Z**. Earlier identical runs during
development produced the same results.

- [x] First-outcome red: `npm test` — exit 1; observed 2026-08-01T11:03:37Z; output: tests 2 / pass 0 / fail 2, both `Error: not implemented` raised at `src/calendar.ts` via `test/calendar.test.ts`. Valid red: the module resolved, imported and executed, so the failure is missing behaviour rather than a syntax, fixture, or dependency problem. Reproduced deliberately at this timestamp by restoring the unimplemented stub, then restoring the implementation byte-identically (`diff` confirmed).
- [x] Install/restore: `npm ci` — exit 0; observed 2026-08-01T11:03:38Z; output: added 6 packages, audited 7 packages, found 0 vulnerabilities. The very first install was necessarily `npm install` because no lockfile existed; `npm ci` was then verified against the generated `package-lock.json`, so the command recorded in `AGENTS.md` is the one actually observed.
- [x] Tests: `npm test` — exit 0; observed 2026-08-01T11:03:39Z; output: tests 2 / pass 2 / fail 0.
- [x] Lint/format: `npm run lint` — exit 0; observed 2026-08-01T11:03:40Z; output: Checked 6 files in 9ms, no fixes applied, zero errors and zero info. Reached on attempt 2; see Loop log.
- [x] Typecheck: `npm run typecheck` — exit 0; observed 2026-08-01T11:03:41Z; output: `tsc --noEmit` completed with no diagnostics under TypeScript 7.0.2.
- [x] Build/package: N/A: Node executes .ts directly via stable type stripping, so no compile, bundle, or emit step exists. `tsc` is configured `noEmit` and is a typechecker only. Justified by the stack, not skipped for convenience.
- [x] Run: `npm run preview` — exit 0; observed 2026-08-01T11:03:42Z; output: printed "preview — target month 2026-08" and the four August 2026 Fridays (07, 14, 21, 28). Separately, `node src/main.ts --preview --month 2026-09` printed the four September Fridays (04, 11, 18, 25) at exit 0, and a non-preview invocation refused and exited 2 as designed. Every run confirmed "no Telegram request was made".
- [x] Readiness: N/A: batch CLI that runs to completion and exits, so no process stays alive to probe. No process was started, so no cleanup was required.
- [x] AC6 verified: `src/__erasable_probe.ts` containing `export enum Bad`
  failed `npm run typecheck` with `error TS1294: This syntax is not allowed
  when 'erasableSyntaxOnly' is enabled` (exit 1), and Node also refused it at
  runtime. Probe file deleted; `src/` contains only `calendar.ts` and
  `main.ts`.
- [x] Structural checker, staged diff, and secrets scan pass. — evidence:
  `check-bootstrap.mjs` "PASS (9 files checked)" exit 0; `git diff --cached
  --check` clean; 17 files staged with `node_modules/` correctly excluded and
  `package-lock.json` correctly included; vendored `secrets-check.sh` reported
  "secrets-check: clean" exit 0. The commit-readiness preflight left exactly
  one refusal, recorded below as a deviation.
- [x] Initial commit verified — hash: `fb9f6da` (full:
  `fb9f6daf6404437007f3a980d58378239d809ff3`), verified with `git log -1
  --stat`: 17 files changed, 1407 insertions, on `setup/000-bootstrap`.
- [x] Completion truth prepared: initial hash recorded above; tasks T1-T25 and
  AC1-AC6 ticked with evidence; spec, checklist and INDEX statuses set to
  `done`; INDEX attention text updated. Committed separately from `fb9f6da`;
  that truth commit's own hash is reported in the handback to the owner, since
  a commit cannot contain its own hash.
- [x] Protected default-branch action explicitly confirmed and verified, or
  handoff records that it remains unperformed. — **It remains unperformed.**
  `main` still points at `78bc6c0` and was neither created, updated, nor merged
  into. Merging `setup/000-bootstrap` into `main` requires explicit per-merge
  owner confirmation and has not been requested.

## Loop log

Two corrections were needed. Neither consumed a BAILOUT attempt against the
same failing goal, and no goal failed more than once.

- **Attempt 1 — delegated scaffold review (defect found, corrected).**
  Prediction: the implementer's `package.json` would be usable as returned.
  Observed: it pinned `@types/node: ^26.1.2`. That is the `latest` dist-tag,
  but `@types/node` major versions track *Node* major versions, and this
  project targets Node 24. Node 26 types would let code typecheck against APIs
  absent at runtime — a typecheck gate that reports green and then fails
  unattended on the 25th of a month. Change: pinned `^24.13.3`, confirmed
  published via `npm view`. Result: `npm ls` shows `@types/node@24.13.3`;
  typecheck exit 0. The other two versions the implementer chose
  (`typescript@7.0.2`, `@biomejs/biome@2.5.6`) were verified as correct stable
  `latest` releases and kept.

- **Attempt 2 — lint gate.** Prediction: `npm run lint` would pass first time.
  Observed: exit 1 from an import-ordering error in `test/calendar.test.ts`,
  plus a deprecation info that `linter.rules.recommended` is superseded by
  `preset`. Change: applied `biome check --write` for the safe import fix, then
  `biome migrate --write` for the config key. Result: `npm run lint` exit 0
  with zero errors and zero info; tests and typecheck re-run afterwards and
  still green.

## Recorded deviation — commit-readiness preflight

`scripts/check-commit-readiness.mjs` exits 1 with exactly one refusal:

```
REFUSE: HEAD already exists; this preflight is only for the initial commit
```

Every other check it performs passes, including the structural check, the
branch check, command agreement between `AGENTS.md` and `plan.md`, and
timestamped exit-status evidence for all seven gates plus the red gate.

This refusal is a **precondition mismatch, not an evidence deficiency**. The
helper assumes bootstrap runs against a repository with no commits. This
repository already contained `8e5f2bf` and `78bc6c0` — documentation-only
commits produced by the earlier `wf-plan` run for
`001-monthly-telegram-polls`. Satisfying the check would require orphaning,
rewriting, or discarding that history, which the skill and the user-scope
rules both forbid.

Resolution: proceed with the commit, having independently observed every
recorded command and result, and record this deviation here and in the report
to the owner rather than suppressing it. Re-running the helper on this
repository will always produce this same single refusal; a future reader should
treat one refusal on this exact line as expected, and any additional refusal as
a real problem.

## Handback

- state: **complete**. Every step and every applicable development-loop gate is
  ticked with observed evidence.
- target: `C:\Users\65876\Documents\tt-tele-poll`, branch `setup/000-bootstrap`
- stack: Node.js 24 LTS (v24.18.1), TypeScript 7.0.2 via native type stripping,
  `node:test`, npm 10.8.3, Biome 2.5.6. Zero runtime dependencies; no build
  step.
- evidence: install / valid-red / green / lint / typecheck / run all observed
  with timestamps and exit statuses between 2026-08-01T11:03:37Z and
  11:03:42Z. Build and readiness gates are N/A for concrete stack reasons.
- commit state: scaffold commit `fb9f6da` verified on `setup/000-bootstrap`,
  plus a separate truth commit carrying this finalization.
- deviation: the commit-readiness helper refuses with "HEAD already exists"
  because the repository already carried the `wf-plan` documentation commits.
  See the recorded deviation section; all other checks pass.
- running process cleanup: none started; the product is a batch CLI and no
  long-running process was launched at any point.
- protected-branch state: **`main` is untouched at `78bc6c0`.** The bootstrap
  has not been merged. That action needs explicit owner confirmation.
- next action: `wf-feature` against `specs/001-monthly-telegram-polls/`,
  resuming at step 2 of its implementation sequence (clock and target-month
  derivation). Step 3, Friday derivation, is already satisfied.

## Repository reconciliation — 2026-08-01

- The bootstrap and feature work are now merged on `main` at `11e14e3`; the
  protected-branch handback above is retained as historical evidence and is no
  longer the current repository state.
- Deployment hardening continues in `002-deployment-safety`.
