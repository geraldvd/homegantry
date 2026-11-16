# Decisions

Short records of choices that shape the project. Newest at the bottom. Format: date — decision — why.

- 2026-11-15 — HomeGantry observes and never controls containers (no start/stop). — Keeps the Docker socket usage
  read-only and the security story simple.
- 2026-11-15 — Read-only by default; edits require an admin token or a trusted forward-auth header (M1). — The API
  previously accepted unauthenticated writes.
- 2026-11-15 — Tests: vitest (unit) + supertest (API). — Same toolchain as Vite, no extra runner.
- 2026-11-15 — CI on GitHub-hosted runners. — Public repo, free minutes.
