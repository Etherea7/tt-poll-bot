---
id: 001-monthly-telegram-polls
title: Monthly Telegram availability polls
status: ready
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
- **Observed date** — the substitute day off when a gazetted holiday falls on a
  Sunday (in Singapore, the following Monday).
- **Destination** — a configured Telegram group that receives the polls.
- **Posted-months record** — durable state listing target months already
  delivered, used to prevent duplicate posting.

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

- R18. The system SHALL maintain a durable delivery record, persisted outside
  the lifetime of a single run, mapping each target month to the set of poll
  kinds (`fridays`, `saturdays`, `holidays`) already delivered to every
  destination for that month.
- R19. WHEN every poll kind requested by a run is already recorded for the
  target month, the system SHALL send nothing, SHALL report the skip, and SHALL
  exit zero.
- R20. WHEN some but not all requested poll kinds are recorded for the target
  month, the system SHALL send only the unrecorded kinds, so that recovering
  from a partially failed run cannot duplicate an already-delivered poll.
- R21. WHEN a run is invoked with an explicit force flag, the system SHALL send
  every requested poll kind regardless of the delivery record.
- R22. WHEN a run is invoked with a scope selector naming a subset of
  `fridays`, `saturdays`, `holidays`, the system SHALL treat only the named
  kinds as requested.
- R23. WHEN a poll kind has been delivered successfully to every destination,
  the system SHALL add that kind to the target month's delivery record;
  otherwise it SHALL leave that kind unrecorded.

### Failure handling

- R24. WHEN required configuration is missing or invalid, the system SHALL exit
  non-zero before issuing any Telegram request.
- R25. WHEN a Telegram request returns HTTP 429, the system SHALL wait at least
  the `retry_after` seconds supplied by Telegram and retry that request, up to
  3 attempts.
- R26. WHEN a Telegram request fails with a 5xx status or a connection error
  before any response is received, the system SHALL retry that request up to 3
  attempts with exponential backoff.
- R27. WHEN a Telegram request times out after the request was transmitted, the
  system SHALL NOT retry it, and SHALL report the ambiguous outcome, because a
  retry could duplicate a delivered poll.
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
- 2026-08-01 Q9 -> transport-level retries (429 and pre-response failures) are
  required; run-level duplicate protection is provided by the posted-months
  record plus explicit month, scope, and force inputs (owner; rationale:
  separates retries that provably did not deliver from re-runs that might).
- 2026-08-01 Holiday-source failure SHALL degrade rather than block: a live
  fetch failure falls back to a committed snapshot, and total coverage failure
  still delivers the Friday and Saturday polls (owner; rationale: Friday and
  Saturday derivation is pure arithmetic and must not be held hostage by a
  third-party outage).
- 2026-08-01 Polls SHALL be sent as three separate messages (forced by the
  Telegram maximum of 12 answer options per poll; a worst-case month yields 13
  candidate dates).

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
- [ ] AC18 (R18, R23): Given a run that delivers all three polls to every
  destination, when it completes, then the delivery record lists `fridays`,
  `saturdays` and `holidays` for the target month.
- [ ] AC19 (R23): Given a run in which the holiday poll fails for one
  destination while the Friday and Saturday polls succeed everywhere, when it
  completes, then the delivery record lists `fridays` and `saturdays` but not
  `holidays`.
- [ ] AC20 (R19): Given a delivery record listing all three kinds for the
  target month and no force flag, when a run executes, then no Telegram request
  is issued and the process exits zero.
- [ ] AC21 (R20): Given a delivery record listing only `fridays` and
  `saturdays` for the target month, when a full run executes, then only the
  holiday poll is sent.
- [ ] AC22 (R21): Given a delivery record listing all three kinds and an
  explicit force flag, when a run executes, then all three polls are sent.
- [ ] AC23 (R22): Given a scope selector naming only `holidays`, when a run
  executes, then only the holiday poll is sent.
- [ ] AC24 (R24): Given a missing bot token or an empty destination allow-list,
  when a run starts, then it exits non-zero before the first Telegram request.
- [ ] AC25 (R25): Given a mocked Telegram responding 429 with `retry_after` 2
  then 200, when a poll is sent, then the client waits at least 2 seconds,
  retries, and reports success.
- [ ] AC26 (R26): Given a mocked Telegram responding 500 twice then 200, when a
  poll is sent, then the client retries with increasing delay and reports
  success.
- [ ] AC27 (R27): Given a mocked Telegram that times out after transmission,
  when a poll is sent, then no retry is issued and the run reports the
  ambiguous outcome.
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

## Open questions

None. All questions raised during clarification are recorded in Decisions.
Two low-stakes defaults (option ordering, wording, and the 09:17 run time) are
marked provisional and may be changed without altering any requirement.
