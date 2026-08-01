---
id: 002-deployment-safety
title: Deployment-safe delivery and input hardening
status: ready
created: 2026-08-01
updated: 2026-08-01
parent: 001-monthly-telegram-polls
children: []
related: [000-bootstrap]
---

# Deployment-safe delivery and input hardening

## Problem

The initial implementation passes its automated suite but is not safe to deploy.
Delivery state is shared across destinations, Telegram outcomes that may be
ambiguous are retried, and state is pushed only after live sends. Together,
those behaviours can duplicate a poll. Holiday coverage and CLI parsing also
have failure paths that can publish misleading output or accept malformed live
commands.

## Goals

- Preserve the constitutional at-most-once preference across multiple groups,
  workflow crashes, and Git push failures.
- Never commit Telegram chat identifiers while keeping delivery state readable
  and independently recoverable per configured destination.
- Keep Friday and Saturday delivery available when holiday coverage is absent,
  without claiming that an uncovered month has no holidays.
- Reject malformed or accidentally live invocations before any Telegram call.
- Make the GitHub Actions path suitable for a test-group deployment and an
  operator-observed manual run.

## Non-goals

- Exactly-once delivery; Telegram provides no idempotency key for `sendPoll`.
- Automatic resend after an ambiguous outcome. An operator must inspect the
  target group before explicitly resolving or forcing that destination/kind.
- Self-service destination registration or inbound Telegram commands.
- Adding a database, service, or runtime dependency.
- Configuring a production Telegram group during this work item.

## Requirements

- R1. Runtime destination configuration SHALL use unique, non-secret aliases
  mapped to Telegram chat identifiers, and only aliases SHALL appear in the
  committed delivery record or logs.
- R2. Delivery state SHALL track each target month, destination alias, and poll
  kind independently.
- R3. WHEN one destination succeeds and a later destination fails, a subsequent
  run SHALL NOT automatically resend the successful destination/kind.
- R4. WHEN a destination is added after a month was delivered elsewhere, the
  new destination SHALL remain independently eligible for that month's polls.
- R5. BEFORE any Telegram request, a live workflow SHALL persist and push a
  claim for every intended destination/kind using the current workflow run's
  claim identifier.
- R6. A live execution SHALL send only claims owned by its supplied claim
  identifier. Existing claims owned by another run SHALL stop automatic
  delivery and require explicit operator recovery.
- R7. WHEN Telegram reports success, local state SHALL mark that exact
  destination/kind delivered. IF the post-send state push fails, the durable
  pre-send claim SHALL continue to block an automatic retry.
- R8. Telegram HTTP 429 responses MAY be retried after `retry_after`; HTTP 5xx,
  timeouts, and generic fetch failures SHALL be treated as ambiguous and SHALL
  NOT be retried automatically.
- R9. Preview SHALL be the default CLI mode. Telegram delivery SHALL require an
  explicit `--live` flag, and claim creation SHALL require `--prepare` plus a
  non-empty claim identifier.
- R10. The CLI SHALL reject unknown flags, missing flag values, empty `--only`
  and `--slots` values, duplicate or empty destination aliases, duplicate chat
  identifiers, and mutually exclusive mode flags before network activity.
- R11. WHEN live holiday data is valid but does not cover the target year, the
  resolver SHALL use a covering committed snapshot before declaring the year
  uncovered.
- R12. WHEN neither holiday source covers the target year, the run SHALL omit
  both the holiday poll and the no-holidays message, continue with Friday and
  Saturday work, and exit non-zero.
- R13. Data.gov.sg requests SHALL have bounded per-request timeouts and API
  polling SHALL respect the unauthenticated Dataset Downloads quota of two
  calls per ten seconds, including HTTP 429 handling.
- R14. The monthly workflow SHALL use current major versions of official
  checkout/setup actions, SHALL avoid persisted checkout credentials while
  installing dependencies, and SHALL not make a Telegram request unless its
  pre-send state push succeeds.
- R15. IF a state push is rejected by permissions, branch protection, or a
  concurrent update, the workflow SHALL fail with no new live request in the
  pre-send phase, or retain a durable claim that blocks retry in the post-send
  phase.
- R16. Maintained usage docs, specification wording, work-item status, and the
  generated specs index SHALL describe the implemented behaviour and current
  repository state without stale rollout claims.

## Acceptance criteria

- AC1 (R1, R2): Given aliases `test` and `club`, persisted JSON contains those
  aliases and per-kind statuses, and contains neither configured chat ID.
- AC2 (R3): Given `test/fridays` succeeds and `club/fridays` fails, the next
  automatic run issues no Friday request to `test`.
- AC3 (R4): Given `test` delivered all kinds and `club` is newly configured,
  `club` remains pending while `test` does not.
- AC4 (R5, R6): Given a prepare phase with claim `run-1`, state is written
  before transport; execution with `run-2` sends nothing and exits non-zero.
- AC5 (R7, R15): Given a successful Telegram response followed by an
  unavailable state push, repository state still contains the pre-send claim
  and a later run does not automatically resend it.
- AC6 (R8): Given one response/error of each relevant class, only HTTP 429 is
  retried; 5xx, timeout, and generic fetch failures each make one request.
- AC7 (R9, R10): Table-driven malformed CLI cases all throw before holiday or
  Telegram fetches, while a valid preview requires no token.
- AC8 (R11): Given live rows outside the target year and a covering snapshot,
  the snapshot's target holidays are returned with coverage true.
- AC9 (R12): Given no coverage, preview and live payload collections contain
  Friday and Saturday work but no holiday work or no-holidays message, and the
  outcome exits one.
- AC10 (R13): Fake-timer/fetch tests observe a request timeout, at least five
  seconds between quota-counted API calls, and `retry_after` handling.
- AC11 (R14, R15): Workflow inspection and a dry mocked sequence establish
  prepare -> commit/push -> live -> commit/push ordering and checkout credential
  persistence is disabled.
- AC12 (R16): Documentation and manifest checks contain no superseded global
  delivery-state, following-Monday, five-requests-per-minute, or unimplemented
  rollout statements.

## Decisions

- 2026-08-01 At-most-once delivery wins over automatic recovery, following the
  project constitution and the owner's approved cleanup list.
- 2026-08-01 Destination aliases replace the comma-only ID list. This makes
  state diagnosable without committing identifiers and supports adding groups
  without changing the state schema.
- 2026-08-01 Git remains the state store. A two-phase claim/send workflow closes
  the post-send persistence gap without adding infrastructure.
- 2026-08-01 Claims are tied to a workflow-supplied identifier. A stale claim is
  deliberately an operator stop, not permission for a new run to guess.
- 2026-08-01 Only a Telegram 429 response is automatically retryable. The
  Fetch API does not expose enough transport detail to prove that generic
  connection errors or 5xx responses could not have delivered.
- 2026-08-01 Consistency pass: 8/8 checks passed; every goal maps to R1-R16,
  every requirement maps to AC1-AC12, and no consequential question remains.

## Open questions

None. Live test-group results may refine operational wording without changing
the safety contract.
