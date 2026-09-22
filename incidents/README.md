# Incident notes

Each file here is one incident or one planned maintenance, shown on
[status.thepekoetrail.org](https://status.thepekoetrail.org). Add or update one with a pull
request; it goes live a few minutes after merging.

## File name

`YYYY-MM-DD-short-slug.md`, dated the day it started, for example
`2026-09-21-api-unavailable.md`. The name becomes the page's URL, so don't rename a
published file.

## Incident

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

## Planned maintenance

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
If a system is still down when the window ends, the next check reports it.

## Rules

- **No HTML.** Use Markdown only; the tests fail on any HTML tag.
- Times are in Sri Lanka time (`+05:30`).
- `systems` must use ids from [`config/systems.yml`](../config/systems.yml); the build
  fails on an unknown id.
