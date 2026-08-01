# Implementation plan - monthly Telegram availability polls

Status: **ready**. `spec.md` is the testable source of truth; this plan must
change when that spec changes. This document records *how* the spec's
requirements will be met and *why* each technical option was chosen.

## Project target

A small Telegram automation that, on the 25th of each Singapore calendar month,
prepares and sends date-availability polls for the **following** month:

1. every Friday in the target month;
2. every Saturday in the target month; and
3. every applicable Singapore public holiday in the target month, gazetted and
   observed, de-duplicated against the first two polls.

The first live destination is a dedicated test group. Destinations are an
explicitly configured allow-list, so additional approved groups can be added
later without Telegram-based registration or a database.

## Product goal

Remove the organiser's recurring date calculation and poll-creation work while
keeping each run previewable, credentials out of source control, duplicate
posts impossible by default, and failures visible to a human.

Success means an organiser can configure a bot token and one or more group IDs,
preview a target month, and let the automation deliver correct non-anonymous,
multi-select date polls to every configured group before that month starts.

## Corrections applied to the first draft

The initial draft rested on four assumptions that verification disproved. They
are recorded here so the reasoning is not silently lost.

| Draft assumption | Verified reality | Consequence |
|---|---|---|
| Run on the 1st, poll the current month | If the 1st is itself a public holiday, the poll arrives after the date it asks about, and members get no notice | Run on the 25th, target the following month; the duplicate guard becomes load-bearing |
| Hard-fail the whole run when holiday coverage is missing | Friday/Saturday derivation is pure arithmetic and cannot fail; only the holiday input depends on a third party | Degrade instead: live fetch, then committed snapshot, then Fri/Sat-only with a non-zero exit |
| A one-option poll may not be supported | Bot API 7.0 (2023-12-29) decreased the minimum poll options from 2 to 1; Bot API 9.1 (2025-07-03) raised the maximum to 12 | Single-holiday months poll normally. The max of 12 *forces* three separate polls: a worst-case month yields 5+5+3 = 13 dates |
| TypeScript costs a build step | Type stripping became stable in Node 24.12; `node src/main.ts` runs directly | No bundler, no emit step, no `dist/`. `tsc --noEmit` remains as a CI-only gate |

Two further facts changed the scheduler configuration:

- Scheduled workflows are auto-disabled after 60 days of inactivity **in public
  repositories only**. The repository will be **private**, which removes this
  failure mode entirely rather than mitigating it with a keepalive job.
- GitHub Actions gained IANA time-zone support for `cron` in March 2026, so the
  schedule is written as `Asia/Singapore` directly instead of hand-converting
  to UTC.

## Confirmed stack

- **Scheduler**: GitHub Actions, private repository, monthly `schedule` plus
  `workflow_dispatch`.
- **Runtime**: Node.js 24 LTS, TypeScript executed via built-in type stripping.
- **HTTP**: built-in `fetch`. No Telegram framework, no HTTP client dependency.
- **Dates**: no date library. See the note below.
- **Storage**: a committed JSON state file. No database.
- **Holiday authority**: MOM-managed consolidated Singapore Public Holidays
  dataset on data.gov.sg, with a committed snapshot as fallback.

### Why no date library is needed

Only one operation in this system is time-zone sensitive: deciding what "now"
is in Singapore. That is one line:

```ts
const sgToday = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());           // -> "2026-08-25"
```

Everything downstream — "every Friday in 2026-09" — is pure integer calendar
arithmetic on a year/month pair and carries no time-zone meaning at all. This
is why the Python-versus-Node date-handling comparison does not favour either
language for this project.

### TypeScript constraints under type stripping

Node's type stripping erases types without transforming syntax. The following
are therefore unavailable and must not be used: `enum`, `namespace` containing
runtime code, constructor parameter properties, import aliases, and decorators.
Use `const` objects with union types in place of enums.

## Component boundaries

1. **Config** — parse and validate bot token, destination allow-list, target
   month override, preview flag, scope selector, force flag. Fails fast (R23).
2. **Clock** — resolve "today" in `Asia/Singapore` and derive the target month
   as the following calendar month (R1, R3). Injectable, so tests control time.
