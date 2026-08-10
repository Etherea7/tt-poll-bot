# tt-tele-poll — Monthly Telegram Availability Polls

This project posts **four availability polls** to your Telegram group(s)
automatically, once a month, without anyone having to remember to do it.

On the **25th of every month**, it posts polls covering the **following** month:

| Poll | Asks about |
|---|---|
| 🏓 **Fridays** | Every Friday next month, 7-10pm |
| 🏓 **Saturdays** | Every Saturday next month, split by time slot |
| 🏓 **Sundays** | Every Sunday next month, MOE Evans 5-7pm |
| 🏓 **Public Holidays** | Every Singapore public holiday next month, split into AM and PM |

Every poll also offers a **`cmi`** option, so someone who can't make any of the
listed dates can say so instead of leaving you guessing whether they've voted.

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
5. [Step 4 — Save the settings into GitHub](#step-4--save-the-settings-into-github)
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

| # | What | Looks like | Where it goes in GitHub | Secret? |
|---|---|---|---|---|
| 1 | **Bot token** | `8123456789:AAH7x9k-QwEr…` (long) | Actions **secret** named `TELEGRAM_BOT_TOKEN` | 🔴 **Yes — never share** |
| 2 | **Destination list** | `main=-1001234567890` | Actions **variable** named `TELEGRAM_DESTINATIONS` | 🟢 No, but keep it private |

**Why is one a "secret" and the other a "variable"?**

- The **token** is a password. Anyone who has it can post to your groups as the
  bot. GitHub hides secrets permanently — once you save it, even you cannot read
  it back, and it is automatically blanked out (`***`) in any log.
- The **destination list** is just an address book, not a password. Knowing it
  doesn't let anyone post anything. It's stored as a *variable* so you can
  actually **see and check it** later. If it were a secret you could never
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
4. It asks for a **name** — the display name members will see.
   Example: `TT Session Polls`
5. It asks for a **username**, which must be unique and **must end in `bot`**.
   Example: `tt_session_polls_bot`
   If it says the name is taken, just try another.
6. BotFather replies with your token:

   ```
   Done! Congratulations on your new bot.
   Use this token to access the HTTP API:
   8123456789:AAH7x9k-QwErTyUiOpAsDfGhJk…      ← yours will be longer
   ```

7. **Copy that token and keep it safe for the next few minutes.**

> ⚠️ **Treat the token like your bank PIN.**
> Do not paste it into a group chat, an email, a screenshot, or any file in this
> project. If it ever leaks, go back to `@BotFather`, send `/revoke`, pick your
> bot, and it hands you a brand-new token. Then update the GitHub secret.

---

## Step 2 — Add the bot to your group

The bot cannot post to a group it isn't a member of.

1. Open your Telegram group.
2. Tap the **group name** at the top → **Add Members**.
3. Search for your bot's **username** (e.g. `tt_session_polls_bot`) and add it.
4. **Recommended: make the bot an admin.**
   Group name → **Administrators** → **Add Admin** → pick your bot.

**Do I really have to make it an admin?** Not always, but do it anyway. Some
groups restrict ordinary members from sending polls, and when that's switched on
a non-admin bot fails with a confusing permissions error. Making it an admin
sidesteps the problem entirely. It only needs **"Send Messages"** — you can untick
every other admin permission.

---

## Step 3 — Find your group's chat ID

Every Telegram group has a hidden numeric ID, like `-1001234567890`. This is how
the robot knows *which* group to post to. Telegram doesn't show it in the app, so
you have to ask for it.

**Group IDs are always negative** — they start with a minus sign. The setup will
reject anything that doesn't. Larger groups, and any group upgraded to a
"supergroup", have IDs starting with **`-100`**. If your number is positive,
you've found a *personal* chat ID, which is the wrong one.

Pick whichever method is easiest. **Method A is the easiest.**

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

4. **Remove the helper bot from the group.** It has done its job, and it's run by
   a stranger, so there's no reason to leave it able to read your group.

> ⚠️ **These are third-party bots and they come and go.** If one doesn't respond
> within a minute, remove it and try the next. If none work, use **Method B** —
> it talks only to Telegram's official servers, so it cannot stop working.

### Method B — Use your own bot and a web browser

No third-party bot, but there's a catch you must know about.

1. **In your Telegram group, send this exact message** (using your bot's username):

   ```
   /start@tt_session_polls_bot
   ```

   > 🔑 **This is the step everybody gets wrong.** By default, Telegram bots are
   > in "privacy mode", which means they are **deliberately blind to normal group
   > chatter** — they only see messages that are commands aimed directly at them.
   > If you just say "hello" in the group, the next step shows an empty result and
   > you'll think it's broken. Sending `/start@yourbotname` is a command aimed at
   > your bot, so it gets through.

2. Open a **web browser** and go to this address, pasting your token in place of
   `<YOUR_TOKEN>`:

   ```
   https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates
   ```

   The finished address looks like:
   `https://api.telegram.org/bot8123456789:AAH7x9k-QwEr…/getUpdates`

   ⚠️ There is **no space and no slash** between the word `bot` and your token —
   it's `/bot8123456789:AAH…`, all run together.

3. You'll see a page of raw text. Look for `"chat":{"id":-1001234567890`.
   That negative number is your chat ID.

4. **Close the tab when you're done.** That address contains your token. Don't
   bookmark it, and don't leave it in your history on a shared computer.

**Got `{"ok":true,"result":[]}` (an empty result)?** Causes, most likely first:

- You sent a plain message instead of `/start@yourbotname` → see the warning above.
- You added the bot *after* sending the message → send the command again.
- Something already collected the updates → send the command again and refresh.

---

## Step 4 — Save the settings into GitHub

Now you put both values into GitHub. **You never put these into a file** — they go
into GitHub's settings screens, which is a separate, protected place.

### 4a. Save the bot token (as a *secret*)

1. Go to your repository on GitHub.
2. Click **⚙️ Settings** (top row of tabs, far right).
3. Left sidebar: **Secrets and variables** → **Actions**.
4. Make sure you're on the **Secrets** tab.
5. Click **New repository secret**.
6. Fill it in **exactly**:
   - **Name:** `TELEGRAM_BOT_TOKEN`
     *(all capitals, underscores not spaces — must match character for character)*
   - **Secret:** paste your token from Step 1
7. Click **Add secret**.

You'll now see `TELEGRAM_BOT_TOKEN` listed with no way to view its value. That's
correct and intentional. To change it later, click the pencil ✏️.

### 4b. Save the destination list (as a *variable*)

This one has a specific format. Each group gets a short **nickname** (an "alias")
followed by `=` and its chat ID:

```
main=-1001234567890
```

`main` is a nickname *you* choose. It's there so that later you can say "send only
to `main`" without pasting a long number, and so the logs say something readable.

**Nickname rules** — the setup rejects anything else:

| Rule | ✅ Good | ❌ Bad |
|---|---|---|
| Lowercase letters, digits and hyphens only | `main`, `test`, `team-a` | `Main`, `team_a`, `team a` |
| Must start with a letter | `g2` | `2g` |
| Max 32 characters | `saturday-crew` | *(a very long name)* |
| Each nickname used once | `main=…,test=…` | `main=…,main=…` |
| Each chat ID used once | | the same ID twice |

Now save it:

1. Same page as before, but click the **Variables** tab (next to "Secrets").
2. Click **New repository variable**.
3. Fill it in:
   - **Name:** `TELEGRAM_DESTINATIONS`
   - **Value:** `main=-1001234567890`
4. Click **Add variable**.

**For more than one group**, separate them with commas and **no spaces**:

```
main=-1001234567890,social=-1009876543210
```

Every poll goes to every listed group, unless you narrow it down when running
manually.

### Check your work

| Tab | Name | Value |
|---|---|---|
| Secrets | `TELEGRAM_BOT_TOKEN` | *(hidden — correct)* |
| Variables | `TELEGRAM_DESTINATIONS` | `main=-1001234567890` |

Common mistakes:

- ❌ Just the number, with no `nickname=` in front → rejected.
- ❌ The minus sign dropped from the chat ID → rejected.
- ❌ Spaces around the comma or the `=`.
- ❌ A capital letter in the nickname → rejected.
- ❌ Token saved as a *variable* instead of a *secret* → **delete it immediately**,
  re-add it as a secret, then revoke and regenerate the token in BotFather,
  because it may already have been written to a log.

### 4c. Let the robot save its notes

The job writes a file called `state/delivered.json` back into the repository. That
file is what stops it posting twice, so it must be allowed to save.

1. **Settings** → **Actions** (left sidebar) → **General**.
2. Scroll to the bottom, to **Workflow permissions**.
3. Select **Read and write permissions**.
4. Click **Save**.

> **Also: don't add branch protection rules to your main branch here.** If the
> robot can't save its notes, the job stops rather than risking a double-post —
> but you'd have to clean it up by hand. For a small private repo, leave branch
> protection off.

### One more thing: keep the repository **private**

Go to **Settings → General**, scroll to the bottom, and confirm the repository is
**Private**.

This matters more than it sounds. GitHub **automatically switches off scheduled
workflows in public repositories after 60 days without activity**. This job runs
twelve times a year and otherwise sits quiet, so in a public repo it would
silently disable itself and the polls would just stop, with no error and no
warning. Private repos aren't subject to that rule.

---

## Step 5 — Test safely before going live

**Don't point this at your real group first.** Follow this order and nothing can
embarrass you.

1. **Create a throwaway Telegram group.** Add just yourself and the bot.
2. Get that group's chat ID (Step 3) and set
   `TELEGRAM_DESTINATIONS` to `test=-100…` using it.
3. **Run a preview** (next section) — leave the **preview** box **ticked**. This
   shows the exact polls it *would* send and contacts Telegram not at all.
4. Read the output. Are the dates right? The wording?
5. **Run it for real** — same steps, but **untick preview**. Then check the group:
   - Do all four polls appear?
   - Can you **select more than one date**? (multi-select is on)
   - Can you see **who voted**? (deliberately not anonymous, so you know who's coming)
6. **Run it again for the same month.** It should say `already delivered` and post
   nothing. That proves the duplicate protection works.
7. **Only now** change `TELEGRAM_DESTINATIONS` to your real group.
8. Leave the schedule alone — it's already on and fires on the 25th.

---

## How the automation works

### The schedule

```
Every month on the 25th, at 09:17 Singapore time
```

**Why the 25th?** So members get about a week's notice before the month starts. If
the polls only appeared on the 1st, and the 1st happened to be a public holiday,
nobody would have had time to plan.

**Why 9:17 and not 9:00?** GitHub runs everybody's scheduled jobs at the top of
the hour, so that window is congested. An odd minute avoids the queue. Even then,
**GitHub may delay a scheduled run by up to a few hours** — normal, and harmless
here, because the polls describe a month that's still six days away.

### The "claim first, then send" system

This is the part worth understanding, because it explains the odd-looking steps in
the run and what to do when something goes wrong.

The repository holds a notes file, `state/delivered.json`, recording what has been
sent, **per group and per poll**:

```json
{
  "2026-09": {
    "main": {
      "fridays":   { "status": "delivered", "claimId": "30740971659-1" },
      "saturdays": { "status": "delivered", "claimId": "30740971659-1" },
      "holidays":  { "status": "delivered", "claimId": "30740971659-1" }
    }
  }
}
```

A live run happens in **two phases**, and this is deliberate:

```
  PHASE 1 — CLAIM                        PHASE 2 — SEND
  ┌──────────────────────────┐          ┌──────────────────────────┐
  │ Write "I am about to     │          │ Send ONLY what this run  │
  │ send these" into the     │   ───►   │ claimed, then mark each  │
  │ notes, tagged with this  │          │ one "delivered" and save │
  │ run's unique ID.         │          │ again.                   │
  │ SAVE TO GITHUB FIRST.    │          │                          │
  └──────────────────────────┘          └──────────────────────────┘
```

**Why bother?** Because the dangerous moment is a run that dies halfway. If the
claim is already saved on GitHub before anything is sent, then a later run finds a
claim belonging to a *different* run and **stops instead of guessing**. It has no
way to know whether that poll actually went out, and posting a duplicate into a
live group is worse than a poll that's missing — a duplicate can't be un-sent, but
a missing one you can spot and re-run.

So the rule is: **the robot never resends anything it isn't certain about. It
stops and asks for a human.** See
[Recovering from a stuck claim](#recovering-from-a-stuck-claim).

### Retrying

The robot automatically retries in exactly one situation: when Telegram replies
"too many requests", in which case it waits precisely as long as Telegram asks.

Everything else — a server error, a timeout, a dropped connection — is treated as
**unknown**, not as failure. It does not retry, because it cannot prove the poll
didn't already arrive.

---

## Running the polls manually

Useful for testing, for seeing next month early, or for recovering from a failure.

### How to open it

1. Go to the repository on GitHub.
2. Click the **Actions** tab.
3. In the **left sidebar**, click **Monthly polls**.
4. On the right, click the grey **Run workflow ▾** button.
5. Fill in the small form (below) and click the green **Run workflow**.
6. Wait ~30 seconds, then **refresh the page**. Click your run, then **post**, to
   see the steps and their output.

### The form, explained

| Field | What to put | What happens |
|---|---|---|
| **Use workflow from** | Leave as `main` | Which version of the code to run |
| **Target month (YYYY-MM)** | Usually **leave blank** | Blank = next month, worked out automatically. Type `2026-11` to force one. |
| **Render without contacting Telegram** | ☑️ **ticked by default** | **The safety catch.** Ticked = dry run, shows the polls, sends nothing. **Untick to actually post.** |
| **Comma-separated subset** | Usually **leave blank** | Blank = all four polls. Valid words: `fridays`, `saturdays`, `sundays`, `holidays`. |
| **Comma-separated destination aliases** | Usually **leave blank** | Blank = every group. Type a nickname from `TELEGRAM_DESTINATIONS` (e.g. `test`) to send to just that one. |
| **Explicitly replace existing delivery state** | ☐ **leave unticked** | Emergency override — see the warning below. |

> 🛑 **The most important thing on this page:**
> **"Render without contacting Telegram" is TICKED by default.**
> That's deliberate — an accidental click can never spam your group. It also means
> that if you *wanted* to post and nothing appeared, you almost certainly left it
> ticked. Untick it and run again.

> ⚠️ **About the "Explicitly replace existing delivery state" tickbox.**
> This wipes out the robot's existing notes for that month and claims them afresh
> — including entries already marked *delivered*. **It can cause a duplicate
> post.** Only use it when you have checked the group with your own eyes and know
> what you want to happen. It is an override for a human who has already
> investigated, not a "try again" button. For ordinary recovery, leave it
> unticked — a plain re-run already sends only what's missing.

### Common things you might want to do

| I want to… | Month | Preview | Subset | Aliases | Replace state |
|---|---|---|---|---|---|
| See next month's polls | *blank* | ☑️ | *blank* | *blank* | ☐ |
| Check a specific month | `2026-11` | ☑️ | *blank* | *blank* | ☐ |
| Actually post next month now | *blank* | ☐ **off** | *blank* | *blank* | ☐ |
| Post to only the test group | *blank* | ☐ off | *blank* | `test` | ☐ |
| Re-run after a partial failure | *same month* | ☐ off | *blank* | *blank* | ☐ |
| Send only the holidays poll | *same month* | ☐ off | `holidays` | *blank* | ☐ |

Note the fifth row: ordinary recovery needs **no** override. The notes file already
knows what landed, so a plain re-run sends only what's missing.

---

## Understanding the output

Click a run → **post** → then a step name to read its log.

### Which steps you'll see

A **preview** run uses one step; a **live** run uses four. This is normal:

| Step | Runs when | What it does |
|---|---|---|
| **Preview polls** | preview only | Renders the polls, contacts nobody |
| **Prepare durable delivery claims** | live only | Writes "about to send" into the notes |
| **Push prepared delivery claims** | live only | Saves those notes to GitHub *before* sending |
| **Send claimed polls** | live only | Actually posts to Telegram |
| **Push delivered state** | live only | Saves the "delivered" marks |

### A preview run (nothing was sent)

```
target month: November 2026
[poll: fridays] Friday TT Sessions @ marymount/bishan/northeast/tampines, 7-10pm
  - 6 Nov
  - 13 Nov
  - 20 Nov
  - 27 Nov
  - cmi
[poll: saturdays] Saturday TT Sessions @ marymount/bishan/central/northeast
  - 7 Nov, 10am-12pm
  - 7 Nov, 7-9pm
  - 14 Nov, 10am-12pm
  - 14 Nov, 7-9pm
  - 21 Nov, 10am-12pm
  - 21 Nov, 7-9pm
  - 28 Nov, 10am-12pm
  - 28 Nov, 7-9pm
  - cmi
[poll: sundays] Sunday TT Sessions @ MOE Evans, 5-7pm
  - 1 Nov
  - 8 Nov
  - 15 Nov
  - 22 Nov
  - 29 Nov
  - cmi
[poll: holidays] Public Holiday TT Sessions
  - 9 Nov, AM
  - 9 Nov, PM
  - cmi
preview only — no Telegram request was made.
```

That last line is your guarantee nothing reached Telegram.

*(8 and 9 November are Deepavali and its observed holiday — Deepavali falls on a
Sunday in 2026, so the Monday is gazetted too. Notice that 8 November appears in
the **Sundays** poll, not the holiday poll: a date is never asked about twice, and
the Sundays poll got there first. Only the observed Monday is left for the holiday
poll.)*

### A real run

```
prepared 3 delivery claim(s)
...
delivered 3 poll kind(s) to claimed destination(s)
```

### Nothing left to do

```
nothing to prepare: November 2026 is already delivered
```

**This is a success, not a failure.** The run finishes green. The protection did
its job.

### A month with no public holidays

```
target month: September 2026
[message: holidays] No public holidays in September 2026.
```

Instead of an empty poll, the group gets a plain sentence. On purpose: if the job
sent nothing at all, you couldn't tell "there genuinely are no holidays" apart from
"the holiday lookup is broken".

> 🤔 **A surprise worth knowing.** December 2026 also reports *"No public
> holidays"* — even though Christmas is obviously in December. That's correct:
> **25 December 2026 falls on a Friday**, so it's already offered in the Fridays
> poll. No date is ever asked about twice across the four polls. Same for a
> holiday landing on a Saturday or a Sunday.

### Green tick vs. red cross

| Result | Meaning |
|---|---|
| ✅ Green | Sent, previewed, or nothing left to send |
| ❌ Red | Something went wrong — open the run and read the last few lines |

A red cross emails you (if GitHub notifications are on). That's the intended
alarm: nobody is watching this job, so a failure has to shout.

---

## Troubleshooting

### "I ran it but nothing appeared in Telegram"

In order:

1. **Was "Render without contacting Telegram" ticked?** It's ticked by default.
   This is the cause about nine times out of ten. Look for
   `preview only — no Telegram request was made.`
2. **Does it say `already delivered`?** Those polls went out on an earlier run.
   Check the group's history.
3. **Is the bot actually in the group?** Check the member list.
4. **Is `TELEGRAM_DESTINATIONS` pointing at the right group?** Easy to leave it on
   a test group.

### Setup and configuration errors

| What you see in the log | What it means | How to fix it |
|---|---|---|
| `TELEGRAM_DESTINATIONS must list at least one alias=chatId destination` | The variable is missing, empty, or misspelled | Redo Step 4b. |
| `TELEGRAM_DESTINATIONS entries must use safe-alias=chatId syntax` | Wrong format | Needs `nickname=-100…`. Check: nickname present, all lowercase, starts with a letter, chat ID **negative**, no spaces. |
| `duplicate destination alias "main"` | Same nickname twice | Give each group a distinct nickname. |
| `each destination must use a unique chat id` | Same group listed twice | Remove the duplicate. |
| `--to names an unknown destination alias` | The alias you typed isn't in the variable | Check spelling against `TELEGRAM_DESTINATIONS`. |
| `TELEGRAM_BOT_TOKEN is required for --live` | The secret is missing or misspelled | Redo Step 4a. |

### Telegram errors

| What you see | What it means | How to fix it |
|---|---|---|
| `sendPoll failed with 400: … chat not found` | Wrong chat ID, or the bot isn't in that group | Redo Step 3; confirm the minus sign survived. |
| `sendPoll failed with 403: … bot was kicked` | Someone removed the bot | Re-add it (Step 2). |
| `sendPoll failed with 403: … not enough rights` | The group forbids members sending polls | Make the bot an **admin** (Step 2). |
| `sendPoll failed with 401: Unauthorized` | Token wrong or revoked | New token in BotFather, update the secret. |
| `configured destination migrated to supergroup -100…; update runtime configuration` | Telegram upgraded your group, which **changes its ID** | Put the **new** ID into `TELEGRAM_DESTINATIONS`, then re-run. |
| `sendPoll … not retrying` | Sent, but the outcome is unknown | **Check the group with your own eyes first**, then see below. |

*(Wording after the number comes from Telegram and may vary slightly — usually
prefixed `Bad Request:` or `Forbidden:`. Match on the number and general sense.)*

### Recovering from a stuck claim

If you see either of these:

```
delivery preparation blocked by an existing claim; operator recovery is required
delivery blocked: every destination/kind must be prepared by this claim id
```

…then a previous run claimed some polls and never finished cleanly, so the robot
**cannot tell whether those polls were sent**. It has deliberately stopped rather
than risk a duplicate. This needs a person. Do this:

1. **Open the Telegram group and look.** Did the polls actually arrive? This is
   the question only a human can answer, and everything else depends on it.
2. **If the polls ARE there:** nothing was lost. The notes just need correcting —
   ask whoever maintains the repo to mark those entries `delivered`, or re-run
   with **"Explicitly replace existing delivery state"** ticked *after* narrowing
   with the subset/alias fields so it can't touch anything else.
3. **If the polls are NOT there:** it's safe to re-send. Re-run with **"Explicitly
   replace existing delivery state"** ticked.
4. **If you're unsure — stop and ask.** An unnecessary duplicate annoys everyone;
   a missing poll is easy to fix later.

### "The polls were sent, but the run is red ❌"

Check which step failed. If **Send claimed polls** is green and **Push delivered
state** is red, the polls went out but the notes couldn't be saved. Look for
`permission denied` or `protected branch` in that step, then fix Step 4c. Until
you do, the month may look unsent even though it isn't — so verify in Telegram
before re-running.

### "It posted twice!"

Only two realistic causes:

1. **"Explicitly replace existing delivery state" was ticked.** Check the run's
   inputs in the Actions tab.
2. **The notes aren't saving.** See the entry above, and check Step 4c.

### "The scheduled run didn't happen on the 25th"

- **Give it a few hours.** GitHub delays scheduled jobs under load.
- **Check the repo is still private** and has had activity — see the 60-day
  auto-disable in Step 4.
- **Check Actions isn't disabled** — Settings → Actions → General.
- Worst case, just [run it manually](#running-the-polls-manually).

### A note on time slots

Saturday options are every **date × every time slot**, and Telegram caps a poll at
**12 options**. The `cmi` option spends one of those twelve. Five Saturdays × two
slots + `cmi` = 11, which fits.

A **third time slot no longer fits any month**: even a four-Saturday month reaches
4 × 3 + `cmi` = 13. Two slots is now the practical maximum.

When that happens the job **refuses to send anything** rather than quietly dropping
sessions off the end, and tells you the numbers. Fixing it means fewer slots or
splitting the poll — a developer change, see [`docs/USAGE.md`](docs/USAGE.md).

---

## Things that are safe vs. things to be careful with

### ✅ Completely safe

- Running with **preview ticked**, as often as you like. It cannot post.
- Re-running a failed run *without* the replace-state override.
- Previewing any month, past or future.
- Reading and sharing logs. The token is protected twice: GitHub replaces any
  registered secret with `***`, and the code strips the token out of its own error
  messages before printing them.

### ⚠️ Think first

- **Unticking preview** — this posts to the real group.
- **Changing `TELEGRAM_DESTINATIONS`** — double-check before saving.

### 🛑 Never do these

- **Never** tick **"Explicitly replace existing delivery state"** without first
  looking in the Telegram group. It can cause a duplicate post.
- **Never** put the bot token in a file, commit, issue, message, or screenshot. It
  belongs in exactly one place: the GitHub Actions secret.
- **Never** make this repository public while the schedule is live.
- **Never** hand-edit `state/delivered.json` casually — it is the only thing
  standing between you and a duplicate post.

### If the token leaks

1. `@BotFather` → `/revoke` → choose your bot. **The old token dies instantly.**
2. Copy the new token.
3. Update the `TELEGRAM_BOT_TOKEN` secret (Step 4a, pencil icon).

Nothing else changes — destinations, group, and bot all stay as they are.

---

## For developers

Full technical documentation is in **[`docs/USAGE.md`](docs/USAGE.md)**.
Requirements live in [`specs/`](specs/); project rules in [`AGENTS.md`](AGENTS.md).

### Quick start

```bash
npm ci                    # install
npm test                  # node --test
npm run lint              # biome check
npm run typecheck         # tsc --noEmit

TELEGRAM_DESTINATIONS="test=-1001234567890" npm run preview
```

`.env.example` is a template only — the app does not load `.env`; export the
values in your shell.

### Modes and flags

The CLI has three mutually exclusive modes. `--preview` is the default.

| Flag | Effect |
|---|---|
| `--preview` | Render only; issues no Telegram request. Needs no token. |
| `--prepare --claim <id>` | Write delivery claims for this claim id |
| `--live --claim <id>` | Send only what this claim id durably claimed |
| `--month YYYY-MM` | Override the target month |
| `--only fridays,saturdays,sundays,holidays` | Restrict poll kinds |
| `--to <alias,…>` | Restrict destinations by alias |
| `--force` | Replace existing state. **Only valid with `--prepare`.** |
| `--offline` | Skip the live holiday fetch, use the committed snapshot |
| `--slots "10am-12pm,7-9pm"` | Override the Saturday time slots |

Unknown flags, duplicate flags, and value flags without a value are all rejected
before anything runs.

### Runtime configuration

| Variable | Format |
|---|---|
| `TELEGRAM_DESTINATIONS` | `alias=chatId,…` — alias `/^[a-z][a-z0-9-]{0,31}$/`, chat id `/^-\d+$/`, both unique |
| `TELEGRAM_BOT_TOKEN` | BotFather token; required only for `--live` |

### Delivery state

`state/delivered.json` is keyed month → alias → kind, each entry `claimed` or
`delivered` with the owning claim id. A live run may send only entries its own
claim id prepared and pushed. Mismatched or missing claims block the run and
require operator recovery — never auto-retry an ambiguous claim, and never reduce
the state to a month/kind list.

### Holiday data

Source of truth is the MOM dataset on data.gov.sg, retrieved via a three-step flow
(`initiate-download` → poll `poll-download` → download CSV). Unauthenticated calls
are limited to 2 per 10 seconds. `data/holidays.json` is a committed snapshot used
whenever the live source fails; it can never withhold the Friday and Saturday
polls. Observed holidays are read from the dataset, never derived — the substitute
is not always the following Monday, and `test/holidays.test.ts` guards this.

```bash
npm run snapshot:check      # fails if coverage doesn't reach 6 months ahead
npm run snapshot:refresh    # regenerate from live, review the diff, commit
```

### Constraints

- **Node.js 24+**, run directly from TypeScript via native type stripping. No
  build step, no bundler, no `dist/`.
- **Zero runtime dependencies**; only `typescript`, `@biomejs/biome`, `@types/node`
  as devDependencies.
- **Erasable syntax only** — no `enum`, decorators, or parameter properties.
- **Relative imports need explicit `.ts` extensions.**
