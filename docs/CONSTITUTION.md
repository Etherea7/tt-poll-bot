# Project Constitution — tt-tele-poll

Changes to this file require the project owner's explicit approval.

## Quality bar

- Never fabricate a passing result: green means the command ran and its output
  and exit status were observed.
- Tests precede implementation. Project green requires `npm test` plus every
  other applicable command recorded in `AGENTS.md`.
- After BAILOUT_N = 3 genuinely different failed attempts, stop and hand back
  through the owning checklist.

## Branch and commit policy

- Protected branches are `main`, `master`, and `release/*`; every exact action
  that creates, updates, or merges into one requires owner confirmation.
- Work happens on non-protected branches in gitignored `.worktrees/` when the
  repository already has a base commit.
- Never force-push or rewrite shared history. Scan the staged diff for secrets
  before every commit.

## Artifacts and documentation

- Work items live at `specs/NNN-slug/`; `specs/INDEX.md` is generated directory
  truth. Checklists are the memory layer and are read before resuming work.
- Maintained documentation lives in `docs/` and changes with the behavior it
  describes.

## Stack decisions

- Language/runtime: Node.js 24 LTS (>= 24.12.0; developed on v24.18.1)
- Framework: none
- Test runner: `node:test` with `node:assert/strict` (built in)
- Package manager: npm 10.8.3
- Rationale: the product is a short-lived, outbound-only scheduled job. Node 24
  supplies `fetch`, a test runner, and stable TypeScript type stripping in the
  runtime itself, so the project needs zero runtime dependencies and no build
  step. Every dependency avoided is a dependency that cannot break a job that
  runs unattended twelve times a year.

## Project-specific principles

1. **The essential must not depend on the optional.** Friday and Saturday
   derivation is pure arithmetic and cannot fail. It must never be blocked by
   the holiday data source, Telegram rate limits, or any third party. Degrade
   the optional part and report loudly; do not withhold the whole run.

2. **Never risk a duplicate post to a live group.** A duplicate poll is more
   damaging than a missed one, because it splits votes and confuses the
   organiser. Retry only what provably did not deliver. When an outcome is
   ambiguous, report it and stop rather than guessing.

3. **Preview is the default, sending is the exception.** Any path that can post
   to Telegram must be explicitly requested. Tests never contact Telegram.

4. **Secrets never enter the repository, the logs, or an error message.**

5. **Verify external claims against primary sources.** Every external
   constraint this project relies on — Telegram limits, scheduler behaviour,
   dataset shape, runtime capability — was checked against official
   documentation, and several widely-assumed "facts" turned out to be stale.
   Record what was verified and when, so the next agent does not re-derive it
   or inherit a stale assumption.

6. **Prefer deleting a dependency to adding one.** Adding a runtime dependency
   requires owner approval and a recorded rationale.