3. **Calendar** — pure functions returning every Friday and every Saturday in a
   given year/month (R4, R5). No I/O, no time zone.
4. **Holiday source** — live data.gov.sg fetch with snapshot fallback; parse,
   validate schema, filter to target month, include gazetted and observed dates
   (R6, R14, R15).
5. **Poll builder** — de-duplicate holiday dates against Fridays and Saturdays,
   order chronologically, enforce Telegram length and option-count limits, and
   emit the informational-message payload for an empty holiday month
   (R7, R8, R10, R16).
6. **Telegram client** — `sendPoll` and `sendMessage` only, to configured
   destinations only. Owns the retry taxonomy (R25-R27), migration detection
   (R28), and token redaction (R30).
7. **Delivery record** — read and write per-month, per-kind delivery state;
   consulted before sending, written per kind on full fan-out success
   (R18-R23).
8. **Coordinator** — orchestrate: guard, validate, build everything, then send
   (R12). Implements preview mode (R31) and the scope selector (R22).
9. **Workflow** — schedule, manual dispatch inputs, secret and variable wiring,
   state-file commit, failure notification (R29, R33).

## Key mechanism decisions

### Delivery record: a committed state file

`state/delivered.json`, keyed by target month, valued by the poll kinds already
delivered to every destination:

```json
{
  "2026-09": ["fridays", "saturdays", "holidays"],
  "2026-10": ["fridays", "saturdays"]
}
```

Per-kind granularity rather than a flat list of months is deliberate, and the
consistency pass is what surfaced the need. A degraded run (R15) sends the
Friday and Saturday polls, skips holidays, and exits non-zero. If the record
tracked only whole months, that month would stay unrecorded, and the operator's
recovery re-run would duplicate the two polls that *did* land. Recording kinds
makes recovery self-healing: a plain re-run sends exactly the missing holiday
poll (R20) with no flags to remember.

Chosen over the alternatives because:

- **GitHub repository variables** would work, but the default `GITHUB_TOKEN`
  cannot write them — that requires an additional fine-grained PAT to create,
  store, and rotate. A state file needs only `permissions: contents: write` on
  the built-in token.
- **Actions cache** is evicted after 7 days without access, so it cannot
  survive a monthly cadence.
- A file gives a git-visible audit trail of exactly what was posted and when,
  reviewable without opening the Actions UI.

Keying by month rather than storing a single "last posted month" also makes
back-filling an older month with an explicit `--month` override safe to guard.

### Holiday fetch is a two-step polling flow, not a plain GET

data.gov.sg requires:

1. `GET https://api-open.data.gov.sg/v1/public/api/datasets/{datasetId}/initiate-download`
2. `GET https://api-open.data.gov.sg/v1/public/api/datasets/{datasetId}/poll-download`
   repeatedly until the response carries a signed `url`
3. `GET` that signed URL to retrieve the CSV

Unauthenticated Dataset Downloads calls are limited to 2 per 10 seconds, so
API calls need at least 5 seconds of spacing, a bounded attempt count, and a
per-request timeout. This
multi-step, rate-limited, third-party dependency is precisely why the snapshot
fallback exists.

The consolidated dataset currently covers 2020-01 through 2027-12 and refreshes
around Q3 each year. The staleness check (R17) fails CI when the committed
snapshot no longer covers six months ahead, so the gap surfaces during ordinary
development rather than at 09:17 on the 25th.

### Workflow schedule

```yaml
on:
  schedule:
    - cron: '17 9 25 * *'
      timezone: Asia/Singapore
  workflow_dispatch:
    inputs:
      month:   { description: 'Target month YYYY-MM', required: false }
      preview: { description: 'Render without sending', type: boolean, default: true }
      only:    { description: 'fridays|saturdays|holidays', required: false }
      force:   { description: 'Ignore posted-months guard', type: boolean, default: false }
permissions:
  contents: write
```

Verify the `timezone:` key is accepted when the workflow is first committed. If
it is not available, fall back to `cron: '17 1 25 * *'` (09:17 SGT = 01:17 UTC;
Singapore observes no daylight saving, so the conversion is fixed year-round)
and add a comment recording that the time is Singapore-local.

