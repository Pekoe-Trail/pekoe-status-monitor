# Pekoe Trail status

The source of [status.thepekoetrail.org](https://status.thepekoetrail.org): a public status
page for the Pekoe Trail, covering both the trail itself and the website, app and services.

It runs entirely on GitHub, not on our own servers, so it keeps working when they don't.

- A [workflow](.github/workflows/check.yml) checks every system every 10 minutes, saves the
  results to the `status-data` branch, and tells developers when a system goes down or
  recovers. An EventBridge schedule in AWS calls the dispatch API to start it; GitHub's own
  cron never fired for this repository.
- The site is static HTML built with [Astro](https://astro.build) from those results, the
  trail alerts read from the public API, and the notes in [`incidents/`](incidents/). It is
  hosted on GitHub Pages.

This repository is public so the checks and the page can run on GitHub, and so anyone can
see how status is measured. It is not open source, and we don't accept contributions:
issues are off, and only our team can open pull requests. See [LICENSE](LICENSE).

## Contents

- [Pages](#pages)
- [Layout](#layout)
- [Status data](#status-data)
- [Trail alerts](#trail-alerts)
- [Working locally](#working-locally)
- [Adding or changing a system](#adding-or-changing-a-system)
- [Incident and maintenance notes](#incident-and-maintenance-notes)
- [Notifications](#notifications)
- [How the numbers are worked out](#how-the-numbers-are-worked-out)
- [Setup](#setup)
- [Limits](#limits)
- [Licence](#licence)

## Pages

The two halves of the site are separate and don't link to each other. There is no home
page: `/` redirects to `/system`.

| Page | What it shows |
|---|---|
| `/trail` | The trail's colour now, a button per stage, and the alerts in force |
| `/stages/<n>` | One stage: its colour, active alerts, the past year day by day, and that year's updates |
| `/stages/<n>/<year>` | The same for one calendar year |
| `/stages/overall` | The whole trail, in the same shape, reached from the **All stages** button |
| `/alerts/<psa>` | One trail alert with its full history |
| `/system` | Every system's state, with its last 24 hours of checks |
| `/systems/<id>` | One system: uptime, 24 hours of checks, 30 days of checks, 90 days of uptime, response times, incidents |
| `/incidents`, `/incidents/<id>` | Incident and maintenance notes |

Addresses carry no trailing slash: `/trail`, not `/trail/`. Anything else lands on the
site's own 404 page.

## Layout

| Path | What |
|---|---|
| [`config/systems.yml`](config/systems.yml) | The systems, how each is checked, and thresholds |
| [`incidents/`](incidents/) | Incident and maintenance notes, one Markdown file each |
| [`scripts/`](scripts/) | The checks and notifications (`npm run check`) |
| [`site/`](site/) | The Astro site |
| [`tests/`](tests/) | Unit tests (`npm test`) |
| `status-data` branch | Check results and trail alerts, written only by the workflow |

## Status data

The `status-data` branch holds the results, so the commit every 10 minutes never touches
`main`:

| File | Content |
|---|---|
| `current.json` | Each system's latest state, and what developers have been told |
| `checks/<system>/<YYYY-MM-DD>.json` | Every check, kept for `keepCheckDays` (30) |
| `daily/<system>.json` | Totals for each day, kept indefinitely |
| `alerts/<YYYY>.json` | Trail alerts published that year |
| `alerts/meta.json` | When the alerts were last read |

Days are Sri Lanka calendar days. A check stores only its time, state, response time,
HTTP status and a coarse error type; never anything from the response.

## Trail alerts

Trail alerts (PSAs) are published in the admin panel, not here. Each run reads them from
the public `alerts.historyUrl` in [`config/systems.yml`](config/systems.yml) and keeps only
the fields the [Trail page](https://status.thepekoetrail.org/trail) shows.

Only the first run reads the whole register. After that a run asks for the alerts changed
since the newest change it already has, using the `updatedSince` watermark, so it normally
reads one short page. An alert's `updatedAt` moves whenever it is published, updated or
closed, so a closure of a years-old alert arrives the same way a new one does. An API that
doesn't know `updatedSince` yet answers a plain read instead.

They are kept for good, one file per year under `alerts/`, so years of trail history stay on
the stage pages. A run updates the alerts it read and adds new ones, and never drops one it
no longer reaches, whether because the read is capped at `alerts.maxPages` or because the
alert left the register. A year's file is rewritten only when that year changed. If the API
can't be reached, the last copy stays, so the page keeps showing the alert history.

**The yearly map** on a stage page colours each day with the stage's colour at the end of
that day, as the website banner showed it. Only updates sent to the website count, so a
push-only reminder doesn't repaint the map; a colour carries over from day to day until a
website update changes it, and a resolved alert leaves the stage Open (green). Clicking a
day scrolls to the update that set its colour.

## Working locally

Needs Node 22 (see `.nvmrc`).

```bash
npm ci
git worktree add data status-data   # the status data, at data/
npm run check                       # run the checks once; writes to data/
npm run dev                         # the site at http://localhost:4321
npm test
npm run typecheck
```

Without `MONITOR_EMAIL` and `MONITOR_PASSWORD` the sign-in check is skipped, and without
the notification secrets nothing is sent. To check some systems only:
`STATUS_ONLY=api,website npm run check`. `STATUS_DATA_DIR` points the scripts and the build
at another data folder. Don't commit or push from `data/`; the workflow owns that branch.

## Adding or changing a system

Edit [`config/systems.yml`](config/systems.yml) in a pull request. Each system needs a
stable `id`: it names the data files and is used in incident notes, so never rename it.
Removing a system hides it from the page; its old data stays on the `status-data` branch.

## Incident and maintenance notes

Each file in [`incidents/`](incidents/) is one incident or one planned maintenance. Add or
update one with a pull request; it goes live a few minutes after merging. A system's colour
comes from the checks, so a note explains what happened; it doesn't set the status.

### File name

`YYYY-MM-DD-short-slug.md`, dated the day it started, for example
`2026-09-21-api-unavailable.md`. The name becomes the page's URL, so don't rename a
published file.

### Incident

```markdown
---
title: API unavailable
severity: major            # minor | major | critical
systems: [api, api-login]  # ids from config/systems.yml
status: resolved           # investigating | identified | monitoring | resolved
started: 2026-09-21T08:10:00+05:30
ended: 2026-09-21T08:55:00+05:30   # required once resolved
---

**Resolved, 08:55.** Service restored after the database was restarted.

**Identified, 08:25.** The database ran out of connections.

**Investigating, 08:12.** The API is returning errors. We're looking into it.
```

- Put the **newest update at the top**, each starting with the bold status and time.
- Change `status` with each update, and add `ended` when it's resolved.
- Write for hikers, not developers: what's affected, what they should do, and when it's
  fixed. Leave out internal details such as server names, IP addresses and error text.
- After a serious outage, a longer write-up (a postmortem) can go at the bottom under a
  `## What happened` heading.

### Planned maintenance

```markdown
---
title: Database upgrade
type: maintenance
systems: [api, api-login]
status: scheduled          # scheduled | in-progress | completed
started: 2026-10-01T22:00:00+05:30   # planned start
ended: 2026-10-01T23:30:00+05:30     # planned end
---

The app and sign-in may be unavailable for up to 30 minutes while we upgrade the database.
```

Between `started` and `ended`, the listed systems going down **don't notify developers**.
If a system is still down when the window ends, the next check reports it. A note written
after the fact silences nothing.

### Where a note appears

| State | Where |
|---|---|
| Any status but `resolved` | "Happening now" at the top of `/system` |
| `scheduled` maintenance still to come | "Planned maintenance" on `/system` |
| Finished, started in the last 14 days | "Past 14 days" on `/system` |
| Always | `/incidents`, each listed system's page, and the RSS feed |

### Rules

- **No HTML.** Use Markdown only; the tests fail on any HTML tag.
- Times are in Sri Lanka time (`+05:30`).
- `status` must match `type`, at least one system must be listed, `ended` can't be before
  `started`, and both a resolved incident and any maintenance need `ended`. The build fails
  otherwise.

## Notifications

A notification goes out only when a system changes state: **Down** after 2 failed checks in
a row (each check is retried once first), and **Recovered** on the first passing check
after that. Nothing is sent for Down checks during a planned maintenance window.

| Channel | When | Secrets |
|---|---|---|
| Telegram | Every change | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |
| SMS through [notify.lk](https://notify.lk) | Down, for systems with `sms: true` only | `NOTIFYLK_USER_ID`, `NOTIFYLK_API_KEY`, `NOTIFYLK_SENDER_ID`, `NOTIFYLK_TO` (comma-separated, `9477XXXXXXX`) |

A channel whose secrets aren't set is skipped. SMS costs money per message, so it's kept
for the systems that affect visitors: the websites, the API and sign-in, but not the CDN.

## How the numbers are worked out

Every check adds to that day's totals in `daily/<system>.json`: how many checks ran, how
many were up, slow or down, and the summed response time of the ones that answered.

- **Uptime** over a window is `(checks − down) ÷ checks` across the days in it, so a slow
  check still counts as up, and a day with fewer checks counts for less. With no checks at
  all the page shows `–`, not 100%.
- **A day's bar** is grey without checks, red below 95% uptime, amber with any down check
  or more than half slow, otherwise green.
- **The 24-hour figure** comes from the individual checks of the last 24 hours, so it is a
  rolling day rather than a calendar one.
- **The 30-day grid** draws one block per 10-minute slot from the detailed checks; a slot
  with no check stays grey, which is how a missed workflow run shows up.
- **The response chart** scales to just above the 95th percentile, so one very slow check
  doesn't flatten the rest, and red ticks along the bottom mark failed checks.

## Setup

One-time steps for the repository and domain.

1. **Data branch:** create the empty `status-data` branch.

   ```bash
   git switch --orphan status-data
   git commit --allow-empty -m "chore(data): start status data"
   git push origin status-data
   git switch main
   ```

2. **Pages:** Settings → Pages → Source: **GitHub Actions**. Custom domain:
   `status.thepekoetrail.org`, then **Enforce HTTPS** once the certificate is issued.
3. **DNS:** `status.thepekoetrail.org` CNAME `pekoe-trail.github.io`.
4. **Domain verification:** in the organisation's settings, Pages → add and verify
   `thepekoetrail.org`, so no other account can use the subdomain.
5. **Monitoring account:** create a user for the sign-in check with no admin role, no
   passes and no personal data, then set `MONITOR_EMAIL` and `MONITOR_PASSWORD`.
6. **Telegram:** create a bot with [@BotFather](https://t.me/BotFather), add it to the
   developers' group, and set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.
7. **Secrets:** Settings → Environments → create `monitor`, limit its deployment branches
   to `main`, and add every secret above to it (not as repository secrets).
8. **Repository settings:** protect `main` (1 approval, no force pushes), set workflow
   permissions to read-only, turn off issues, discussions, wiki and projects, limit pull
   requests to collaborators, require approval for workflow runs from all outside collaborators, and turn
   on Dependabot alerts and private vulnerability reporting. See [SECURITY.md](SECURITY.md).
9. Run the **Check** workflow once by hand (Actions → Check → Run workflow).

## Limits

- **A run can be late or missed.** The page shows when the last check ran, and warns when
  it's more than an hour old, so a stalled trigger is visible rather than silent. A short
  outage between runs can still be missed.
- **Checks run from GitHub's servers** in the US and Europe, not from Sri Lanka.
- **If GitHub is down,** checks stop and the page keeps its last state.
- The sign-in check logs in on every run. Filter the monitoring account out of
  audit and sign-in reports.

## Licence

Proprietary. Copyright © 2026 The Pekoe Trail Organisation. All rights reserved; see
[LICENSE](LICENSE). The Pekoe Trail name and logos are trademarks and are not licensed for
any use.
