# tt-tele-poll — Monthly Telegram Availability Polls

This project posts **three availability polls** to your Telegram group(s)
automatically, once a month, without anyone having to remember to do it.

On the **25th of every month**, it posts polls covering the **following** month:

| Poll | Asks about |
|---|---|
| 🏓 **Fridays** | Every Friday next month |
| 🏓 **Saturdays** | Every Saturday next month, split by time slot |
| 🏓 **Public Holidays** | Every Singapore public holiday next month |

It runs on **GitHub Actions**, which is a free robot that lives inside this
repository and does jobs on a timer. You do not need to leave your computer on.
You do not need to install anything. Once it is set up, it just works.

> **New here? Read this first.** You only need to do the setup **once**
> (Steps 1–5 below). After that, the only thing you will ever click is
> "Run workflow", and even that is optional.

---

## Table of contents

1. [What you need before you start](#what-you-need-before-you-start)
2. [Step 1 — Create the Telegram bot](#step-1--create-the-telegram-bot)
3. [Step 2 — Add the bot to your group](#step-2--add-the-bot-to-your-group)
4. [Step 3 — Find your group's chat ID](#step-3--find-your-groups-chat-id)
5. [Step 4 — Save the token and chat ID into GitHub](#step-4--save-the-token-and-chat-id-into-github)
6. [Step 5 — Test safely before going live](#step-5--test-safely-before-going-live)
7. [How the automation works](#how-the-automation-works)
8. [Running the polls manually](#running-the-polls-manually)
9. [Understanding the output](#understanding-the-output)
10. [Troubleshooting](#troubleshooting)
11. [Things that are safe vs. things to be careful with](#things-that-are-safe-vs-things-to-be-careful-with)
12. [For developers](#for-developers)

---

## What you need before you start

Two pieces of information. That's it.

| # | What | Looks like | Where it gets stored in GitHub | Secret? |
|---|---|---|---|---|
| 1 | **Bot token** | `8123456789:AAH7x9k-QwEr…` (long) | Actions **secret** named `TELEGRAM_BOT_TOKEN` | 🔴 **Yes — never share** |
| 2 | **Group chat ID** | `-1001234567890` | Actions **variable** named `TELEGRAM_GROUP_IDS` | 🟢 No, but keep it private |

**Why is one a "secret" and the other a "variable"?**

- The **token** is a password. Anyone who has it can post to your groups as the
  bot. GitHub hides secrets forever — once you save it, even you cannot read it
  back, and it is automatically blanked out (`***`) in any log.
- The **chat ID** is just an address, not a password. Knowing it doesn't let
  anyone post anything. It is stored as a *variable* so you can actually **see
  and check it** later in the settings page. If it were a secret you could never
  confirm you typed it correctly, which makes fixing a typo miserable.

You also need to be an **admin of the GitHub repository** (so you can open
Settings) and an **admin of the Telegram group** (so you can add a bot).

---

## Step 1 — Create the Telegram bot

A "bot" is just a robot account that posts the polls. You make one by chatting
with Telegram's official bot-making bot.

1. Open Telegram and search for **`@BotFather`**.
   ✅ Make sure it has the **blue verified checkmark**. There are fake copies.
2. Tap **Start**.
3. Send: `/newbot`
4. It asks for a **name**. This is the display name members will see.
   Example: `TT Session Polls`
5. It asks for a **username**. This must be unique and **must end in `bot`**.
   Example: `tt_session_polls_bot`
   If it says the name is taken, just try another one.
6. BotFather replies with a message containing your token:

   ```
   Done! Congratulations on your new bot.
   Use this token to access the HTTP API:
   8123456789:AAH7x9k-QwErTyUiOpAsDfGhJk…      ← yours will be longer
   ```

7. **Copy that long token and keep it somewhere safe for the next few minutes.**

> ⚠️ **Treat the token like your bank PIN.**
> Do not paste it into a group chat, an email, a screenshot, or any file in this
> project. If it ever leaks, go back to `@BotFather`, send `/revoke`, pick your
> bot, and it will hand you a brand-new token. Then update the GitHub secret.

---

## Step 2 — Add the bot to your group

The bot cannot post to a group it isn't a member of.

1. Open your Telegram group.
2. Tap the **group name** at the top → **Add Members** (or **Add Member**).
3. Search for your bot's **username** (e.g. `tt_session_polls_bot`) and add it.
4. **Recommended: make the bot an admin.**
   Group name → **Administrators** → **Add Admin** → pick your bot.

**Do I really have to make it an admin?** Not always, but do it anyway. Some
groups restrict ordinary members from sending polls, and when that is switched
on a non-admin bot fails with a confusing permissions error. Making it an admin
sidesteps the whole problem. The bot only needs **"Send Messages"** — you can
untick every other admin permission if you want to keep it locked down.

---

## Step 3 — Find your group's chat ID

Every Telegram group has a hidden numeric ID, like `-1001234567890`. This is how
the robot knows *which* group to post to. Telegram does not show it in the app,
so you have to ask for it.

**Group IDs are always negative** (they start with a minus sign). Larger groups
and any group that has been upgraded to a "supergroup" have IDs starting with
**`-100`**. If the number you found is positive, you've got a *personal* chat ID,
not a group — that's the wrong one.

Pick whichever method below you find easiest. **Method A is the easiest.**

### Method A — Use a helper bot (easiest, no token needed)

The idea: temporarily add a bot whose only job is to tell you the ID, read the
number, then remove it.

1. In your group: **Add Members** → search for one of these → add it:

   | Helper bot | How to get the ID from it |
   |---|---|
   | **`@getidsbot`** | Send `/id` in the group |
   | **`@RawDataBot`** | Dumps the info automatically the moment it joins |
   | **`@raw_data_bot`** | Same as above (alternative if the one above is down) |
   | **`@username_to_id_bot`** | Send `/id` in the group |

2. Look for the `chat` section in what it replies:

   ```json
   "chat": {
     "id": -1001234567890,
     "title": "TT Sessions",
     "type": "supergroup"
   }
   ```

3. Your chat ID is the `"id"` value: **`-1001234567890`** — **include the minus sign**.

4. **Remove the helper bot from the group.** It has done its job, and it is run
   by a stranger, so there's no reason to leave it able to read your group.

> ⚠️ **These are third-party bots and they come and go.** If one doesn't respond
> within a minute, remove it and try the next in the list. If none of them work,
> use **Method B** — it talks only to Telegram's official servers, so it cannot
> stop working.

### Method B — Use your own bot and a web browser

This one uses no third-party bot, but there's a catch you must know about.

1. **In your Telegram group, send this exact message** (replace with your bot's
   username):

   ```
   /start@tt_session_polls_bot
   ```

   > 🔑 **This step is the one everybody gets wrong.** By default, Telegram bots
   > are in "privacy mode", which means they are **deliberately blind to normal
   > group chatter** — they can only see messages that are commands aimed
   > directly at them. If you just say "hello" in the group, the next step will
   > show you an empty result and you'll think it's broken. Sending
   > `/start@yourbotname` is a command aimed at your bot, so it gets through.

2. Open a **web browser** and go to this address, pasting your token in place of
   `<YOUR_TOKEN>`:

   ```
   https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates
   ```

   The finished address looks like:
   `https://api.telegram.org/bot8123456789:AAH7x9k-QwEr.../getUpdates`

   ⚠️ Note there is **no space and no colon** between the word `bot` and your
   token — it's `/bot8123456789:AAH...`, all run together.

3. You'll see a page of raw text. Look for `"chat":{"id":-1001234567890`.
   That negative number is your chat ID.

4. **Close the browser tab when you're done.** That address contains your token.
   Don't bookmark it, and don't leave it in your history if you share the computer.

**Got `{"ok":true,"result":[]}` (an empty result)?** The list is empty. Causes,
in order of likelihood:

- You sent a plain message instead of `/start@yourbotname` → see the warning above.
- You added the bot to the group *after* sending the message → send the command again.
- Something else already collected the updates → send the command again and refresh.

### Method C — Posting to more than one group

`TELEGRAM_GROUP_IDS` is plural on purpose. To post the same polls to several
groups, repeat Method A or B for each group and join the IDs with **commas and
no spaces**:

```
-1001234567890,-1009876543210,-1005555555555
```

Every poll goes to every listed group. There is no way to send different polls to
different groups.

---

## Step 4 — Save the token and chat ID into GitHub

Now you put both values into GitHub so the robot can use them. **You never put
these into a file** — they go into GitHub's settings screens, which is a
different, protected place.

### 4a. Save the bot token (as a *secret*)

1. Go to your repository on GitHub.
2. Click **⚙️ Settings** (top row of tabs, on the far right).
3. In the left sidebar: **Secrets and variables** → **Actions**.
4. Make sure you're on the **Secrets** tab.
5. Click **New repository secret**.
6. Fill it in **exactly** like this:
   - **Name:** `TELEGRAM_BOT_TOKEN`
     *(all capitals, underscores not spaces — it must match character for character)*
   - **Secret:** paste your token from Step 1
7. Click **Add secret**.

You will now see `TELEGRAM_BOT_TOKEN` listed, with no way to view its value.
That's correct and intentional. If you ever need to change it, click the pencil
✏️ and enter the new value.

### 4b. Save the chat ID (as a *variable*)

1. Same page, but click the **Variables** tab (right next to "Secrets").
2. Click **New repository variable**.
3. Fill it in:
   - **Name:** `TELEGRAM_GROUP_IDS`
   - **Value:** your chat ID from Step 3, e.g. `-1001234567890`
     *(for several groups, comma-separated, no spaces)*
4. Click **Add variable**.

### Check your work

Your settings page should now show:

| Tab | Name | Value |
|---|---|---|
| Secrets | `TELEGRAM_BOT_TOKEN` | *(hidden — correct)* |
| Variables | `TELEGRAM_GROUP_IDS` | `-1001234567890` |

Common mistakes to check for:

- ❌ Token saved as a *variable* instead of a *secret* → **delete it immediately
  and re-add it as a secret**, then revoke and regenerate the token with
  `/revoke` in BotFather, because it may have been recorded in a log.
- ❌ Name typed as `TELEGRAM_GROUP_ID` (missing the **S**) — the names must match exactly.
- ❌ The minus sign dropped from the chat ID.
- ❌ Extra spaces around the value.

### 4c. Let the robot save its memory file

The job needs to write `state/delivered.json` back into the repository — that's
the memory file that stops it posting twice. Check this permission is on:

1. **Settings** → **Actions** (left sidebar) → **General**.
2. Scroll right to the bottom, to **Workflow permissions**.
3. Select **Read and write permissions**.
4. Click **Save**.

> **Also: don't put branch protection rules on your main branch here.** If the
> robot is blocked from pushing, the polls still get sent but the memory file
> never saves — so the protection against double-posting quietly stops working.
> You'd see a red ❌ on a run that actually *did* post. For a small private repo
> like this one, leave branch protection off.

### One more thing: keep the repository **private**

Go to **Settings → General**, scroll to the bottom, and confirm the repository is
**Private**.

This matters more than it sounds: GitHub **automatically switches off scheduled
workflows in public repositories after 60 days without activity**. This job runs
twelve times a year and otherwise sits quiet, so in a public repo it would
silently disable itself and the polls would just stop appearing, with no error and
no notification. A private repo is not subject to that rule.

---

## Step 5 — Test safely before going live

**Do not point this at your real group first.** Follow this order and nothing can
embarrass you.

1. **Create a throwaway Telegram group.** Add just yourself and the bot.
2. Get *that* group's chat ID (Step 3) and set `TELEGRAM_GROUP_IDS` to it.
3. **Run a preview** (Step-by-step in the next section) — leave the **preview**
   box **ticked**. This shows you the exact polls it *would* send, and contacts
   Telegram not at all. Nothing is posted.
4. Read the output. Are the dates right? Is the wording right?
5. **Run it for real** — same steps, but **untick preview**. Check your test
   group:
   - Do all three polls appear?
   - Can you **select more than one date**? (multi-select is on)
   - Can you see **who voted**? (the polls are deliberately *not* anonymous, so
     you can tell who's coming)
6. **Run it a second time for the same month.** It should say
   `nothing to do: ... already delivered` and post nothing. This proves the
   duplicate protection works.
7. **Only now** change `TELEGRAM_GROUP_IDS` to your real group ID.
8. Leave the schedule alone — it's already on, and will fire on the 25th.

---

## How the automation works

### The schedule

```
Every month on the 25th, at 09:17 Singapore time
```

**Why the 25th?** So members get roughly a week's notice before the month starts.
If the polls only appeared on the 1st, and the 1st happened to be a public
holiday, nobody would have had time to plan.

**Why 9:17 and not 9:00?** GitHub runs *everybody's* scheduled jobs at the top of
the hour, so that window is congested and jobs get delayed. An odd minute avoids
the queue. Even so, **GitHub may still delay a scheduled run by up to a few
hours** — that is normal and completely harmless here, because the polls are
about a month that is still six days away.

### What happens on each run

```
     ┌─────────────────────────────────────────────────────┐
     │  1. What month are we posting for?                  │
     │     Today in Singapore → the FOLLOWING month        │
     └────────────────────────┬────────────────────────────┘
                              ▼
     ┌─────────────────────────────────────────────────────┐
     │  2. Did we already post this month?                 │
     │     Checks state/delivered.json                     │
     │     If everything already sent → stop, all good ✅   │
     └────────────────────────┬────────────────────────────┘
                              ▼
     ┌─────────────────────────────────────────────────────┐
     │  3. Look up Singapore public holidays               │
     │     Live from data.gov.sg, and if that's down,      │
     │     falls back to the saved copy in data/           │
     └────────────────────────┬────────────────────────────┘
                              ▼
     ┌─────────────────────────────────────────────────────┐
     │  4. Build ALL three polls — before sending any      │
     │     If anything is wrong, it stops here having      │
     │     posted nothing, rather than posting half        │
     └────────────────────────┬────────────────────────────┘
                              ▼
     ┌─────────────────────────────────────────────────────┐
     │  5. Send them, ticking each one off as it lands     │
     └─────────────────────────────────────────────────────┘
```

### Why it can't post twice

This is the part worth understanding, because it's what lets you re-run the job
without fear.

The repository contains a small memory file, **`state/delivered.json`**, that
looks like this:

```json
{
  "2026-11": ["fridays", "saturdays", "holidays"]
}
```

Before sending anything, the job reads this file and **skips whatever is already
listed**. After each poll successfully lands in every group, it immediately adds
that poll to the file and saves it.

Notice it tracks each poll **individually**, not just "November: done". That's
deliberate. Imagine Telegram goes down halfway through: Fridays and Saturdays
posted fine, then Holidays failed. The file will say
`"2026-11": ["fridays", "saturdays"]`. When you re-run it, **only the Holidays
poll is sent** — the two that already landed are not repeated.

The job commits this file back to the repository **even when the run failed**,
precisely so that recovery works. You'll see automatic commits titled
`chore(state): record delivered polls [skip ci]`. That's the robot, and it's
normal.

### Why a duplicate is treated as worse than a miss

If a request to Telegram times out *after* it was sent, the job **does not retry
it**. It cannot know whether the poll arrived, and a group getting the same poll
twice is more annoying and harder to clean up than a poll that's missing — which
you can notice and re-run. So it stops and reports instead of guessing.

It *does* automatically retry when it's certain nothing was delivered: when
Telegram says "too many requests" (it waits exactly as long as Telegram asks), or
when the connection failed before Telegram ever answered.

---

## Running the polls manually

You'll want this when you're testing, when you want to see next month early, or
when something failed and you're re-running it.

### How to open it

1. Go to the repository on GitHub.
2. Click the **Actions** tab (top of the page).
3. In the **left sidebar**, click **Monthly polls**.
4. On the right, click the grey **Run workflow ▾** button.
5. A small form drops down. Fill it in (see below) and click the green
   **Run workflow** button.
6. Wait ~30 seconds, then **refresh the page**. Your run appears in the list.
   Click it, then click **post**, then click **Send polls** to read the output.

### The form, explained

| Field | What to put | What happens |
|---|---|---|
| **Use workflow from** | Leave as `main` | Which version of the code to run |
| **Target month (YYYY-MM)** | Usually **leave blank** | Blank = next month, worked out automatically. Type `2026-11` to force a specific month. Must be `YYYY-MM` with a dash. |
| **Render without contacting Telegram** | ☑️ **ticked by default** | **This is the safety catch.** Ticked = a dry run that shows you the polls but sends nothing. **Untick it to actually post.** |
| **Comma-separated subset** | Usually **leave blank** | Blank = all three polls. Type `holidays` to send only that one. Valid words: `fridays`, `saturdays`, `holidays`. |
| **Resend even if already delivered** | ☐ **leave unticked** | Overrides the duplicate protection. Only tick this if you genuinely want the group to receive a poll a second time. |

> 🛑 **The single most important thing on this page:**
> **"Render without contacting Telegram" is TICKED by default.**
> That default is deliberate — it means an accidental click can never spam your
> group. It also means that if you *wanted* to post and nothing appeared in
> Telegram, you almost certainly left this ticked. Untick it and run again.

### Common things you might want to do

| I want to… | Month | Preview | Subset | Force |
|---|---|---|---|---|
| See what next month's polls will look like | *blank* | ☑️ ticked | *blank* | ☐ |
| Check a specific month, e.g. Nov 2026 | `2026-11` | ☑️ ticked | *blank* | ☐ |
| Actually post next month's polls right now | *blank* | ☐ **unticked** | *blank* | ☐ |
| Re-run after a partial failure | *same month* | ☐ unticked | *blank* | ☐ |
| Re-send only the holidays poll after fixing it | *same month* | ☐ unticked | `holidays` | ☑️ |

Note the fourth row: for an ordinary recovery you do **not** need Force. The
memory file already knows which polls landed, so a plain re-run sends only what's
missing. Reach for Force only when you deliberately want a repeat.

---

## Understanding the output

Click into a run → **post** → **Send polls** to see this.

### A preview run (nothing was sent)

```
target month: November 2026
[poll: fridays] Friday TT Sessions @ marymount/bishan/northeast/tampines
  - 6 Nov
  - 13 Nov
  - 20 Nov
  - 27 Nov
[poll: saturdays] Saturday TT Sessions @ marymount/bishan/central/northeast
  - 7 Nov, 10am-12pm
  - 7 Nov, 7-9pm
  - 14 Nov, 10am-12pm
  - 14 Nov, 7-9pm
  - 21 Nov, 10am-12pm
  - 21 Nov, 7-9pm
  - 28 Nov, 10am-12pm
  - 28 Nov, 7-9pm
[poll: holidays] Public Holiday TT Sessions
  - 8 Nov
  - 9 Nov
preview only — no Telegram request was made.
```

That last line is your guarantee that nothing reached Telegram.

*(8 and 9 November are Deepavali and its observed public holiday — Deepavali
falls on a Sunday in 2026, so the Monday is gazetted as a holiday too.)*

### A real run

```
target month: November 2026
sent fridays to 1 destination(s)
sent saturdays to 1 destination(s)
sent holidays to 1 destination(s)
```

### A run where there was nothing to do

```
target month: November 2026
nothing to do: November 2026 already delivered (fridays, saturdays, holidays)
```

**This is a success, not a failure.** The run finishes green. It means the
protection did its job.

### A month with no public holidays

```
target month: September 2026
[message: holidays] No public holidays in September 2026.
```

Instead of an empty poll, the group gets a plain sentence. This is on purpose:
if the job sent nothing at all, you'd have no way to tell "there genuinely are no
holidays" apart from "the holiday lookup is broken".

> 🤔 **A surprise worth knowing about.** December 2026 also reports *"No public
> holidays"* — even though Christmas is obviously in December. That's correct
> behaviour: **25 December 2026 falls on a Friday**, so it's already offered in
> the Fridays poll. No date is ever asked about twice across the three polls. The
> same goes for a holiday landing on a Saturday.

### The green tick vs. the red cross

| Result | Meaning |
|---|---|
| ✅ Green | Polls sent, or previewed, or there was nothing left to send |
| ❌ Red | Something went wrong — open the run and read the last few lines |

A red cross emails you (assuming GitHub notifications are on). That's the
intended alarm: nobody is watching this job, so a failure has to shout.

---

## Troubleshooting

### "I ran it but nothing appeared in Telegram"

Work down this list in order:

1. **Was "Render without contacting Telegram" ticked?** It's ticked by default.
   This is the cause about nine times out of ten. Look for
   `preview only — no Telegram request was made.` in the output.
2. **Does the output say `nothing to do: ... already delivered`?** Then those
   polls went out on an earlier run. Check your group's history.
3. **Is the bot actually in the group?** Open the group's member list and look.
4. **Is `TELEGRAM_GROUP_IDS` the right group?** Easy to paste a test group's ID
   and forget.

### Error messages and what they mean

| What you see in the log | What it means | How to fix it |
|---|---|---|
| `TELEGRAM_GROUP_IDS must list at least one destination chat id` | The variable is missing, empty, or misspelled | Redo Step 4b. Check for the **S** on the end of the name. |
| `TELEGRAM_BOT_TOKEN is required for a live run` | The secret is missing or misspelled | Redo Step 4a. |
| `sendPoll failed with 400: ... chat not found` | The chat ID is wrong, or the bot isn't in that group | Redo Step 3. Confirm the minus sign survived the copy-paste. |
| `sendPoll failed with 403: ... bot was kicked from the group chat` | Someone removed the bot | Re-add it (Step 2). |
| `sendPoll failed with 403: ... not enough rights to send polls` | The group forbids members from sending polls | Make the bot an **admin** (Step 2, point 4). |
| `sendPoll failed with 401: Unauthorized` | The token is wrong or was revoked | Generate a fresh token in BotFather and update the secret. |

*(The wording after the number comes from Telegram itself and may differ slightly
— usually prefixed `Bad Request:` or `Forbidden:`. Match on the number and the
general sense.)*
| `chat -100... has migrated to supergroup -100...; update the configured group id` | Telegram upgraded your group, which **changes its ID** | Copy the **new** ID from the message into `TELEGRAM_GROUP_IDS`, then re-run. |
| `sendPoll timed out after the request was sent; outcome unknown, not retrying` | It may or may not have posted | **Check the group with your own eyes first.** If the poll is there, do nothing. If not, re-run. |
| `... needs 15 options, exceeding the Telegram maximum of 12` | Too many Saturdays × too many time slots | See [Time slots](#a-note-on-time-slots) below. |
| `no holiday coverage for 2030; Friday and Saturday polls are unaffected` | The holiday list doesn't reach that year yet | The Friday/Saturday polls still went out. A developer needs to refresh the holiday data. |

### "The polls were sent, but the run is red ❌"

Look at which step failed. If the **Send polls** step is green and the **Commit
delivery record** step is red, the polls went out fine but the robot couldn't
save its memory file. Look for `permission denied` or `protected branch` in that
step's log, then fix the write permission (Step 4c). Until you do, re-running the
same month **would** post duplicates, because the record of what was sent never
got saved.

### "It posted twice!"

There are only two ways this can happen:

1. **Force** was ticked. Check the run history in the Actions tab — the run that
   used Force shows its inputs.
2. **The memory file isn't saving.** See the entry directly above this one, and
   check Step 4c.

### "The scheduled run didn't happen on the 25th"

- **Give it a few hours.** GitHub delays scheduled jobs under load. Harmless here.
- **Check the repository is still private** and has had activity — see the
  60-day auto-disable warning in Step 4.
- **Check the Actions tab isn't disabled** — Settings → Actions → General.
- Worst case, just [run it manually](#running-the-polls-manually). Same result.

### A note on time slots

Saturday options are every **date × every time slot**. Telegram caps a poll at
**12 options**. A month with five Saturdays and two slots is 5 × 2 = 10, which
fits. Add a third slot and it's 5 × 3 = 15, which does not.

When that happens the job **refuses to send anything** rather than quietly
dropping sessions off the end of the poll, and tells you the numbers. Fixing it
means either using fewer slots or splitting into separate polls, which is a
developer change — see [`docs/USAGE.md`](docs/USAGE.md).

---

## Things that are safe vs. things to be careful with

### ✅ Completely safe — do these freely

- Running with **preview ticked**, as often as you like. It cannot post.
- Re-running a failed run. Duplicate protection has your back.
- Previewing any month, past or future.
- Reading logs and sharing them. The token is protected twice over: GitHub
  automatically replaces any registered secret with `***`, and the code strips
  the token out of its own error messages before printing them.

### ⚠️ Think first

- **Unticking preview** — this posts to the real group.
- **Ticking Force** — this deliberately bypasses duplicate protection.
- **Changing `TELEGRAM_GROUP_IDS`** — double-check before saving; there's no undo.

### 🛑 Never do these

- **Never** put the bot token in a file, a commit, an issue, a message, or a
  screenshot. It belongs in exactly one place: the GitHub Actions secret.
- **Never** make this repository public while the schedule is live.
- **Never** hand-edit `state/delivered.json` unless you know exactly what you're
  doing — it is the only thing standing between you and a duplicate post.

### If the token leaks

Don't panic, and do this immediately:

1. Open `@BotFather` → `/revoke` → choose your bot. **The old token dies instantly.**
2. Copy the new token BotFather gives you.
3. Update the `TELEGRAM_BOT_TOKEN` secret in GitHub (Step 4a, pencil icon).

Nothing else needs changing — the chat IDs, the group, and the bot itself all
stay exactly as they are.

---

## For developers

Full technical documentation is in **[`docs/USAGE.md`](docs/USAGE.md)**.
Behavioural requirements (R1–R41) live in
[`specs/001-monthly-telegram-polls/spec.md`](specs/001-monthly-telegram-polls/spec.md).
Project rules and constraints are in [`AGENTS.md`](AGENTS.md).

### Quick start

```bash
npm ci                                     # install
npm test                                   # run the test suite
npm run lint                               # Biome check
npm run typecheck                          # tsc --noEmit

TELEGRAM_GROUP_IDS=-1001 npm run preview   # render without contacting Telegram
```

### Notable constraints

- **Node.js 24+**, run directly from TypeScript via native type stripping.
  There is **no build step** — no bundler, no `dist/`, no `ts-node`.
- **Zero runtime dependencies.** `dependencies` in `package.json` is empty and
  stays empty. Only `typescript`, `@biomejs/biome`, and `@types/node` are allowed
  as devDependencies.
- **Erasable syntax only** (`erasableSyntaxOnly`): no `enum`, no decorators, no
  constructor parameter properties.
- **Relative imports need explicit `.ts` extensions** — `import { x } from './calendar.ts'`.

### Command-line flags

| Flag | Effect |
|---|---|
| `--preview` | Render only; issues no Telegram request |
| `--month YYYY-MM` | Override the target month |
| `--only fridays,saturdays,holidays` | Send a subset |
| `--force` | Resend even if the delivery record says it already went out |
| `--offline` | Skip the live holiday fetch and use the committed snapshot |
| `--slots "10am-12pm,7-9pm"` | Override the Saturday time slots |

### Holiday data

Source of truth is the MOM consolidated dataset on data.gov.sg, retrieved via a
three-step flow (`initiate-download` → poll `poll-download` → download CSV).
`data/holidays.json` is a committed snapshot used whenever the live source fails.
The live source can never withhold the Friday and Saturday polls.

Observed holidays are read from the dataset, never derived — the substitute is
not always the following Monday. `test/holidays.test.ts` guards this.

```bash
npm run snapshot:check      # fails if coverage doesn't reach 6 months ahead
npm run snapshot:refresh    # regenerate from live, then review the diff and commit
```

CI runs the freshness check on every push, so staleness surfaces during ordinary
development rather than during a scheduled run that has already lost its live
source.
