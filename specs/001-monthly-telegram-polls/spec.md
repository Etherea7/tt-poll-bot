---
id: 001-monthly-telegram-polls
title: Monthly Telegram availability polls
status: done
created: 2026-08-01
updated: 2026-08-01
parent: null
children: []
related: [000-bootstrap]
---

# Monthly Telegram availability polls

## Problem

A Telegram group currently needs its monthly date-availability polls created
manually. The group needs this automated ahead of each month, covering that
month's Fridays, Saturdays, and Singapore public holidays, with enough notice
that members can respond before the month begins.

## Glossary

- **Target month** — the calendar month the polls ask about.
- **Run date** — the `Asia/Singapore` date on which the job executes. The run
  date always falls in the month *before* the target month for scheduled runs.
- **Gazetted date** — the official public holiday date published by MOM.
- **Observed date** — a substitute day off published explicitly in the MOM
  dataset. It is not derived and is not always the following Monday.
- **Destination** — a configured Telegram group that receives the polls.
- **Delivery record** — durable per-month, per-destination-alias, per-kind state
  containing pre-send claims and delivered outcomes.

## Goals

- Post the correct Friday, Saturday, and public-holiday choices for the target
  Singapore calendar month without an organiser calculating dates manually.
- Deliver the polls before the target month begins, so members have notice even
  when the 1st is itself a holiday.
- Never post the same target month twice, without requiring a database.
- Make the run safe to operate and diagnosable when Telegram or the holiday
  source is unavailable.
- Allow the same deployment to target one or more explicitly configured groups,
  beginning with a dedicated test group.
- Keep credentials and group configuration out of source control.

## Non-goals

- General-purpose poll creation for arbitrary questions.
- Self-service group registration or group configuration through Telegram in v1.
- Any inbound Telegram command handling in v1 (foreclosed by the scheduler
  choice: no always-on process exists to receive updates).
- Calendar booking, attendance enforcement, reminder workflows, or automatic
  poll closing (the Telegram Bot API cannot auto-close a poll a month out).
- A graphical administration dashboard in v1.
- Vote collection, tallying, or reading poll results back out of Telegram.

## Requirements

### Target month selection

- R1. WHEN a scheduled run executes, the system SHALL select as its target
  month the calendar month immediately following the run date's
  `Asia/Singapore` calendar month.
- R2. WHEN a run is invoked with an explicit target month in `YYYY-MM` form,
  the system SHALL use that month instead of the derived one.
- R3. The system SHALL determine the current date using the `Asia/Singapore`
  time zone, independent of the host's local time zone.

### Date derivation

- R4. WHEN a target month is selected, the system SHALL derive every Friday in
  that month in ascending chronological order.
- R5. WHEN a target month is selected, the system SHALL derive every Saturday
  in that month in ascending chronological order.
- R6. WHEN holiday data for the target month is available, the system SHALL
  derive every gazetted public holiday date AND every observed substitute date
  falling within that month, in ascending chronological order.
- R7. WHEN a holiday date already appears among the derived Fridays or
  Saturdays, the system SHALL omit that date from the holiday poll so that no
  date is offered in more than one poll.

### Poll construction and delivery

- R8. The system SHALL send the Friday, Saturday, and holiday date sets as
  three separate polls rather than one combined poll, because a single month
  can yield 5 Fridays + 5 Saturdays + 3 holidays = 13 options, exceeding the
  Telegram maximum of 12 answer options per poll.
- R9. Each availability poll SHALL set `is_anonymous: false` and
  `allows_multiple_answers: true`.
- R10. Each poll question SHALL be at most 300 characters and each answer
  option at most 100 characters, matching Telegram Bot API limits.
- R11. WHEN all inputs have been validated and built, the system SHALL send the
  constructed polls to every destination in the configured allow-list and to no
  other chat.
- R12. The system SHALL construct every poll payload for every destination
  before issuing the first Telegram request.
- R13. The system SHALL accept destinations only from runtime configuration and
  SHALL provide no code path that adds a destination from Telegram input.

### Poll wording and time slots

- R34. The Friday poll question SHALL be
  `Friday TT Sessions @ marymount/bishan/northeast/tampines`.
