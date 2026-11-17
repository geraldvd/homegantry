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
- 2026-11-16 — The deployed `compose.yaml` takes its hostname from `HOMEGANTRY_DOMAIN`. — Keeps a real lab's hostname
  out of the public repo.
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
