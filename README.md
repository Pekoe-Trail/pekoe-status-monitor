# Pekoe Trail status

The source of [status.thepekoetrail.org](https://status.thepekoetrail.org): a public status
page for the Pekoe Trail website, app and services, with uptime history and incident notes.

It runs entirely on GitHub, not on our own servers, so it keeps working when they don't.

- A [scheduled workflow](.github/workflows/check.yml) checks every system about every 10
  minutes, saves the results to the `status-data` branch, and tells developers when a
  system goes down or recovers.
- The site is static HTML built with [Astro](https://astro.build) from those results and
  the notes in [`incidents/`](incidents/), and hosted on GitHub Pages.

This repository is public so the checks and the page can run on GitHub, and so anyone can
see how status is measured. It is not open source, and we don't accept contributions:
issues are off, and only our team can open pull requests. See [LICENSE](LICENSE).

## Layout

| Path | What |
|---|---|
| [`config/systems.yml`](config/systems.yml) | The systems, how each is checked, and thresholds |
| [`incidents/`](incidents/) | Incident and maintenance notes, one Markdown file each ([how to write one](incidents/README.md)) |
| [`scripts/`](scripts/) | The checks and notifications (`npm run check`) |
| [`site/`](site/) | The Astro site |
| [`tests/`](tests/) | Unit tests (`npm test`) |
| `status-data` branch | Check results, written only by the workflow |

### Status data

The `status-data` branch holds the results, so the commit every 10 minutes never touches
`main`:

| File | Content |
|---|---|
| `current.json` | Each system's latest state, and what developers have been told |
| `checks/<system>/<YYYY-MM-DD>.json` | Every check, kept for 7 days |
| `daily/<system>.json` | Totals for each day, kept indefinitely |
| `alerts.json` | Trail alerts (PSAs), read each run from the API's public history |

Days are Sri Lanka calendar days. A check stores only its time, state, response time,
HTTP status and a coarse error type; never anything from the response.

Trail alerts are published in the admin panel. Each run reads them from the public
`alerts.historyUrl` in [`config/systems.yml`](config/systems.yml) and keeps only the fields
the [Trail alerts page](https://status.thepekoetrail.org/alerts/) shows. If the API can't be
reached, the last copy stays, so the page keeps showing the alert history.

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
`STATUS_ONLY=api,website npm run check`. Don't commit or push from `data/`; the workflow
owns that branch.

## Adding or changing a system

Edit [`config/systems.yml`](config/systems.yml) in a pull request. Each system needs a
stable `id`: it names the data files and is used in incident notes, so never rename it.
Removing a system hides it from the page; its old data stays on the `status-data` branch.

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

- **Scheduled runs are not punctual.** GitHub often starts them 10–30 minutes late when
  busy, and sometimes skips one. A short outage can be missed. The page shows when the last
  check ran, and warns when it's more than an hour old.
- **Checks run from GitHub's servers** in the US and Europe, not from Sri Lanka.
- **If GitHub is down,** checks stop and the page keeps its last state.
- The sign-in check logs in on every run. Filter the monitoring account out of
  audit and sign-in reports.

## Licence

Proprietary. Copyright © 2026 The Pekoe Trail Organisation. All rights reserved; see
[LICENSE](LICENSE). The Pekoe Trail name and logos are trademarks and are not licensed for
any use.
