# tt-tele-poll — agent rules

Constitution: [docs/CONSTITUTION.md](docs/CONSTITUTION.md) — read it; it binds.

Monthly Telegram availability polls. On the 25th of each month the job posts
three polls to configured Telegram groups covering the **following** month's
Fridays, Saturdays, and Singapore public holidays.

The behavioural source of truth is
[`specs/001-monthly-telegram-polls/spec.md`](specs/001-monthly-telegram-polls/spec.md)
(R1–R33, AC1–AC33). Cite requirement IDs in commits and PRs.

## Commands

- Install dependencies: `npm ci`
- Run tests: `npm test`
- Lint/format check: `npm run lint`
- Typecheck: `npm run typecheck`
- Build/package: `N/A: Node executes .ts directly via stable type stripping, so no compile, bundle, or emit step exists`
- Run locally: `npm run preview`
- Readiness probe: `N/A: batch CLI that runs to completion and exits, so no process stays alive to probe`

`npm test` defines green and runs the built-in `node --test`. `tsc` is a
typechecker only and is configured `noEmit`; it must never produce output.

## Stack

- Language/runtime: Node.js 24 LTS (developed and verified on v24.18.1; requires >= 24.12.0)
- Framework: none — outbound-only scheduled job, built-in `fetch`
- Test runner: `node:test` + `node:assert/strict` (built in, no dependency)
- Package manager: npm 10.8.3

### Hard constraints — violating these breaks the build

1. **Zero runtime dependencies.** `dependencies` in `package.json` stays empty.
   Only three devDependencies are permitted: `typescript`, `@biomejs/biome`,
   `@types/node`. Adding a runtime dependency is a decision requiring owner
   approval, not a routine change.
2. **No build step.** Node runs `.ts` directly via native type stripping.
   Never add a bundler, `dist/`, `ts-node`, or `tsx`. `tsc` runs with
   `--noEmit` and must never emit.
3. **Erasable syntax only.** Type stripping erases types without transforming
   syntax, so these are unavailable and `erasableSyntaxOnly` in `tsconfig.json`
   will reject them: `enum`, `namespace` containing runtime code, constructor
   parameter properties, import aliases, decorators. Use `const` objects with
   union types instead of enums.
4. **Relative imports need explicit `.ts` extensions** — `import { x } from
   './calendar.ts'`. This is Node ESM resolution, not a style preference.

## Domain constraints — verified, do not re-derive

- **Telegram poll options: 1–12.** Minimum dropped to 1 in Bot API 7.0; maximum
  raised to 12 in Bot API 9.1. A single-holiday month polls normally. The
  ceiling of 12 is *why* the three date sets ship as three separate polls: a
  worst-case month yields 5 Fridays + 5 Saturdays + 3 holidays = 13 dates.
- **Poll text limits:** question ≤ 300 chars, each option ≤ 100 chars.
- **Polls are non-anonymous and multi-select** (`is_anonymous: false`,
  `allows_multiple_answers: true`).
- **Only one operation is time-zone sensitive** — resolving "today" in
  `Asia/Singapore`. Everything downstream ("every Friday in 2026-09") is pure
  integer calendar arithmetic carrying no time-zone meaning. Do not reach for a
  date library; `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' })`
  is the whole requirement.
- **Holiday data is a two-step flow**, not a plain GET: data.gov.sg
  `initiate-download` → poll `poll-download` until a signed CSV URL appears.
  Roughly 5 requests/minute unauthenticated. A committed snapshot is the
  fallback; the live source must never be able to block the Friday and Saturday
  polls.
- **Retry taxonomy matters.** Retry HTTP 429 (honour `retry_after`) and
  pre-response 5xx/connection failures — those provably did not deliver. Never
  retry a timeout that occurred *after* transmission; it may have delivered,
  and a retry would duplicate a poll in a live group.

## Security

- The bot token lives only in a GitHub Actions **secret**; group IDs live in a
  repository **variable**. Neither is ever committed, logged, or printed.
- Redact the token from all error messages, stack traces, and request URLs.
- `.env` and `.env.*` are gitignored. Scan the staged diff for secrets before
  every commit.
- The bot is outbound-only. There is no code path that accepts a destination
  from a Telegram response or update — keep it that way.

## Branch policy

- Protected: `main`, `master`, `release/*` — explicit owner confirmation is
  required for each exact protected-branch action.
- Bootstrap: `setup/000-bootstrap`; work branches use `feature/NNN-slug` or
  `debug/NNN-slug` in `.worktrees/NNN-slug/`.
- Never force-push or rewrite shared history. Scan staged changes for secrets
  before every commit.
- BAILOUT_N: 3

## Artifacts and docs

- Work items: `specs/NNN-slug/{spec,plan,tasks,checklist}.md`; bootstrap is
  `specs/000-bootstrap/`; manifest is `specs/INDEX.md` and is never hand-edited.
- Update `docs/` with behavior and usage changes as part of definition of done.
- Checklists are the memory layer: read before resuming, ticks carry observed
  evidence, decisions are appended and never rewritten.

## Project-specific notes

- **Never post to a live group from a test or a local run.** `npm run preview`
  renders payloads without contacting Telegram; manual workflow dispatch
  defaults `preview` to true for the same reason.
- Delivery state lives in `state/delivered.json`, keyed by target month and
  valued by the poll kinds already delivered. It is tracked per *kind* so that
  recovering from a partially failed run cannot duplicate a poll that already
  landed. Never reduce it to a flat list of months.
- Prefer pure functions with no I/O for calendar and poll-building logic; keep
  `fetch` confined to the holiday source and the Telegram client so the rest
  stays trivially testable.