`preview` defaults to **true** on manual dispatch so an accidental click cannot
post to a live group.

### Secrets versus variables

- `TELEGRAM_BOT_TOKEN` → repository **secret**. Masked in logs automatically.
- `TELEGRAM_DESTINATIONS` → repository **variable** (comma-separated
  `alias=chatId` mappings). Aliases enter delivery state; chat IDs remain out of
  git while the mapping stays reviewable in repository settings.

## Implementation sequence

Each step is red-green: write the failing test named in brackets first.

1. Bootstrap Node 24 + TypeScript, test runner, lint/format, `tsc --noEmit`,
   and the run/preview scripts through `wf-setup`.
2. Clock and target-month derivation. [AC1, AC2, AC3]
3. Friday and Saturday derivation — pure, property-testable. [AC4, AC5]
4. Holiday parsing and filtering against committed fixtures, including a
   gazetted-Sunday-plus-observed-Monday case. [AC6]
5. Poll builder: de-duplication, ordering, limits, empty-month message.
   [AC7, AC8, AC9, AC10, AC16]
6. Telegram client against a mocked HTTP layer: retry taxonomy, migration
   detection, redaction. [AC25, AC26, AC27, AC28, AC30]
7. Delivery record and the per-kind guard. [AC18, AC19, AC20, AC21, AC22]
8. Coordinator: config validation, build-before-send, preview, scope selector,
   multi-destination fan-out. [AC11, AC12, AC23, AC24, AC31]
9. Live holiday adapter with snapshot fallback and degradation.
   [AC14, AC15]
10. Snapshot staleness check as a standalone CI job. [AC17]
11. Workflow file, secret and variable wiring, state-file commit step, failure
    notification. [AC29, AC33]
12. Documentation: secret setup, test-group onboarding, preview, manual run,
    production rollout, and how to recover from a failed month.

## Safe rollout

1. Create the bot with BotFather; never place its token in tracked files.
2. Create the repository as **private**.
3. Add the bot only to the test group and obtain that group's numeric ID.
4. Configure the test group as the only allowed destination.
5. Run preview mode for representative months: a month with no public holidays,
   a month containing an observed substitute day, a month where a holiday falls
   on a Friday, and a 5-Friday month.
6. Manually dispatch a live run to the test group. Verify question text,
   options, voter identity, and multi-select behaviour in the Telegram client.
7. Confirm the delivery record updated, then dispatch the same month again and
   confirm it is skipped with a zero exit.
8. Add production group IDs to the allow-list only after owner review.
9. Enable the monthly schedule last.

## Residual risks

- **Supergroup migration**: if a destination group is upgraded to a supergroup
  its chat ID changes. R27 turns this from a silent failure into a loud one
  naming the replacement ID, but the operator must still edit configuration.
- **Scheduled-run delay**: GitHub documents that scheduled workflows can be
  delayed under load. Running on the 25th for the following month means a delay
  of even several hours has no user-visible effect.
- **Snapshot drift**: mitigated by R17, but the check only fails CI when
  something is pushed. A repository with no commits for many months could
  reach the 25th with a stale snapshot and a live-fetch failure at once. R15
  keeps the Friday and Saturday polls flowing in that case.
- **No result collection**: v1 never reads votes back. If organisers later want
  tallies, that requires inbound updates and therefore revisits Q1 and Q8.

## Primary references

- Telegram Bot API: <https://core.telegram.org/bots/api>
- Telegram Bot API changelog (poll option minimum and maximum):
  <https://core.telegram.org/bots/api-changelog>
- MOM-managed consolidated holiday dataset:
  <https://data.gov.sg/datasets/d_8ef23381f9417e4d4254ee8b4dcdb176/view>
- data.gov.sg dataset download flow:
  <https://guide.data.gov.sg/developer-guide/dataset-apis/download-dataset>
- GitHub scheduled workflow behaviour and auto-disable:
  <https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows>
- Node.js TypeScript support and type stripping:
  <https://nodejs.org/api/typescript.html>
- Node.js release status: <https://nodejs.org/en/about/previous-releases>
- Official GitHub Node setup action: <https://github.com/actions/setup-node>
