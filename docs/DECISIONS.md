# Decisions

Short records of choices that shape the project. Newest at the bottom. Format: date — decision — why.

- 2026-11-15 — HomeGantry observes and never controls containers (no start/stop). — Keeps the Docker socket usage
  read-only and the security story simple.
- 2026-11-15 — Read-only by default; edits require an admin token or a trusted forward-auth header (M1). — The API
  previously accepted unauthenticated writes.
- 2026-11-15 — Tests: vitest (unit) + supertest (API). — Same toolchain as Vite, no extra runner.
- 2026-11-15 — CI on GitHub-hosted runners. — Public repo, free minutes.
- 2026-11-16 — Docs are built in CI but not deployed to GitHub Pages for now. — Docs are self-hosted; revisit
  a public docs site at M6 (launch).
- 2026-11-16 — The deployed stack file takes its hostname from `HOMEGANTRY_DOMAIN`. — Keeps a real lab's hostname
  out of the public repo. (The root `compose.yaml` this referred to was removed on 2026-11-23, see below.)
- 2026-11-17 — Auth design (M1): read-only by default; edits need either a static admin token (≥ 24 chars,
  `Authorization: Bearer`, constant-time compare, kept in the tab's `sessionStorage`) or a forward-auth header honoured
  only from `HOMEGANTRY_TRUSTED_PROXIES`; `HOMEGANTRY_READONLY` overrides both. — One editor level fits a homelab
  dashboard; reuses the SSO most labs already have instead of building accounts/OIDC (non-goal). Bearer header instead
  of a cookie keeps CSRF out of the token path; the same-origin check covers the header path. Alternatives: built-in
  user accounts or OIDC (out of scope), HTTP basic auth (browser prompt, no clean "lock").
- 2026-11-17 — Runtime dependency `zod` for request validation. — Declarative schemas for every body/param/query with
  precise 400 errors, small and dependency-free. Alternatives: hand-written checks (error-prone, verbose),
  ajv + JSON Schema (larger, less ergonomic in TypeScript).
- 2026-11-17 — No `helmet` or `express-rate-limit`: security headers and a fixed-window per-IP limiter are ~100 lines in
  `server/security.ts`. — Keeps runtime deps minimal (mission principle 3) for a single-process app; revisit if we need
  shared stores or many more headers. `cors` is kept but only mounted when `HOMEGANTRY_CORS_ORIGINS` is set.
- 2026-11-17 — UI tests use jsdom + @testing-library/react (dev dependencies only). — Lets us test the read-only and
  "Unlock editing" flows against the real `<App />` without a browser in CI.
- 2026-11-23 — Git history rewritten (and force-pushed) to remove personal details. — The repo is public; hostnames
  and personal addresses do not belong in it. Commit SHAs before this date changed; old pull-request pages on GitHub
  may still show the original commits.
- 2026-11-23 — Copyright holder is "The HomeGantry contributors". — The project belongs to everyone who contributes,
  not to one person's name.
- 2026-11-23 — The root `compose.yaml` (a maintainer's own deployment file) is removed; deployment config lives
  outside the repo. — The repo only ships generic examples (`docker-compose.yml`, `examples/`); a real deployment's
  hostnames and middleware are private.
- 2026-11-23 — Editing stays token-unlock by default (`HOMEGANTRY_ADMIN_TOKEN`); `HOMEGANTRY_READONLY=true` gives a
  labels-only, read-only instance. — Keeps the M1 design: simple for one editor, and a status wall needs no auth.
  Docs now tell token users behind a reverse proxy to set `HOMEGANTRY_TRUSTED_PROXIES` to the proxy's single IP.
- 2026-11-23 — Multi-host Traefik rules (#13b): the first literal host in the rule is the service URL, for both
  ``Host(`a`, `b`)`` and ``Host(`a`) || Host(`b`)``; `homegantry.url` picks another. — Predictable, and one card keeps
  one link. Alternatives: one card per host (duplicates), a list of URLs per service (UI and API change for a rare case).
  The other three quirks in #13 are not decided here.
- 2026-11-23 — M2 adds no runtime dependency: the Traefik client uses Node's `fetch`, health checks use `node:http(s)`.
  — Mission principle 3. Health checks need per-request TLS options, which `fetch` lacks without `undici` as a direct
  dependency. Alternatives: `undici`, `got`, `axios` (not needed for GET/HEAD).
- 2026-11-23 — Exposure badge: the strictest middleware decides a router, the loosest router decides a service. — A
  service with one public route is public, so the badge must not suggest more protection than exists.
- 2026-11-23 — Health: any HTTP status below 500 is "up", redirects are not followed, TLS errors are "unknown". — A login
  page or 404 proves the service answers; a certificate problem says nothing about whether it is running.
- 2026-11-23 — Exposure level `vpn-only` renamed to `private` (badge "Private"). — An IP allow-list means "only from your own
  networks" (LAN or VPN), not necessarily a VPN; the old name described one lab. `vpn-only` is still accepted in
  `HOMEGANTRY_EXPOSURE_MAP`. Badges for other proxies (Caddy, Nginx Proxy Manager) are #26.
- 2026-11-23 — `GET /api/services?includeHidden=true` requires edit rights (admin token or trusted auth header); without
  them it returns 401 (editing enabled) or 403 (editing disabled or read-only), like a write. — REST and SSE now share
  one visibility rule (#19); refusing instead of silently ignoring the parameter tells a script that its token is
  missing. Alternative: ignore the parameter for read-only clients (hides mistakes).
- 2026-11-23 — Non-blocking findings from the M2 review (#25) are filed as issues for the milestone they belong to:
  knowledge base and icons → M3, UX → M4, hardening and discovery edge cases → M5. #13's open quirks (icon label
  precedence, image matching, category precedence) belong to the knowledge base and move to M3. — Keeps each milestone's
  scope in one place; nothing from the review is lost.
- 2026-11-23 — The card keeps the green/grey dot for the container state next to the health badge for now, even when
  that reads as "running" next to "Down". — Both facts are true and useful; the redesign of how the two are shown
  belongs to the UX milestone (M4) rather than a quick patch.