- R35. The Saturday poll question SHALL be
  `Saturday TT Sessions @ marymount/bishan/central/northeast`.
- R36. The holiday poll question SHALL be `Public Holiday TT Sessions`, with no
  venue list.
- R37. Friday and holiday poll options SHALL render a date as day-of-month
  followed by abbreviated month, without a leading zero — for example `6 Sep`.
- R38. Saturday poll options SHALL render as the R37 date, a comma and space,
  then the time slot — for example `6 Sep, 10am-12pm` — producing one option
  per date-and-slot combination, ordered by date and then by slot start time.
- R39. The Saturday time slots SHALL be configuration, not code, defaulting to
  `10am-12pm` and `7-9pm`, so slots can be changed without a code change.
- R40. The Saturday poll SHALL set `allow_adding_options` to true so group
  members can add slots the configuration does not yet cover.
- R41. WHEN the Saturday date-and-slot combinations for a target month would
  exceed the Telegram maximum answer-option count, the system SHALL exit
  non-zero before sending and SHALL report the count and the limit, rather than
  truncating the option list.

### Holiday source

- R14. The system SHALL attempt to read holiday data from the authoritative
  data.gov.sg dataset first, and SHALL fall back to the repository's committed
  holiday snapshot when that fetch returns a non-2xx status, exceeds a bounded
  attempt budget, or yields data that fails schema validation.
- R15. WHEN the target month's holiday coverage is absent from both the live
  source and the snapshot, the system SHALL still send the Friday and Saturday
  polls, SHALL skip the holiday poll, and SHALL exit non-zero.
- R16. WHEN holiday coverage for the target month is present but contains no
  holidays, the system SHALL send a single informational message naming the
  target month instead of a holiday poll, and SHALL exit zero.
- R17. The repository SHALL provide an automated check, runnable in CI
  independently of a poll run, that fails when the committed snapshot does not
  cover at least the six months following the check date.

### Idempotency and re-runs

- R18. The system SHALL maintain a durable delivery record mapping target month,
  destination alias, and poll kind to a claimed or delivered status and claim
  identifier.
- R19. WHEN every selected destination/kind is delivered, the system SHALL send
  nothing, SHALL report the skip, and SHALL exit zero.
- R20. A live run SHALL send only selected destination/kinds durably claimed by
  that run's claim identifier. A claim owned by another run SHALL stop automatic
  delivery for operator review.
- R21. WHEN prepare mode is invoked with an explicit force flag and narrowed
  destination/kind scope, the system SHALL replace state only for that scope so
  a verified-missing item can be retried without duplicating another group.
- R22. WHEN a run is invoked with a scope selector naming a subset of
  `fridays`, `saturdays`, `holidays`, the system SHALL treat only the named
  kinds as requested.
- R23. BEFORE live delivery the workflow SHALL push claims, and after each
  successful Telegram response the system SHALL atomically mark that exact
  destination/kind delivered. Ambiguous outcomes SHALL remain claimed.

### Failure handling

- R24. WHEN required configuration is missing or invalid, the system SHALL exit
  non-zero before issuing any Telegram request.
- R25. WHEN a Telegram request returns HTTP 429, the system SHALL wait at least
  the `retry_after` seconds supplied by Telegram and retry that request, up to
  3 attempts.
- R26. WHEN a Telegram request returns 5xx or Fetch throws before returning a
  response, the system SHALL treat the result as ambiguous and SHALL NOT retry,
  because Fetch cannot prove the request did not reach Telegram.
- R27. WHEN any Telegram outcome is ambiguous, the system SHALL retain its
  durable claim, report operator recovery is required, and SHALL NOT
  automatically resend it.
- R28. WHEN Telegram reports that a destination has migrated to a supergroup,
  the system SHALL report the superseding chat identifier and instruct the
  operator to update configuration, and SHALL exit non-zero.
- R29. WHEN a run exits non-zero, the failure SHALL be surfaced to an operator
  through the scheduler's failure notification without requiring the operator
  to inspect logs proactively.
- R30. The system SHALL redact the bot token from all log output, error
  messages, and stack traces.

### Operability

- R31. WHEN run in preview mode, the system SHALL render the complete poll
  payloads it would send and SHALL issue no request to Telegram.
