# Security Policy

## Supported versions

HomeGantry is pre-1.0. Only the latest release (and `main`) receive security fixes.

## Current status: keep it private

Until milestone **M1 (secure by default)** lands, the HomeGantry API has **no authentication**: anyone who can reach it
can change overrides, settings and manual services. HomeGantry mounts the Docker socket read-only and never controls
containers, but you should still:

- run it only on a trusted LAN, behind a VPN, or behind a forward-auth middleware (Authelia, Authentik, oauth2-proxy, ...);
- not expose it directly to the internet.

M1 makes the API read-only by default and requires an admin token or a trusted forward-auth header for edits.

## Reporting a vulnerability

Please report vulnerabilities **privately** via
[GitHub private vulnerability reporting](https://github.com/geraldvd/homegantry/security/advisories/new)
("Report a vulnerability" on the Security tab). Do not open a public issue.

Include what you found, how to reproduce it, and the impact you expect. You can expect an acknowledgement within a
week. Once a fix is released we will credit you in the advisory unless you prefer otherwise.
