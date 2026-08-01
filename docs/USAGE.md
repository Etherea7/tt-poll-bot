# Usage

## Preview a month

Preview renders the exact poll payloads a live run would send, and never
contacts Telegram.

```bash
npm run preview                       # target month derived from today in Singapore
node src/main.ts --preview --month 2026-09
```

Holidays come from the live data.gov.sg dataset, falling back to the committed
snapshot. Two flags override that:

```bash
node src/main.ts --preview --month 2026-09 --holidays 2026-09-15   # supply dates by hand
node src/main.ts --preview --month 2026-11 --offline               # force the snapshot path
```

Override the Saturday time slots:

```bash
node src/main.ts --preview --month 2026-05 --slots "10am-12pm,7-9pm"
```

A non-preview invocation exits 2. Sending is deliberately not implemented yet.

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

## Not built yet

The Telegram client, the delivery record that prevents duplicate posts, the run
coordinator, and the scheduled GitHub Actions workflow. See
`specs/001-monthly-telegram-polls/tasks.md`.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Preview rendered; holidays resolved (or the month genuinely has none) |
| 1 | No holiday coverage from either source, or a build/validation failure |
| 2 | Non-preview invocation — sending is not implemented |
