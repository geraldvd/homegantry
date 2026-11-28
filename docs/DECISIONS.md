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
- 2026-11-23 — Knowledge base is one YAML file per service, validated with zod and converted to JSON at build time. `yaml`
  is a dev dependency; M3 adds no runtime dependency. — Contributors edit one small file (mission principle 6) and the
  runtime stays small (principle 3). Alternatives: one large JSON file (merge conflicts), a YAML parser at runtime.
- 2026-11-23 — Icon label precedence (#13a): per field, `homegantry.*` beats `homepage.*`, also when no name label is set.
  — The native label is the most explicit statement; previously `homepage.icon` overwrote `homegantry.icon`.
- 2026-11-23 — Image matching (#13c): a pattern matches a whole repository (any registry, namespace or mirror prefix unless
  the pattern names a registry); `*` is an explicit single-segment glob; the most specific pattern wins. — Substring
  matching labelled `redis_exporter` as Redis and hid it as infrastructure. Real variants the old rule found by accident
  (Komodo core/periphery, `nginx-unprivileged`, ...) got explicit patterns; the look-alikes that change are listed in
  `test/server/kb-migration.test.ts`.
- 2026-11-23 — Category precedence (#13d): `homegantry.category`, then `homepage.group`, beat the knowledge-base category,
  even for the value "Other". — A label is a deliberate choice by the user; the knowledge base is only a default.
- 2026-11-23 — `HOMEGANTRY_ICON_SOURCE`: `cdn` (default), a self-hosted base URL, or `off`. An invalid value means `off`,
  and the client shows letter avatars until the server has answered. — No external request may happen by accident. With
  `cdn` or a base URL the CSP keeps `img-src https: http:`, because explicit icon URLs in labels and overrides are an
  existing feature and can point anywhere; `off` allows only HomeGantry itself.
- 2026-11-23 — Icon slugs are checked against a pinned copy of the dashboard-icons file list (`npm run kb:refresh-icons`).
  — CI stays deterministic and unit tests make no network calls. Entries without an upstream icon omit `icon` and show a
  letter avatar.
- 2026-11-28 — M3 gate: five of the eight non-blocking findings from the M3 review (#43) are fixed in one lead PR; the
  other three (Traefik router suffixes, tags in one-segment patterns, `kb:check` across kinds) are filed as `[M5]`
  issues. — The five are small data, docs and template fixes; the three change matching or validation rules and belong
  with the discovery hardening work.
- 2026-11-28 — Real image variants that lost their match in M3 get explicit patterns: `redis/redis-stack` and
  `redis/redis-stack-server` are Redis (hidden as infrastructure), `nginxproxy/nginx-proxy` and `jwilder/nginx-proxy`
  are Nginx, and `jlesage/nginx-proxy-manager` is now Nginx Proxy Manager instead of Nginx. Published images that were
  never recognised are added too: `ghcr.io/henrygd/beszel/beszel(-agent)`, `paperlessngx/paperless-ngx`,
  `stirlingtools/stirling-pdf`, `ghcr.io/stirling-tools/stirling-pdf`, `qbittorrentofficial/qbittorrent-nox` and
  `ghcr.io/qbittorrent/docker-qbittorrent-nox` (each checked on its registry). — They are the official or widely used
  images of services already in the knowledge base; the changes are listed in `test/server/kb-migration.test.ts`.
- 2026-11-28 — Label precedence stays as implemented; the knowledge-base guide now documents it exactly: a name label
  skips the knowledge base, `homegantry.name` also ignores the `homepage.*` display labels, and a description label on
  its own is ignored. — The docs promised a per-field rule the code never had; changing the behaviour would move cards
  in existing dashboards without a request for it. Tests pin each rule.
- 2026-11-28 — `.env.example` lists every `HOMEGANTRY_*` option the server reads (enforced by a test), and the "Missing
  service" form no longer requires an icon. — Entries without an upstream icon are valid and show a letter avatar.
- 2026-11-28 — Next milestone is M4, UX: search, keyboard navigation, grouping and the mobile layout, with #30-#33. —
  The dashboard now recognises most services; finding and opening them quickly is the next most visible gap.
- 2026-11-28 — M4 adds no runtime dependency and no UI library: focus trapping, shortcuts and grouping are small
  hand-written hooks. `axe-core` is a dev dependency for accessibility checks in the component tests. — Mission
  principle 3. Alternatives: a headless UI kit (focus-trap, dialog) adds runtime weight for three dialogs and a drawer.
- 2026-11-28 — Search ranking: every word must match one of name, description, category, stack or URL host (case and
  accents ignored); results are one flat list ordered name-starts-with-query, then name-contains-all-words, then other
  fields, ties by sort order and name. — "Enter opens the first result" needs one obvious first result; keeping groups
  while searching would put a category match above a name match. Hidden services are not searched; stopped ones only
  when shown, and the empty state says when a stopped container would have matched.
- 2026-11-28 — Grouping keys: category as stored (empty, `Other` and `Uncategorized` mean no category), the Compose
  project (its display name as label) or the URL host name without port. The catch-all group is called **Other** in all
  three modes and is always last; groups sort by name with numbers in numeric order. — One name for "no group" is easier
  to explain than Uncategorized/Ungrouped/No host; manual services used to save `Uncategorized`, so it is folded in.
  Host without port groups services on one machine together; subdomains stay separate (no public-suffix list needed).
- 2026-11-28 — Collapsed groups are stored per browser (`localStorage`), the grouping itself in the server settings.
  The client now loads `/api/settings` on start; before, stored settings only arrived with a later change. — Collapsing
  is a personal view; the grouping is how the lab is organised and is the same for every viewer.
- 2026-11-28 — One status per card (#33): a stopped container is "Stopped"; otherwise a health result decides (Up, Down,
  TLS error, Not checked); a running container without a result is "Running"; Traefik and manual services without a
  result show nothing. "Down" on a running container says so in the tooltip. — Replaces the green container dot next
  to a red "Down" badge, which read as a contradiction (M2 gate Q3).
- 2026-11-28 — `PUT /api/services/:id/override` accepts `null` per field to remove it from the override (#31); an
  override left without fields is deleted. The edit dialog sends `url: null` for an empty URL and no `url` at all when
  it is unchanged. — `undefined` was dropped from the JSON body, so clearing never reached the server; not sending an
  unchanged URL stops saving the dialog from pinning the auto-detected URL as an override.
- 2026-11-28 — Health-check opt-out without labels (#32): `healthcheck: false|true` in an override (or a manual
  service), set with a checkbox in the edit dialog; an override beats the `homegantry.healthcheck` label. The API shows
  `healthcheckDisabled: true` (allow-listed) so the dialog can show the state. — Traefik-only services have no labels;
  hiding them was the only way to stop probing.
- 2026-11-28 — "Last checked" (#30): an unchanged health result is announced again over SSE at most every 30 seconds
  per service. — Keeps the tooltip current without an event per service on every short round; the time in the tooltip
  stays an absolute time, which is honest about the refresh interval.
- 2026-11-28 — The edit dialog sends only changed fields (M4 gate): a text field equal to the shown value (ignoring
  spaces) is left out, a cleared one is sent as `null` (back to auto-detected, as #31 did for the URL), and a save with
  no change sends no request. — Saving used to pin every shown value as an override, so later label or Knowledge Base
  changes no longer showed. Trade-off: an empty description cannot override a detected one; nobody asked for that.
- 2026-11-28 — `healthcheck: true` in an override is only kept when a `homegantry.healthcheck=false` label needs
  beating; otherwise the server removes the field (and manual services do not store `true`). — Checks are on by
  default, so turning them back on should leave no override behind. Deciding on the server avoids exposing where the
  opt-out came from in the API.
- 2026-11-28 — After hiding a service, focus moves to the next card in reading order, else the previous card, else the
  main landmark (`src/lib/focus.ts`), and only when focus was lost with the card. — Focus used to drop to `<body>`;
  the next card is where a keyboard user continues, the same order as the arrow keys.
- 2026-11-28 — All text fields in dialogs share one size: at least 44 px tall, full width, `text-base` (16 px) below
  the `sm` breakpoint; the category combobox and its suggestions are one shared component. — iOS Safari zooms into
  inputs with text under 16 px (seen on an iPad at the M4 gate).
- 2026-11-28 — Releases (M5): semantic versioning from 0.2.0, cut with release-please (manifest config, `node` release
  type, plain `vX.Y.Z` tags, `bump-minor-pre-major`). It keeps a release PR with the changelog and version bumps;
  merging it creates the tag and GitHub release. The first release is exactly 0.2.0: the manifest says `0.0.0`
  ("never released"), so `initial-version: 0.2.0` applies whatever the commit types, and `bootstrap-sha` (the last
  M4 commit) keeps the pre-release history out of the generated notes; the M0–M4 summary in `CHANGELOG.md` is
  written by hand. — A release PR gives the lead one review-and-merge step per release and needs nothing but
  `GITHUB_TOKEN`. Alternatives: semantic-release (releases on every merge, no review step), Changesets (a file per
  PR; meant for npm packages).
- 2026-11-28 — Release, image and SBOM run in one workflow run (`ci.yml`): `image` and `release assets` are gated on
  release-please's `release_created` output, and runs on `main` are never cancelled. — Only `GITHUB_TOKEN` is
  available, and events it creates (the release PR, tag and release) start no other workflow, so an
  `on: push: tags` or `on: release` workflow would never run. CI on the release PR is started by the lead closing
  and reopening it (CONTRIBUTING.md). Alternative: a PAT or GitHub App token (an extra secret to manage).
- 2026-11-28 — Image tags: `main` and `sha-<commit>` on every push to `main`; `X.Y.Z`, `X.Y` and `latest` only on a
  release, `X` from 1.0. Docs recommend pinning `X.Y`. The OCI `version` label is the release version on releases
  and `main` on main builds; the app always reports the `package.json` version. — `latest` used to move on every
  merge, so "latest" users ran unreleased code; before 1.0 a minor version may break, so `X.Y` is the safe pin.
- 2026-11-28 — Multi-arch with Buildx + QEMU on `ubuntu-latest`; the build stage runs on `$BUILDPLATFORM` (its output
  is plain JavaScript), so only the runtime stage (`apk`, `npm ci --omit=dev`) is emulated. Both platforms are built,
  smoke-tested (`/api/health` with the expected version) and scanned before the push; the push reuses their cache.
  — Keeps the arm64 build to minutes in one job. Alternative: native `ubuntu-24.04-arm` runners (faster, but a
  second job plus a manifest-merge step).
- 2026-11-28 — Image scan with Grype (`anchore/scan-action`): fail on CRITICAL/HIGH findings that have a fix
  (`only-fixed`), accepted findings in `.grype.yaml` with a mandatory `reason` (checked by a test). The SBOM is the
  BuildKit SPDX attestation (`sbom: true`, plus `provenance: mode=max`); the release asset is extracted from it with
  `docker buildx imagetools`, so the attached file and the attestation are the same document. — Findings without a
  fix cannot be acted on and would block every build. Grype's ignore rules carry a `reason` field, so the reason
  lives next to the rule. Alternatives: Trivy (an equivalent scanner), a separate Syft step for the SBOM (a second
  tool producing a second, possibly different SBOM).
- 2026-11-28 — Image base `node:22-alpine` (was `node:20-alpine`), pinned by digest, with `apk upgrade` in the
  runtime stage; npm, corepack and yarn are removed from the final image. — Node 20 is end-of-life and its image had
  fixable critical findings; 22 is already in the CI matrix. The digest makes base updates reviewed Dependabot PRs;
  `apk upgrade` picks up OS fixes in between. The app never runs npm, and its bundled packages only add findings.
- 2026-11-28 — npm audit triage (#11): runtime findings fixed (`npm audit fix`, express `^4.22.3` for qs 6.16, and an
  `overrides` entry giving dockerode `uuid ^11.1.1`; dockerode only calls `uuid.v4`, which the advisory does not
  affect). CI runs `npm audit --omit=dev` (0 findings). The remaining findings are dev tooling only and need major
  upgrades: vitest 3 (tinypool, `@vitest/mocker`; `@vitest/coverage-v8` via glob/minimatch) and vitepress 1.6 (its
  own vite 5 / esbuild, no fix released). They are left to Dependabot's major-update PRs. — None of them ships in the
  image or runs outside a developer's machine and CI; majors deserve their own reviewed PR.
- 2026-11-28 — Dependency updates with Dependabot (npm, Docker, GitHub Actions; weekly on Monday; minor/patch grouped
  per runtime/dev deps, all base images and all actions in one PR each; majors as single PRs, e.g. ESLint 10 for #12).
  Titles are Conventional Commits: runtime deps and base images `fix(deps)` (they change the image, so they lead to
  a patch release), dev deps `chore(deps-dev)`, actions `ci(deps)`. Actions are pinned to full commit SHAs with the
  version in a comment, which Dependabot updates. — Built into GitHub: no app to install and no third party with
  write access; groups and schedules cover what we need. Alternative: Renovate (more options, dependency dashboard)
  needs the Mend app installed with write access.
- 2026-11-28 — PR titles are checked by `scripts/pr-title.ts` in a `PR title` workflow (title passed as an environment
  variable). — About 50 tested lines instead of a marketplace action that runs third-party code on every PR; it runs
  on plain Node 22 without `npm ci`.
- 2026-11-28 — The version is public: `GET /api/health` and `GET /api/ui-config` return `version`, the footer shows
  "HomeGantry vX.Y.Z" linking to the release notes. It is read at start-up from the nearest `package.json` named
  `homegantry`. — Not sensitive (it is in the image tag too) and needed for bug reports and upgrades. Reading
  `package.json` keeps one source of truth that release-please updates.
- 2026-11-28 — M5 adds no npm dependency (runtime or dev). New CI tools, each pinned by SHA: release-please-action
  (releases), `docker/setup-qemu-action` (arm64 emulation), `anchore/scan-action` (Grype scan). The existing actions
  moved to their current majors (Node 24 runtimes). — Mission principle 3.
