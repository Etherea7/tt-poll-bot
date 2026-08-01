# Bootstrap tasks — tt-tele-poll

Ticks require observed evidence: the command ran, and its output and exit
status were seen. Evidence lives in `checklist.md`.

## Safety and decisions

- [x] T1. Inventory the target, record Git discovery, and identify preserved
  paths before any write.
- [x] T2. Verify the runtime empirically (Node version, type stripping,
  `node --test` on `.ts`) before committing to the stack.
- [x] T3. Record stack, exact commands, and N/A justifications.
- [x] T4. Create `setup/000-bootstrap` from `main` without rewriting history.

## Project rules and artifacts

- [x] T5. Write `.gitignore` (including `.worktrees/` and `.env`) and the
  bootstrap checklist first, as durable memory.
- [x] T6. Write `AGENTS.md` and thin `CLAUDE.md` importing it.
- [x] T7. Write `docs/CONSTITUTION.md`.
- [x] T8. Write `specs/000-bootstrap/{spec,plan,tasks}.md`.
- [x] T9. Generate `specs/INDEX.md` from directory contents.

## Scaffold

- [x] T10. Create `package.json`, `tsconfig.json`, `biome.json`, `.nvmrc`.
- [x] T11. Create `src/calendar.ts` with an unimplemented `fridaysIn` and
  `test/calendar.test.ts` asserting its expected output.
- [x] T12. Verify no preserved path was modified and no product behaviour was
  implemented before red.

## Development loop

- [x] T13. Install dependencies and observe exit status.
- [x] T14. Observe **valid red** — failing for missing behaviour only.
- [x] T15. Implement `fridaysIn` and `src/main.ts`; observe green.
- [x] T16. Observe lint/format check green.
- [x] T17. Observe typecheck green.
- [x] T18. Observe the CLI run and its output and exit status.
- [x] T19. Confirm `erasableSyntaxOnly` rejects an `enum` (AC6), then remove the
  probe file.

## Persistence

- [x] T20. Run the structural checker and fix every reported error.
- [x] T21. Run the commit-readiness preflight; stage only intended files;
  inspect the full staged diff. (One refusal remains and is recorded as a
  deviation in `checklist.md`: the helper only supports a repository with no
  prior commits.)
- [x] T22. Run the secrets scan on the staged diff.
- [x] T23. Create and verify the initial commit on `setup/000-bootstrap`.
- [x] T24. Record the initial hash, finalize statuses and INDEX, and create a
  separate verified truth commit.
- [x] T25. Report protected-branch state; leave `main` untouched pending
  explicit owner confirmation.
