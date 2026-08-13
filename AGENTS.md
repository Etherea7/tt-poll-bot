# tt-tele-poll — agent rules

Constitution: [docs/CONSTITUTION.md](docs/CONSTITUTION.md) — read it; it binds.

Monthly Telegram availability polls. On the 25th of each month the job posts
four polls to configured Telegram groups covering the **following** month's
Fridays, Saturdays, Sundays, and Singapore public holidays.

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
- Snapshot staleness check: `npm run snapshot:check`
- Regenerate the holiday snapshot: `npm run snapshot:refresh`

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
  ceiling of 12 is *why* the date sets ship as separate polls rather than one.
  Four polls now go out — Fridays, Saturdays, Sundays, holidays (R42) — and
  every one of them spends an option on the shared `cmi` answer (R43). Worst
  observed case is 11 (5 Saturdays x 2 slots + `cmi`). A third Saturday slot
  reaches 13 in *any* month and is refused (R41); holidays render AM/PM (R46),
  so six non-weekend holidays in one month would also overflow.
- **Poll text limits:** question ≤ 300 chars, each option ≤ 100 chars.
- **Polls are non-anonymous and multi-select** (`is_anonymous: false`,
  `allows_multiple_answers: true`).
- **Only one operation is time-zone sensitive** — resolving "today" in
  `Asia/Singapore`. Everything downstream ("every Friday in 2026-09") is pure
  integer calendar arithmetic carrying no time-zone meaning. Do not reach for a
  date library; `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' })`
  is the whole requirement.
- **Holiday data is a multi-step flow**, not a plain GET: data.gov.sg
  `initiate-download` → poll `poll-download` until a signed CSV URL appears →
  download the CSV. Unauthenticated Dataset Downloads calls are limited to 2
  per 10 seconds, so space API calls by at least 5 seconds and bound every
  request with a timeout. Both endpoints answer **201**, so check `response.ok`,
  never `status === 200`. A committed snapshot (`data/holidays.json`) is the
  fallback; the live source must never block the Friday and Saturday polls.
- **Observed holidays come from the dataset, never derived.** MOM marks them
  `(Observed)` and the substitute is not always the following Monday — in 2022
  Labour Day's substitute was a Tuesday because the Monday was already Hari
  Raya Puasa. Never reimplement this rule; `test/holidays.test.ts` guards it.
- **`covered: false` is not the same as zero holidays.** An uncovered year
  degrades and exits non-zero (R15); a covered month that simply has no
  holidays gets the informational message and exits zero (R16).
- **Retry taxonomy matters.** Retry only HTTP 429 and honour `retry_after`.
  Treat 5xx, timeouts, and generic Fetch failures as ambiguous and do not retry:
  Fetch cannot prove the request did not reach Telegram.

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
- Delivery state lives in `state/delivered.json`, keyed by target month,
  destination alias, and poll kind. Each entry is `claimed` or `delivered` with
  a workflow claim ID. A live run may send only its durably pushed claims.
  Stale claims require inspection and destination/kind-scoped recovery; never
  reduce state to a month/kind list or auto-retry an ambiguous claim.
- Prefer pure functions with no I/O for calendar and poll-building logic; keep
  `fetch` confined to the holiday source and the Telegram client so the rest
  stays trivially testable.
- **Attendance state lives in `state/attendance.json`** (spec 004): the
  `getUpdates` offset, poll registrations, votes, display names, and roster
  message records. It holds personal data, so **the repository must remain
  private**. Selections are replaced wholesale per `(poll_id, user_id)` and are
  keyed on `PollOption.persistent_id` — never on positional `option_ids`,
  because the Saturday poll allows added options and positions shift.
- **Collection must never be able to deliver a poll.** `src/collect.ts` imports
  no transport that can create a message and nothing that writes delivery
  claims; a test asserts that import boundary. Keep it that way.
- **Never register a Telegram webhook.** `getUpdates` and `setWebhook` are
  mutually exclusive, and two concurrent `getUpdates` consumers get HTTP 409.
- A collection run saves each page of updates *before* requesting the next one.
  Requesting a later offset is what makes Telegram discard the previous page,
  and unconsumed updates expire after 24 hours, so the reverse order loses votes
  irrecoverably.
