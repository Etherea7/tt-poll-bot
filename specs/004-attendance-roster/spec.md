---
id: 004-attendance-roster
title: Attendance roster from Telegram poll votes
status: ready
created: 2026-08-13
updated: 2026-08-14
parent: 001-monthly-telegram-polls
children: []
related: [001-monthly-telegram-polls]
---

# Attendance roster from Telegram poll votes

## Problem

Members vote across four monthly polls (Fridays, Saturdays, Sundays, public
holidays). To find out who is coming to a given session, a member has to open
each poll and tap through its results one option at a time. There is no
consolidated per-session view of who is attending.

The organiser wants that view to be lightweight — no new hosting, accounts, or
ongoing operational burden — and it must not add message volume to the group.

The product and architecture decision is already made and recorded in
[`docs/ATTENDANCE-DECISION.md`](../../docs/ATTENDANCE-DECISION.md): an
in-Telegram roster message updated in place, fed by a scheduled `getUpdates`
job. This spec defines the behaviour, not the direction. The rejected
alternatives are not re-opened here.

## Goals

- A member can read, in one message per destination per month, every configured
  session for that month and the members currently marked as attending it.
- The roster reflects added, changed, and retracted votes without any manual
  step, by the completion of the next scheduled collection run after the vote.
- Attendance collection never delays, duplicates, or blocks the monthly polls.
- The group gains exactly one additional message per destination per month.

## Non-goals

- A web page, Mini App, `.ics` feed, or any surface outside Telegram.
- An interactive command (`/whoscoming`) or freshness better than one hour.
- Casting or editing a vote anywhere other than the Telegram poll itself.
- Reconstructing individual votes cast before collection began.
- Attendance enforcement, capacity limits, reminders, or historical analytics.
- A calendar grid, filtering, or month navigation.
- Closing past months' polls with `stopPoll`. The polls set no `open_period`
  and remain votable; changing that is deferred to separate work.
- Erasing attendance from Git history. Pruning (R26) bounds the working file
  only; the no-force-push policy means history retains what it recorded.

## Requirements

### Collection

- R1. The system SHALL collect Telegram updates with a GitHub Actions job
  scheduled hourly, calling `getUpdates` with `allowed_updates` set to exactly
  `["poll","poll_answer"]` and persisting Telegram's returned offset between
  runs.
- R2. The collection job SHALL run as a single consumer, enforced by a
  workflow-level concurrency group, and the project SHALL NOT register a
  Telegram webhook. Rationale: `getUpdates` and `setWebhook` are mutually
  exclusive, and concurrent `getUpdates` consumers receive HTTP 409.
- R3. WHEN a `poll_answer` arrives for a poll registered under R10, the stored
  selections for that `(poll_id, telegram_user_id)` pair SHALL be replaced in
  full by the update's option set, never merged with prior selections.
- R4. WHEN a `poll_answer` registered under R10 contains an empty option set,
  that user SHALL be removed from every session represented by that poll.
- R5. Selections SHALL be stored and matched by `PollOption.persistent_id` and
  `PollAnswer.option_persistent_ids`, never by positional `option_ids`.
  Rationale: the Saturday poll sets `allow_adding_options` (R40 of spec 001),
  so option positions are not stable.
- R6. Session dates and poll kind SHALL be resolved from the registration
  recorded under R10; the `poll` update's question and option text MAY refresh
  option metadata for an already-registered poll but SHALL NOT create one.
- R7. WHEN an update names a `poll_id` that is not registered under R10, the
  system SHALL ignore it for attendance purposes, count it, and log it with
  the poll ID only. It SHALL NOT create a destination, session, or roster.
- R8. WHEN Telegram supplies changed name fields for an already-stored user ID,
  the stored display identity SHALL be updated while that user's recorded
  attendance remains unchanged.

### Registration

- R9. `sendPoll` SHALL return Telegram's `Message` result rather than `void`, so
  the poll ID assigned at send time is available to the caller.
- R10. WHEN a poll is delivered successfully, the monthly poll job SHALL record
  in `state/attendance.json`, before the run exits, its poll ID against the
  destination alias, target month, poll kind, message ID, and each option's
  `persistent_id` with the session that option means.
- R11. WHEN recording a registration under R10 fails, the poll SHALL NOT be
  resent or withheld; only attendance for that poll degrades, and the failure
  SHALL be reported in the monthly poll job's output.

### Projection

- R12. `cmi` SHALL be retained in stored state, excluded from every session's
  attendance, and SHALL NOT be rendered in the roster message. Rationale:
  `cmi` is an opt-out answer, not a session.
- R13. WHEN an option's text does not resolve to a session under R10, its
  voters SHALL be projected under a separate heading naming the option text,
  rather than discarded or mapped to a guessed date.
