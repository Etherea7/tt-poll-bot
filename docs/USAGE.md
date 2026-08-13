# Usage and rollout

The bot is a short-lived GitHub Actions job. Preview is the default; live
delivery is a two-phase operation that pushes durable claims before Telegram is
contacted.

## Runtime configuration

| Variable | GitHub location | Purpose |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Actions **secret** | BotFather token. Required by `--live` and by attendance collection. |
| `TELEGRAM_DESTINATIONS` | Actions **variable** | Comma-separated `alias=chatId` allow-list. |

Both workflows read the same two values; attendance collection adds no
configuration of its own.

Use a stable lowercase alias beginning with a letter; digits and hyphens may
follow. For one test group:

```text
test=-1001234567890
```

For multiple groups:

```text
test=-1001234567890,club=-1009876543210
```

Aliases are committed in delivery state; numeric chat IDs and the bot token are
not. Aliases and IDs must both be unique.

## CLI modes and flags

Running with no mode flag is a preview. The workflow manages prepare/live mode;
do not run `--live` locally during normal testing.

| Flag | Effect |
|---|---|
| `--preview` | Explicit preview; no Telegram request or state mutation |
| `--prepare --claim ID` | Build all payloads and write pre-send claims |
| `--live --claim ID` | Deliver only claims owned by the same ID |
| `--month YYYY-MM` | Override the target month |
| `--only fridays,saturdays,sundays,holidays` | Narrow poll kinds |
| `--to test,club` | Narrow configured destination aliases |
| `--force` | In prepare mode only, explicitly replace selected state |
| `--offline` | Use the committed holiday snapshot without a live fetch |
| `--slots "10am-12pm,7-9pm"` | Override Saturday slots |

Unknown, repeated, missing, and empty flags are rejected before network
activity. `--force` should be used only after inspecting the selected group and
kind; combine it with both `--to` and `--only` for recovery.

### Local preview

PowerShell:

```powershell
$env:TELEGRAM_DESTINATIONS='test=-1001234567890'
node src/main.ts --month 2026-11 --offline
```

Bash:

```bash
TELEGRAM_DESTINATIONS='test=-1001234567890' node src/main.ts --month 2026-11 --offline
```

No token is required. Omit `--offline` to exercise data.gov.sg without
contacting Telegram.

## Poll output

Scheduled runs execute at 09:17 `Asia/Singapore` on the 25th and target the
following month. Polls are non-anonymous and multi-select.

| Poll | Question | Example option |
|---|---|---|
| Fridays | `Friday TT Sessions @ marymount/bishan/northeast/tampines, 7-10pm` | `4 Sep` |
| Saturdays | `Saturday TT Sessions @ marymount/bishan/central/northeast` | `5 Sep, 10am-12pm` |
| Sundays | `Sunday TT Sessions @ MOE Evans, 5-7pm` | `6 Sep` |
| Holidays | `Public Holiday TT Sessions` | `15 Sep, AM` |

Every poll ends with a `cmi` option, so a member who cannot make any listed
session is distinguishable from one who has not voted yet.

The Friday and Sunday polls carry their single session time in the question, so
their options are bare dates. The Saturday poll expands dates by configured
slots, and the holiday poll expands each date into an `AM` and a `PM` half.

The Saturday poll lets members add options. A holiday already represented by a
Friday, Saturday or Sunday is not repeated. A covered month with zero holidays
receives an informational message; an uncovered year omits holiday work and
exits non-zero rather than making a false no-holidays claim.

The Bot API allows 12 options per poll, and `cmi` spends one of them. Five
Saturdays and the two default slots produce 11. **A third slot no longer fits
any month** — even a 4-Saturday month reaches 13 — and is rejected before
claims or Telegram requests. A month would need six holidays outside Fri/Sat/Sun
to overflow the holiday poll; no month in the committed snapshot does.

## Attendance roster

Votes are turned into a per-session roster so members do not have to tap
through four polls to see who is coming. The roster lives entirely inside
Telegram — there is no web page, database, or second deployment. The reasoning,
including the alternatives rejected, is in
[`ATTENDANCE-DECISION.md`](ATTENDANCE-DECISION.md); the behaviour is specified
in [`specs/004-attendance-roster/spec.md`](../specs/004-attendance-roster/spec.md).

