# Usage

## Configuration

| Variable | Where it lives | Purpose |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | GitHub **secret** | Bot credential. Masked in logs. Not needed for `--preview`. |
| `TELEGRAM_GROUP_IDS` | GitHub **variable** | Comma-separated destination chat ids. |

Group ids are not credentials, so they live in a repository *variable* — out of
git, but reviewable in the settings UI, which a secret would not be.

## Preview a month

Preview renders the exact poll payloads a live run would send, and never
contacts Telegram. It works without a token.

```bash
TELEGRAM_GROUP_IDS=-1001 npm run preview      # month derived from today in Singapore
TELEGRAM_GROUP_IDS=-1001 node src/main.ts --preview --month 2026-11
```

## Flags

| Flag | Effect |
|---|---|
| `--preview` | Render only; issues no Telegram request |
| `--month YYYY-MM` | Override the target month |
| `--only fridays,saturdays,holidays` | Send a subset |
| `--force` | Resend even if the delivery record says it already went out |
| `--offline` | Skip the live holiday fetch and use the snapshot |
| `--slots "10am-12pm,7-9pm"` | Override the Saturday time slots |

## What gets posted

Scheduled runs execute on the **25th** and target the **following** month, so
members have notice before it begins — including when the 1st is itself a
public holiday.

Three polls, all non-anonymous and multi-select:

| Poll | Question | Options |
|---|---|---|
| Fridays | `Friday TT Sessions @ marymount/bishan/northeast/tampines` | `4 Sep` |
| Saturdays | `Saturday TT Sessions @ marymount/bishan/central/northeast` | `5 Sep, 10am-12pm` |
| Holidays | `Public Holiday TT Sessions` | `15 Sep` |

A public holiday that falls on a Friday or Saturday appears only in that poll,
never twice. A month with no public holidays gets a one-line message instead of
an empty poll.

Only the Saturday poll sets `allow_adding_options`, so members can add a slot
the configuration does not cover. Fridays and holidays are derived dates, so
there is nothing for a member to add.

## Time slots

Slots are configuration, not code. The defaults are `10am-12pm` and `7-9pm`.

**Options grow as dates × slots.** A month with five Saturdays and two slots
produces 10 options against Telegram's maximum of 12. A third slot in a
five-Saturday month needs 15 and is rejected:

```
saturdays poll for May 2026 needs 15 options, exceeding the Telegram maximum
of 12. Reduce the configured time slots or split the poll.
```

This fails before any Telegram request rather than silently dropping sessions
from the poll. If more slots are needed, the poll must be split — most simply,
one poll per time slot with dates as options, which makes growth additive
instead of multiplicative.

## Public holidays

Source of truth is the MOM consolidated dataset on data.gov.sg. Fetching it is
a three-step flow — `initiate-download`, then poll `poll-download` until a
signed URL appears, then download the CSV — rate-limited to about 5 requests a
minute unauthenticated.

`data/holidays.json` is a committed snapshot used whenever the live source
fails, returns a non-2xx status, exceeds the poll budget, or fails schema
validation. **The live source can never withhold the Friday and Saturday
polls**: if neither source covers the target year, those two polls still go out
and the run exits non-zero with the holiday poll skipped.

**Observed days are taken from the dataset, never derived.** The dataset marks
them explicitly, e.g. `2026-11-09, Deepavali (Observed)`. Do not reimplement a
"Sunday → following Monday" rule: in 2022 Labour Day fell on Sunday 1 May,
Monday 2 May was already Hari Raya Puasa, and MOM gazetted the substitute for
**Tuesday 3 May**. `test/holidays.test.ts` guards this.

### Keeping the snapshot fresh

```bash
npm run snapshot:check      # fails if it does not reach 6 months ahead
npm run snapshot:refresh    # regenerate from live, then review the diff and commit
```

The check runs in CI so staleness surfaces during ordinary development rather
than during a scheduled run that has already lost its live source. MOM publishes
the next year around Q3.

## Duplicate protection

`state/delivered.json` maps each target month to the poll kinds already
delivered **to every destination**:

```json
{ "2026-11": ["fridays", "saturdays", "holidays"] }
```

A run sends only the kinds not yet recorded. If all are recorded it sends
nothing and exits 0 — a successful no-op, not a failure. `--force` overrides it.

Tracking is per *kind*, not per month, so recovering from a partially failed
run cannot duplicate a poll that already landed: just re-run, and only the
missing kind goes out. The workflow commits this file even when the send step
failed, for exactly that reason.

## Deploying

1. Create the bot with BotFather. Never put the token in a tracked file.
2. Keep the repository **private** — scheduled workflows are auto-disabled
   after 60 days of inactivity in *public* repositories, which is precisely the
   failure mode of a job that runs twelve times a year.
3. Add the bot to the test group and get that group's numeric id.
4. Set the `TELEGRAM_BOT_TOKEN` secret and the `TELEGRAM_GROUP_IDS` variable to
   the test group only.
5. Dispatch the workflow manually with `preview` left **true** (the default) and
   check the rendered output.
6. Dispatch again with `preview` false to send for real. Verify question text,
   options, that voters are named, and that multi-select works.
7. Confirm `state/delivered.json` was committed, then dispatch the same month
   again and confirm it is skipped with exit 0.
8. Add production group ids only after review.
9. Leave the schedule enabled last.

The scheduled run fires at 09:17 Asia/Singapore on the 25th. GitHub can delay
scheduled workflows under load; that is harmless here because the run happens
six days before the month it describes.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Sent, previewed, or nothing left to send |
| 1 | No holiday coverage from either source, a build failure, or a send failure |

A run that exits non-zero fails the workflow, which is what surfaces the
failure to an operator through GitHub's notification.