- R14. Attendance recorded for one destination SHALL NOT appear in any other
  destination's roster.

### Roster message

- R15. The roster SHALL be posted by the monthly poll job as an additional
  delivery kind recorded in `state/delivered.json`, so the existing
  at-most-once claim discipline governs it and a retry cannot post a second
  roster for the same destination and month.
- R16. The roster SHALL be a standalone message pinned with
  `disable_notification` true. (provisional — Q9)
- R17. WHILE the target month has not ended, a change to the roster's rendered
  content SHALL be published by editing the existing message with
  `editMessageText`; no additional message SHALL be sent for a change. Once the
  target month has ended, that roster SHALL receive no further edit.
  (provisional — Q10)
- R18. WHEN the rendered text is identical to the last text this system
  successfully sent for that roster, the system SHALL make no `editMessageText`
  request. Rationale: Telegram rejects an unchanged edit as *message is not
  modified*.
- R19. The roster SHALL list every session configured for the target month,
  including sessions with no attendees, and SHALL name each session's attendees
  except where R21 applies.
- R20. The roster SHALL carry the start time of the most recent successful
  collection run, rendered in `Asia/Singapore`.
- R21. WHEN the rendered roster including names would exceed 4096 characters,
  the system SHALL instead render counts without names for every attendee list
  in the message — sessions under R19 and unresolved-option headings under R13
  alike — together with a line stating that names were omitted for length. It
  SHALL NOT send a truncated roster.
- R22. An attendee SHALL be displayed by Telegram first name, extended with the
  last name's first initial only where two attendees in the same destination
  would otherwise render identically. (provisional — Q6)

### State and retention

- R23. Attendance state SHALL be stored in `state/attendance.json` and
  committed by the collection job.
- R24. The repository SHALL remain private for as long as attendance state is
  committed to it. Rationale: the file contains member names, Telegram user
  IDs, and attendance.
- R25. A failed collection run SHALL exit non-zero.
- R26. Months whose end is more than 60 days in the past SHALL be removed from
  `state/attendance.json` by the collection job.

### Reliability and secrets

- R27. Failure of collection, projection, or a roster edit SHALL NOT cause a
  poll to be resent, withheld, or delayed, and SHALL NOT alter any poll
  delivery claim in `state/delivered.json`. The roster's own delivery record
  (R15) is exempt, being part of delivery rather than collection.
- R28. The bot token SHALL NOT appear in logs, error messages, or committed
  state; existing redaction (`redactToken`) SHALL cover the new code paths.
- R29. The roster SHALL NOT present attendance for any period before its poll
  was registered under R10 as complete.

## Open questions

<!-- drained; three low-stakes defaults recorded below as provisional -->

None open. Q6, Q9, and Q10 were adopted as provisional defaults and are marked
at the requirements they govern.

## Decisions

- 2026-08-13 Direction (in-Telegram roster, scheduled `getUpdates`, no hosting,
  no database) → settled by the owner before this spec; rationale and rejected
  alternatives in `docs/ATTENDANCE-DECISION.md`.
- 2026-08-13 Q1 → private repository with committed state (owner). Rationale:
  a public repository would publish member names, Telegram user IDs, and
  attendance. Accepts ~300 Actions minutes/month of the 2,000 free private
  allowance at the chosen cadence. → R23, R24.
- 2026-08-13 Q2 → the monthly poll job posts and owns the roster message
  (owner). Rationale: it already enforces at-most-once delivery via claims, so
  a retry cannot produce two rosters. → R15.
- 2026-08-13 Q3 → capture the `sendPoll` result to bind poll ID to destination
  (owner). Rationale: derivation from question text only works while exactly
  one destination exists and would break silently on the second group. → R9,
  R10.
- 2026-08-13 Q4 → prune attendance older than 60 days (owner). Rationale:
  bounds the working file while leaving an organiser a window to diagnose a
  recent mistake. Git history still retains pruned data; recorded as a
  non-goal. → R26.
- 2026-08-14 Q5 → hourly collection (owner). Rationale: ~300 Actions
  minutes/month, and ~24x margin against Telegram's 24-hour update retention.
  → R1.
- 2026-08-14 Q7 → `cmi` is stored but not displayed (owner). Rationale: keeps
  the member-facing roster to sessions; the declined-versus-silent distinction
  stays available to an organiser reading state. → R12.
- 2026-08-14 Q8 → oversized rosters degrade to counts without names (owner).
  Rationale: the roster keeps sending and nothing is silently truncated. → R21.
- 2026-08-14 Q11 → a failed collection run fails the workflow (owner).
  Rationale: the stale timestamp serves members; a red workflow serves the
  operator. → R25.
- 2026-08-14 Q6 → first name, last initial only on collision *(provisional —
  default adopted, revisit on review)*. Low-stakes: presentation detail. The
  roster's audience already sees full names in Telegram's own non-anonymous
  poll results, so the format changes no exposure and is a one-line edit.
  → R22.