### How it works

1. After posting the month's polls, the monthly job posts **one roster message
   per destination** and pins it without a notification. The roster is claimed
   in `state/delivered.json` like a poll, so a retried run cannot post a second.
2. An hourly **Attendance collection** workflow calls `getUpdates`, applies the
   votes, and edits that same message in place. Editing reuses the message id,
   so the group never receives a new message and nobody is notified.

A vote therefore appears in the roster by the end of the next hourly run. The
roster's last line carries the sync time in `Asia/Singapore`, so a stalled
collection job is visible rather than silent.

```text
TT attendance — November 2026

Fri 6 Nov — Alice, Bob
Fri 13 Nov — nobody yet
Sat 7 Nov, 10am-12pm — Alice, Bob T., Bob W.

updated 14:35 SGT
```

`cmi` is stored but never shown: it is an opt-out, not a session. An option a
member added to the Saturday poll appears under an `Other options` heading with
its voters, since the system cannot know what date it means. If the full roster
would exceed Telegram's 4096-character limit, every attendee list collapses to
a count and the message says names were omitted — it is never truncated.

A run narrowed with `--only` does not post a roster: that scope is for
recovering specific polls.

### Collection job

```bash
npm run collect
```

This contacts Telegram and is normally run only by the workflow. It reads
updates and edits an existing roster message; it has no code path that can post
a new message or send a poll, so it cannot disturb poll delivery. A failed run
exits non-zero and the workflow goes red.

`getUpdates` and `setWebhook` are mutually exclusive, and two concurrent
consumers receive HTTP 409. Never register a webhook for this bot, and never
run a second collector against the same token.

### Attendance state

`state/attendance.json` holds the Telegram offset, poll registrations, votes,
display names, and one record per roster message.

> **The repository must stay private.** This file contains member names,
> Telegram user IDs, and who attends which session. Making the repository
> public would publish all of it.

Months are pruned 60 days after they end, and a member no longer referenced by
any vote is dropped with them. Pruning bounds the working file only — Git
history still holds what it recorded, and the no-force-push policy means that
cannot be rewritten. Treat the retention window as "what the file shows", not
as deletion.

Votes cast before a poll was registered cannot be recovered: Telegram delivers
individual voters as updates and keeps unconsumed ones for 24 hours only. If
the collection workflow is disabled or fails for longer than a day, those
changes are lost and members must re-vote for the roster to catch up.

## Holiday data ingestion

The source is the MOM-managed consolidated public-holiday dataset on
data.gov.sg. The adapter initiates a download, polls for a signed CSV, and then
downloads it. Every request has a 30-second timeout. Dataset API calls are at
least five seconds apart, matching the unauthenticated limit of two calls per
ten seconds; HTTP 429 also honours `retry_after`.

The committed `data/holidays.json` snapshot is used when the live source fails,
is invalid, or does not cover the target year. Observed dates are copied from
MOM and never calculated: in 2022 the Labour Day substitute was Tuesday 3 May,
not the following Monday.

Before deployment:

```bash
npm run snapshot:check
```

The current snapshot contains 104 rows through December 2027. Refresh only when
the check is approaching failure or MOM publishes new years:

```bash
npm run snapshot:refresh
npm test
npm run snapshot:check
```

Review the entire snapshot diff before committing it. A refresh is data
ingestion, not an unattended workflow mutation.

## At-most-once delivery state

`state/delivered.json` stores month, destination alias, kind, and status. Kinds
are the four polls plus `roster`, which is claimed the same way so a retried run
cannot post a second roster message:

```json
{
  "2026-11": {
    "test": {
      "fridays": { "status": "delivered", "claimId": "12345-1" },
      "saturdays": { "status": "claimed", "claimId": "12345-1" }
    }
  }
}
```

The monthly workflow performs this sequence:

1. Build every selected payload and write claims.
2. Commit and push those claims.
3. Send only work owned by that workflow's claim ID.
4. Mark each exact alias/kind delivered after Telegram success.
5. Commit and push delivered state even when a later send fails.

