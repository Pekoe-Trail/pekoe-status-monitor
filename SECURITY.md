# Security

## Reporting a vulnerability

Use
[private vulnerability reporting](https://github.com/Pekoe-Trail/pekoe-status-monitor/security/advisories/new)
on this repository.

## How this repository is kept safe

This repository and its workflow logs are **public**. Everything below follows from that.

- **Secrets** are GitHub Actions secrets in the `monitor` environment, which only `main`
  can use, and GitHub masks them in logs. The scripts never print a secret, a token, a
  request body, a response body or an error message.
- **Committed data** is limited to state, response time, HTTP status code and a coarse
  error type (`timeout`, `network`, `status`, `content`, `login`). No response content,
  headers, hostnames, IP addresses or error messages are stored.
- **The monitoring account** used by the sign-in check has no admin role, no passes and no
  personal data. Rotate its password every 6 months, and immediately if it may have leaked.
  The sign-in check never follows a redirect, so the password only goes to the API.
- **Workflows** pin every action to a full commit SHA, give each job only the permissions
  it needs, and never use `pull_request_target`. Pull requests run without secrets.
  Dependencies are installed without their install scripts. The job that runs the checks
  has the secrets but can't push; a separate job with no dependency code commits the
  results.
- **The site** is static: no server, no database, no cookies, no third-party scripts. A
  strict Content-Security-Policy allows only the site's own `theme.js` (the theme toggle,
  which keeps its choice in `localStorage`) and blocks every other script.
- **Incident notes** are reviewed in a pull request before they go live, and may not
  contain HTML.
- **`gitleaks`** scans every pull request for committed secrets.

## Repository settings to keep

- `main` is protected: pull request with 1 approval, no force pushes.
- **Settings → General → Features:** issues, discussions, wiki and projects are off, and
  pull requests are limited to collaborators. We don't accept contributions.
- **Settings → Actions → General:** require approval for workflow runs from all outside
  collaborators.
- **Settings → Environments → `monitor`:** deployment branches limited to `main`, and
  every secret stored here.
- **Settings → Actions → General → Workflow permissions:** read repository contents.
- `thepekoetrail.org` is verified in the organisation's GitHub Pages settings, so no other
  account can serve `status.thepekoetrail.org`.
- Dependabot alerts and security updates are on.