- 2026-08-14 Q9 → standalone pinned message rather than a reply to the Friday
  poll *(provisional — default adopted, revisit on review)*. Low-stakes:
  presentation detail with no migration or external consumer. → R16.
- 2026-08-14 Q10 → roster updates stop when the target month ends *(provisional
  — default adopted, revisit on review)*. Low-stakes: isolated internal
  behaviour, swappable without migration. The related `stopPoll` question is
  fenced as a non-goal rather than defaulted. → R17.

## Acceptance criteria

- [ ] AC1 (R1): Given a stored offset, when the collection job runs, then it
  calls `getUpdates` with that offset and `allowed_updates` exactly
  `["poll","poll_answer"]`, and persists the returned offset.
- [ ] AC2 (R2): Given the collection workflow definition, then it declares a
  concurrency group, and no code path calls `setWebhook`.
- [ ] AC3 (R3): Given a user with sessions A and B stored for a registered
  poll, when a `poll_answer` arrives listing only B, then stored state for that
  user and poll contains only B.
- [ ] AC4 (R4): Given a user with stored selections, when a `poll_answer`
  arrives with an empty option set, then that user appears in no session of
  that poll.
- [ ] AC5 (R5): Given a registered poll that gained a member-added option
  between updates, when selections are resolved, then they follow
  `persistent_id` and are unaffected by the position change.
- [ ] AC6 (R6): Given a `poll` update for a registered poll, then its option
  metadata refreshes and no new registration is created.
- [ ] AC7 (R7): Given a `poll_answer` for an unregistered poll ID, then no
  destination, session, or roster is created, the event is counted, and the log
  line contains the poll ID and no other update content.
- [ ] AC8 (R8): Given a stored user whose Telegram last name changed, when a
  new update arrives, then the display name updates and that user's recorded
  attendance is byte-identical to before.
- [ ] AC9 (R9, R10): Given a successful `sendPoll`, then the caller receives the
  `Message` result and a registration is recorded binding the poll ID to the
  destination alias, month, kind, message ID, and per-option session meanings.
- [ ] AC10 (R11): Given registration recording throws, then the poll is not
  resent, the delivery claim is unchanged, and the failure appears in the job
  output.
- [ ] AC11 (R12): Given a user who selected both `cmi` and a session, then
  stored state retains both, the session's attendance omits that user, and the
  rendered roster contains no `cmi` line.
- [ ] AC12 (R13): Given a member-added Saturday option whose text is not a
  parseable session, then the roster renders it under its own heading with its
  voters.
- [ ] AC13 (R14): Given two configured destinations each with votes on their
  own polls, then neither roster contains the other's attendees.
- [ ] AC14 (R15): Given a monthly run that already delivered a roster for a
  destination and month, when the run is retried with a fresh claim, then no
  second roster message is sent.
- [ ] AC15 (R16): Given a roster is posted, then it is a standalone message and
  the pin request sets `disable_notification` true.
- [ ] AC16 (R17): Given a vote change within the target month, then the roster
  is updated by `editMessageText` and no `sendMessage` request is made.
- [ ] AC17 (R17): Given the target month has ended, when the collection job
  runs, then that month's roster receives no further edit.
- [ ] AC18 (R18): Given a render identical to the last successfully sent text,
  then no `editMessageText` request is made.
- [ ] AC19 (R19): Given a month whose sessions include one with no attendees,
  then the roster lists that session with an empty attendee list.
- [ ] AC20 (R20): Given the most recent successful collection run started at
  14:35 Singapore time, then the roster shows that time in `Asia/Singapore`.
- [ ] AC21 (R21): Given attendance whose named rendering exceeds 4096
  characters, then every attendee list in the roster — sessions and
  unresolved-option headings alike — renders as a count without names, the
  omission notice is present, and the sent text is within 4096 characters.
- [ ] AC22 (R22): Given two attendees whose first names match within one
  destination, then both render with a last initial, and attendees with unique
  first names render without one.
- [ ] AC23 (R23, R26): Given stored state containing a month that ended 61 days
  ago, when the collection job runs, then that month is absent from
  `state/attendance.json` afterwards.
- [ ] AC24 (R25): Given `getUpdates` fails, then the collection job exits
  non-zero.
- [ ] AC25 (R27): Given collection, projection, or a roster edit throws, then
  no `sendPoll` request is made and every poll delivery claim in
  `state/delivered.json` is unchanged.
- [ ] AC26 (R28): Given an error whose text contains the bot token, then the
  logged and persisted text contains `«REDACTED»` in its place.

R24 and R29 are constraints verified by review rather than by an automated
test: R24 governs repository configuration outside the codebase, and R29
governs wording in the roster and `docs/`.