If step 2 fails, step 3 never runs. If Telegram or the final push has an
ambiguous outcome, the already-pushed claim blocks future automatic delivery.
This intentionally prefers a missed poll and operator review over a duplicate
that splits votes.

### Recovering a claimed item

When a run reports an existing or stale claim:

1. Read the month/alias/kind in `state/delivered.json`.
2. Inspect that Telegram group to determine whether the poll or message landed.
3. If it definitely did **not** land, manually dispatch that month with
   `preview=false`, `to=<alias>`, `only=<kind>`, and `force=true`.
4. If it **did** land, change only that entry from `claimed` to `delivered`,
   preserving its `claimId`, and merge that state correction through the normal
   protected-branch process.

Never use an unscoped force retry after an ambiguous result.

## Deployment and live test-group rollout

1. Create a bot with BotFather and save its token outside the repository.
2. Add the bot to a dedicated test group. Allow it to send messages and polls.
3. Send a command addressed to the bot in the group, then use the official
   Bot API `getUpdates` method from a private terminal session to identify the
   group's negative numeric chat ID. Do not paste the response into an issue or
   commit.
4. In GitHub repository settings, add Actions secret `TELEGRAM_BOT_TOKEN` and
   Actions variable `TELEGRAM_DESTINATIONS=test=<negative-chat-id>`.
5. Under Actions settings, grant the workflow token read/write repository
   permission. Ensure the default-branch rules allow the Actions bot to push
   the small `state/` commits; the pre-send push safely stops delivery if they
   do not.
6. Keep only the test alias configured. Run CI and require green tests, lint,
   typecheck, and snapshot freshness.
7. Dispatch **Monthly polls** for a future unused month with `preview=true`.
   Verify all wording, dates, slot combinations, deduplication, and that no
   state file changed.
8. Dispatch the same month with `preview=false`. Watch the workflow order:
   prepared-claim push must succeed before **Send claimed polls** starts.
9. In Telegram, verify exactly four items (or a no-holiday notice where
   appropriate), named voters, multi-select, the trailing `cmi` option on every
   poll, and Saturday add-option behaviour.
10. In GitHub, verify `state/delivered.json` contains only alias `test`, all
    expected kinds are `delivered`, and no numeric chat ID appears in the file.
11. Dispatch the same live month again. It must report nothing to prepare/send
    and create no duplicate Telegram item.
12. Enable the schedule only after the replay check. Add another group later by
    appending a new alias mapping, previewing with `to=<new-alias>`, and repeating
    the live test for that alias before including it in scheduled runs.

### Enabling the attendance roster

Do this only after the poll rollout above is verified, and only on a **private**
repository.

1. Confirm the bot can pin messages in the group. If it cannot, the roster is
   still posted and updated; it simply is not pinned, and the failure is
   reported in the run output.
2. Confirm no webhook is registered for the bot. `getUpdates` will otherwise
   fail and no votes will ever be collected.
3. After the next live monthly dispatch, check that the group contains one
   pinned roster message and that `state/attendance.json` lists the polls and
   one roster per destination.
4. Vote in the test group, wait for the hourly **Attendance collection** run,
   and verify the roster message was edited — not re-sent — and that its sync
   time advanced.
5. Change and then fully retract a vote. The name must move between sessions
   and then disappear entirely.
6. Confirm a `cmi` vote leaves the member out of every session and adds no line
   to the roster.

Also enable GitHub Actions failure notifications for the repository. A non-zero
exit is the operator signal for uncovered holiday data, a blocked claim,
configuration/build failure, Telegram failure, or a failed collection run.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Previewed, prepared, delivered, or nothing selected remains |
| 1 | Uncovered holiday data, stale claim, invalid input/build, or transport failure |

Attendance collection uses the same codes: 0 when updates were applied (or
there were none), 1 for a failed `getUpdates`, a failed roster edit, unreadable
state, or missing configuration. A failed registration during the monthly job
does **not** fail that job — attendance is optional, poll delivery is not — but
it is reported in the run output.