- R32. The system SHALL read the bot token and destination allow-list from
  runtime configuration and SHALL NOT commit either value to source control.
- R33. The system SHALL expose a manually triggerable run that accepts target
  month, preview, scope, and force as inputs.

## Decisions

- 2026-08-01 The authoritative holiday source SHALL be the MOM-managed
  Singapore Public Holidays consolidated dataset on data.gov.sg (owner request
  for the Singapore calendar; rationale: official source with date, day, and
  holiday fields and annual updates; verified to cover 2020-01 through 2027-12
  and to refresh around Q3 annually).
- 2026-08-01 Telegram poll options SHALL remain in chronological order
  (provisional - default adopted, revisit on review; low-stakes presentation
  order that is locally reversible).
- 2026-08-01 Poll question and option wording SHALL be concise English with ISO
  month context (provisional - default adopted, revisit on review; low-stakes
  wording that is locally reversible).
- 2026-08-01 Q2 -> one or more statically configured group identifiers, starting
  with a test group; no self-service registration or database in v1 (owner;
  rationale: retain operational simplicity while allowing the same polls to be
  sent to additional approved groups later).
- 2026-08-01 Q3 -> non-anonymous, multi-select polls (owner; rationale: members
  may select every date they are available and organisers can coordinate from
  named responses).
- 2026-08-01 Q1 -> GitHub Actions scheduled workflow plus manual dispatch, in a
  **private** repository (owner; rationale: no always-on service to operate,
  and a private repository is not subject to the documented 60-day inactivity
  auto-disable that applies to scheduled workflows in public repositories).
- 2026-08-01 Q4 -> Node.js 24 LTS with TypeScript executed directly via
  built-in type stripping (owner; rationale: no build or bundling step is
  required since type stripping became stable in Node 24.12, built-in `fetch`
  removes HTTP dependencies, and `tsc --noEmit` remains available as a CI-only
  quality gate).
- 2026-08-01 Q5 -> superseded. Scheduled runs SHALL execute on the **25th** of
  each month and target the **following** month (owner; rationale: posting on
  the 1st gives members no notice and arrives after the date it asks about when
  the 1st is itself a public holiday).
- 2026-08-01 The scheduled run time SHALL be 09:17 `Asia/Singapore`, expressed
  using the scheduler's native IANA time-zone support rather than a manual UTC
  conversion (provisional - default adopted, revisit on review; low-stakes and
  reversible by editing one cron line. The offset from the top of the hour
  avoids the high-load window GitHub documents for scheduled workflows).
- 2026-08-01 Q6 -> a month whose holiday coverage exists but contains no
  holidays SHALL receive a short informational message (owner; rationale:
  silence cannot be distinguished from a broken run).
- 2026-08-01 Q7 -> the holiday poll SHALL include gazetted dates and observed
  substitute dates, de-duplicated against the Friday and Saturday polls (owner;
  rationale: availability depends on the day members are actually off, and no
  date should be asked twice).
- 2026-08-01 Q8 -> closed as foreclosed by Q1. Selecting a scheduled,
  short-lived job means no process exists to receive Telegram updates, so
  outbound-only is the only coherent design in v1.
- 2026-08-01 Q9 -> corrected by spec 002 after implementation review. Only 429
  is provably safe to retry; 5xx and generic Fetch failures are ambiguous.
  Duplicate protection uses durable pre-send claims plus explicit month,
  destination, kind, and force scope.
- 2026-08-01 Holiday-source failure SHALL degrade rather than block: a live
  fetch failure falls back to a committed snapshot, and total coverage failure
  still delivers the Friday and Saturday polls (owner; rationale: Friday and
  Saturday derivation is pure arithmetic and must not be held hostage by a
  third-party outage).
- 2026-08-01 Polls SHALL be sent as three separate messages (forced by the
  Telegram maximum of 12 answer options per poll; a worst-case month yields 13
  candidate dates).

