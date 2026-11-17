# Security Policy

## Supported versions

HomeGantry is pre-1.0. Only the latest release (and `main`) receive security fixes.

## Security model

HomeGantry is read-only by default. Edits require an admin token (`HOMEGANTRY_ADMIN_TOKEN`) or a forward-auth header
from a trusted proxy (`HOMEGANTRY_AUTH_HEADER` + `HOMEGANTRY_TRUSTED_PROXIES`); `HOMEGANTRY_READONLY=true` disables
them entirely. The API returns an allow-list of fields only (no env vars, mounts or secret-looking labels), and
HomeGantry never controls containers. See [docs/guide/security.md](docs/guide/security.md) for the threat model, a
read-only Docker socket proxy setup and reverse-proxy examples.

## Reporting a vulnerability

Please report vulnerabilities **privately** via
[GitHub private vulnerability reporting](https://github.com/geraldvd/homegantry/security/advisories/new)
("Report a vulnerability" on the Security tab). Do not open a public issue.

Include what you found, how to reproduce it, and the impact you expect. You can expect an acknowledgement within a
week. Once a fix is released we will credit you in the advisory unless you prefer otherwise.
