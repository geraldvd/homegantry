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