- 2026-08-01 Poll questions and option formats fixed by the owner: Friday and
  Saturday questions name their venue lists, the holiday question is generic
  because the venue is decided in chat once availability is known, dates render
  as `6 Sep`, and Saturday options combine date and slot as `6 Sep, 10am-12pm`.
  The comma separator was chosen over the literal `<Date>-<Time>` to avoid the
  double hyphen in `6 Sep-10-12pm`, and `10am-12pm` over `10-12pm` to remove
  the am/pm ambiguity.
- 2026-08-01 Saturday time slots default to `10am-12pm` and `7-9pm` and live in
  configuration (owner; rationale: slots are expected to change more often than
  code).
- 2026-08-01 **Correction to an earlier assessment.** This spec previously
  assumed Telegram could not let voters add poll options. That was wrong: Bot
  API 9.6 (2026-04-03) added the `allow_adding_options` parameter to
  `sendPoll`, in a release containing extensive poll changes. The Saturday poll
  therefore sets `allow_adding_options` so members can add slots themselves
  (R40). Whether member-added options count against the 12-option maximum is
  not yet established from primary documentation and SHALL be confirmed against
  the test group before any production group is configured.
- 2026-08-01 The Saturday poll keeps the combined date-and-slot option format
  (owner). Recorded trade-off: options grow as dates × slots, so a 5-Saturday
  month with the two default slots produces 10 options against a maximum of 12.
  A third configured slot would exceed the maximum in any 5-Saturday month.
  R41 makes that condition a loud pre-send failure rather than silent
  truncation.
- 2026-08-01 Spec 002 supersedes the original global per-kind delivery record
  with alias/kind claims and delivered statuses. This resolves the contradiction
  between multi-destination partial success and duplicate-free recovery.

## Acceptance criteria

- [ ] AC1 (R1): Given a run date of 2026-08-25 in `Asia/Singapore` and no month
  override, when the target month is resolved, then it is `2026-09`.
- [ ] AC2 (R2): Given an explicit target month `2027-01`, when the target month
  is resolved, then it is `2027-01` regardless of the run date.
- [ ] AC3 (R3): Given a host clock set to a non-Singapore time zone at an
  instant that falls on a different calendar date in `Asia/Singapore`, when the
  target month is resolved, then it matches the Singapore calendar date.
- [ ] AC4 (R4): Given any target year and month, when Friday dates are derived,
  then the result contains every and only Friday in that month in ascending
  order.
- [ ] AC5 (R5): Given any target year and month, when Saturday dates are
  derived, then the result contains every and only Saturday in that month in
  ascending order.
- [ ] AC6 (R6): Given holiday rows spanning multiple months and years including
  a gazetted Sunday holiday with its observed Monday, when the target month is
  selected, then only dates within that month are returned, both gazetted and
  observed, in ascending order.
- [ ] AC7 (R7): Given a target month in which a public holiday falls on a
  Friday, when the polls are built, then that date appears in the Friday poll
  and does not appear in the holiday poll.
- [ ] AC8 (R8): Given a target month yielding 5 Fridays, 5 Saturdays and 3
  holidays, when the polls are built, then three separate poll payloads are
  produced and no payload exceeds 12 options.
- [ ] AC9 (R9): Given any generated availability poll payload, then it sets
  `is_anonymous` false and `allows_multiple_answers` true.
- [ ] AC10 (R10): Given any generated poll payload, then its question is at
  most 300 characters and every option is at most 100 characters.
- [ ] AC11 (R11): Given two allow-listed destinations, valid inputs, and a
  mocked Telegram API, when a run executes, then each poll is sent once to each
  destination and to no other chat identifier.
- [ ] AC12 (R12): Given a run in which building the third poll fails, when the
  run executes, then no Telegram request was issued.
- [ ] AC13 (R13): Given a repository-wide search, then no code path writes a
  destination identifier derived from a Telegram response or update.
- [ ] AC14 (R14): Given a live holiday fetch that fails, and a snapshot that
  covers the target month, when the run executes, then the holiday poll is
  built from the snapshot and the run exits zero.
- [ ] AC15 (R15): Given a live fetch failure and a snapshot lacking the target
  month, when the run executes, then the Friday and Saturday polls are sent,
  no holiday poll is sent, and the process exits non-zero.
- [ ] AC16 (R16): Given holiday coverage containing no holidays in the target
  month, when the run executes, then one informational message naming the
  target month is sent, no holiday poll is sent, and the process exits zero.
