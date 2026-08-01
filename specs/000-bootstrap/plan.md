# Bootstrap plan — tt-tele-poll

Scope: establish a verified development loop. Product behaviour belongs to
`specs/001-monthly-telegram-polls/`.

## Target

- Absolute path: `C:\Users\65876\Documents\tt-tele-poll`
- Branch: `setup/000-bootstrap`, created from `main` so the two docs-only
  commits from the `wf-plan` run are preserved rather than orphaned.
- Starting state: existing Git repository, clean tree, `specs/001-*` present and
  inventoried as preserved paths.

## Stack and exact commands

These are the canonical commands and must match `AGENTS.md` exactly:

- Install dependencies: `npm ci`
- Run tests: `npm test`
- Lint/format check: `npm run lint`
- Typecheck: `npm run typecheck`
- Build/package: `N/A: Node executes .ts directly via stable type stripping, so no compile, bundle, or emit step exists`
- Run locally: `npm run preview`
- Readiness probe: `N/A: batch CLI that runs to completion and exits, so no process stays alive to probe`

| Concern | Choice |
|---|---|
| Runtime | Node.js 24 LTS (>= 24.12.0, verified v24.18.1) |
| Package manager | npm 10.8.3 |
| Test runner | `node:test` + `node:assert/strict` (built in) |
| Lint + format | Biome |
| Typecheck | TypeScript, `--noEmit` only |
| Build | none — native type stripping |
| Run | batch CLI |
| Readiness probe | none — process runs to completion |

Two gates are N/A for concrete, stack-specific reasons rather than convenience:

- **Build/package** — Node executes `.ts` directly. There is no compile,
  bundle, or emit step to run. `tsc` is present only as a typechecker and is
  configured with `noEmit`.
- **Readiness probe** — the product is a scheduled batch job that runs to
  completion and exits. No process stays alive to probe. The run gate instead
  executes the CLI and observes its stdout and exit status.

## File plan

Created by this bootstrap:

```
.gitignore              .nvmrc               package.json
AGENTS.md               CLAUDE.md            tsconfig.json
docs/CONSTITUTION.md    biome.json
src/calendar.ts         src/main.ts
test/calendar.test.ts
specs/INDEX.md
specs/000-bootstrap/{spec,plan,tasks,checklist}.md
```

Preserved untouched: `specs/001-monthly-telegram-polls/{spec,plan,checklist}.md`.

## Configuration rationale

- `"type": "module"` — the product uses ESM `import`; Node type stripping and
  `node:test` both assume it.
- `allowImportingTsExtensions` — Node ESM requires explicit file extensions, so
  source imports are written `./calendar.ts`. TypeScript permits this only when
  it never emits, which is already the case.
- `erasableSyntaxOnly` — turns the runtime's limitation into a compile-time
  error. Without it, an `enum` typechecks cleanly and then crashes the job at
  runtime; with it, the typecheck gate rejects it during development.
- `verbatimModuleSyntax` — forces `import type` for type-only imports, which is
  what makes stripping unambiguous.
- `engines: node >= 24.12.0` — the version where type stripping became stable.
  Below it the feature is experimental and emits warnings.

## First observable outcome

`fridaysIn(year, month)` returning ascending ISO date strings, chosen because it
is spec 001's AC4, is a pure function with no I/O, no configuration, and no time
zone, and therefore proves the loop without pre-empting design decisions that
belong to `wf-feature`.

Red-green sequence:

1. Write `test/calendar.test.ts` asserting September 2026 yields four Fridays
   and May 2026 yields five.
2. Observe **valid red** — failing because the behaviour is missing, not
   because of a syntax error, missing dependency, or broken fixture.
3. Implement `fridaysIn`.
4. Observe green, then run lint, typecheck, and the CLI.

## Ordered gates

Install → red → green → lint → typecheck → run. No commit exists until all are
observed green. Then: structural checker, staged-diff inspection, secrets scan,
initial commit on `setup/000-bootstrap`, and a separate truth commit recording
the initial hash.

## Handoff

On completion the next action is `wf-feature` against
`specs/001-monthly-telegram-polls/`, following the 12-step implementation
sequence in that spec's `plan.md`, starting at step 2 (clock and target-month
derivation). Step 3 of that sequence is already satisfied by this bootstrap's
first outcome.
