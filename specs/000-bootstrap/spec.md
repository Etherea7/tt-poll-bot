---
id: 000-bootstrap
title: Bootstrap tt-tele-poll
status: in-progress
created: 2026-08-01
updated: 2026-08-01
parent: null
children: []
related: [001-monthly-telegram-polls]
---

# Bootstrap tt-tele-poll

## Problem

`specs/001-monthly-telegram-polls/spec.md` is `ready` but the repository holds
only documentation — there is no runtime, no test loop, and no way to observe a
requirement pass or fail. Implementation cannot begin until a verified
development loop exists.

## Goals

- Establish the agreed Node.js 24 LTS project scaffold without overwriting
  pre-existing user files.
- Generate project rules, constitution, and resumable bootstrap artifacts.
- Observe every applicable development-loop command green before the first
  commit.
- Prove the zero-dependency, zero-build-step premise that spec 001 relies on,
  by executing it rather than assuming it.

## Non-goals

- Implementing any requirement of spec 001 beyond the single first outcome used
  to prove the loop. Holiday sourcing, the Telegram client, the delivery record,
  and the GitHub Actions workflow all belong to `wf-feature`.
- Creating a bot, a Telegram group, or any external cloud resource.
- Creating or updating the protected `main` branch.
- Choosing poll wording or option label formatting — a product decision for
  spec 001 implementation.

## Requirements

- R1. The project SHALL support the first observable outcome: deriving every
  Friday in a target month as ascending ISO date strings, exercised both by an
  automated test and by a local CLI run.
- R2. The repository SHALL use the stack and exact commands recorded in
  `AGENTS.md` and `plan.md`.
- R3. The repository SHALL remain uncommitted until install/restore, tests, and
  every other applicable quality/run gate are observed green.
- R4. The repository SHALL begin on non-protected `setup/000-bootstrap`; any
  protected default-branch action requires explicit confirmation.
- R5. The scaffold SHALL declare zero runtime dependencies and SHALL introduce
  no build step, so that the premise of spec 001's Q4 decision is enforced by
  configuration rather than by convention.
- R6. Typechecking SHALL reject TypeScript syntax that Node's type stripping
  cannot execute, so the constraint fails at the typecheck gate rather than at
  runtime on the 25th of a month.

## Open questions

- None.

## Decisions

- 2026-08-01 Stack selected: Node.js 24 LTS with TypeScript executed via native
  type stripping, `node:test` as the test runner, npm as the package manager,
  and Biome for lint and format. Rationale: an unattended monthly job benefits
  more from having nothing to break than from framework convenience; Node 24
  supplies `fetch`, a test runner, and stable type stripping in the runtime, so
  runtime dependencies are zero and no build step exists.
- 2026-08-01 Node v24.18.1 and `node --test` on `.ts` files were verified
  empirically before the stack was committed to, rather than assumed from
  documentation.
- 2026-08-01 `erasableSyntaxOnly` is enabled in `tsconfig.json` so that `enum`,
  `namespace` with runtime code, parameter properties, and decorators fail the
  typecheck gate — matching exactly what the runtime cannot strip.
- 2026-08-01 The bootstrap branch was created from the existing `main` rather
  than by re-initialising the repository, preserving the two docs-only commits
  from the `wf-plan` run.

## Acceptance criteria

- [ ] AC1 (R1): the documented first outcome runs locally as specified.
- [ ] AC2 (R2): the structural checker passes with no unresolved markers.
- [ ] AC3 (R3): checklist evidence shows every applicable dev-loop gate green
  before the initial commit hash.
- [ ] AC4 (R4): initial commits exist only on `setup/000-bootstrap` until an
  exact protected-branch action is confirmed.
- [ ] AC5 (R5): `package.json` declares no runtime dependencies and no build
  script, and no bundler or transpiler is present.
- [ ] AC6 (R6): a file containing a TypeScript `enum` fails `npm run typecheck`.