- [ ] AC17 (R17): Given a committed snapshot whose latest covered month is
  three months after the check date, when the staleness check runs, then it
  exits non-zero.
- [ ] AC18 (R18, R23): Given aliases `test` and `club`, when all three kinds are
  prepared and delivered, state records each alias/kind independently and
  contains neither Telegram chat ID.
- [ ] AC19 (R23): Given `test/fridays` succeeds and `club/fridays` fails, when
  the run ends, local state marks only `test/fridays` delivered while the
  durable claim prevents either item being guessed safe on an automatic retry.
- [ ] AC20 (R19): Given every selected alias/kind is delivered, when prepare
  and live execute without force, then no Telegram request is issued and the
  process exits zero.
- [ ] AC21 (R20): Given a claim owned by another run, when prepare or live is
  attempted automatically, then no Telegram request is issued and the process
  exits non-zero for operator review.
- [ ] AC22 (R21): Given the operator verified `club/fridays` did not land, when
  prepare is invoked with `--to club --only fridays --force`, then only that
  destination/kind is reclaimed and delivered.
- [ ] AC23 (R22): Given a scope selector naming only `holidays`, when a run
  executes, then only the holiday poll is sent.
- [ ] AC24 (R24): Given a missing bot token or an empty destination allow-list,
  when a run starts, then it exits non-zero before the first Telegram request.
- [ ] AC25 (R25): Given a mocked Telegram responding 429 with `retry_after` 2
  then 200, when a poll is sent, then the client waits at least 2 seconds,
  retries, and reports success.
- [ ] AC26 (R26): Given a mocked Telegram returning 500 or throwing a generic
  Fetch error, when a poll is sent, then exactly one request is issued and the
  outcome is reported as ambiguous.
- [ ] AC27 (R27): Given a mocked Telegram that times out after transmission,
  when a poll is sent, then no retry is issued, the claim remains unresolved,
  and a later automatic run sends nothing.
- [ ] AC28 (R28): Given a mocked Telegram returning a supergroup migration
  error carrying a new chat identifier, when a run executes, then the reported
  output contains the new identifier and the process exits non-zero.
- [ ] AC29 (R29): Given a run that exits non-zero, then the scheduler
  configuration causes an operator-visible failure notification.
- [ ] AC30 (R30): Given a forced error containing the bot token in a request
  URL, when the error is reported, then the token does not appear in the
  output.
- [ ] AC31 (R31): Given preview mode and valid fixture data, when a run
  executes, then complete poll payloads are printed and no Telegram request
  occurs.
- [ ] AC32 (R32): Given a scan of tracked files, then no bot token and no
  destination identifier is present.
- [ ] AC33 (R33): Given the manual trigger, then it accepts target month,
  preview, scope, and force inputs.
- [ ] AC34 (R34, R35, R36): Given a built poll set, then the three questions are
  exactly the strings named in R34, R35 and R36.
- [ ] AC35 (R37): Given the date 2026-09-06, when rendered as an option, then it
  is `6 Sep` — no leading zero, abbreviated month.
- [ ] AC36 (R38): Given Saturdays 5 and 12 Sep 2026 and slots `10am-12pm` and
  `7-9pm`, when the Saturday poll is built, then its options are exactly
  `5 Sep, 10am-12pm`, `5 Sep, 7-9pm`, `12 Sep, 10am-12pm`, `12 Sep, 7-9pm` in
  that order.
- [ ] AC37 (R39): Given a configuration listing three slots, when the Saturday
  poll is built for a 4-Saturday month, then all twelve combinations are
  produced without a code change.
- [ ] AC38 (R40): Given a built Saturday poll payload, then it sets
  `allow_adding_options` true; the Friday and holiday payloads do not.
- [ ] AC39 (R41): Given a 5-Saturday month and three configured slots (15
  combinations), when a run executes, then it exits non-zero before any
  Telegram request and its output names both 15 and the limit.

## Open questions

None. All questions raised during clarification are recorded in Decisions.
Two low-stakes defaults (option ordering, wording, and the 09:17 run time) are
marked provisional and may be changed without altering any requirement.
