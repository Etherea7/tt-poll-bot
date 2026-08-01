# Usage

## Preview a month

Preview renders the exact poll payloads a live run would send, and never
contacts Telegram.

```bash
npm run preview                       # target month derived from today in Singapore
node src/main.ts --preview --month 2026-09
```

Because holiday sourcing is not built yet, supply holiday dates by hand to
preview the holiday poll and the de-duplication rule:

```bash
node src/main.ts --preview --month 2026-09 --holidays 2026-09-15,2026-09-26
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

## Not built yet

Holiday sourcing from data.gov.sg, the snapshot fallback, the Telegram client,
the delivery record that prevents duplicate posts, and the scheduled GitHub
Actions workflow. See `specs/001-monthly-telegram-polls/tasks.md`.
