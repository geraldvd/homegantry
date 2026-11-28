# Contributing to HomeGantry

Thanks for helping out! HomeGantry is a small project; this page covers everything you need to send a good pull
request. Please read [docs/MISSION.md](docs/MISSION.md) first: it explains what HomeGantry is (and is not) trying to be.

## Development setup

Requirements: **Node.js 20 or 22**, npm 10+, and (optionally) Docker to see real containers.

```bash
git clone https://github.com/geraldvd/homegantry.git
cd homegantry
npm install
npm run dev
```

`npm run dev` starts the Express backend (`tsx watch`, port 3000) and the Vite dev server
([http://localhost:5173](http://localhost:5173)), which proxies `/api` to the backend.

### Working without Docker

You do not need a Docker socket to work on the UI. `npm run dev:fixture` starts the backend with a fake Docker client
and a fake Traefik API that serve a small example lab (see `test/fixtures/`), with every exposure and health badge
state. The fixture backend serves the UI from
`dist/client`, so either run `npm run dev:client` next to it (UI on port 5173, with hot reload) or run
`npm run build:client` once first (UI on port 3000). This is a development aid only and is not part of the shipped
server.

## Checks

Every pull request must keep these green (CI runs them on Node 20 and 22):

```bash
npm run typecheck   # TypeScript, client + server + tests
npm run lint        # ESLint + Prettier check (npm run format fixes formatting)
npm run kb:check    # knowledge base: schema, duplicates, icon slugs
npm test            # vitest unit + supertest API tests
npm run build       # production build
```

`npm run test:coverage` prints a coverage report for `server/` (HTML report in `coverage/`).

### Writing tests

- Tests live in `test/` and use [vitest](https://vitest.dev/); API tests use
  [supertest](https://github.com/ladjs/supertest) against `createApp()` from `server/app.ts`.
- Never talk to a real Docker socket in tests. Use `fakeDocker()` and `loadServer()` from `test/helpers.ts`;
  `loadServer()` gives you fresh modules with your environment variables and an empty temporary data directory.
- New behaviour ships with tests. Bug fixes ship with a test that fails without the fix.
- Use only example data: `example.com` domains and `192.168.1.100`-style LAN addresses. Never real hostnames or IPs.

## Pull request titles and commits

Pull requests are **squash-merged**: the PR title becomes the one commit on `main`, and release-please turns it into
the line in [CHANGELOG.md](CHANGELOG.md). So the **PR title** must be a
[Conventional Commit](https://www.conventionalcommits.org/); the **PR title** check in CI enforces it
(`scripts/pr-title.ts`, rerun by editing the title):

```
feat(matcher): match images from quay.io
fix(routes): return 404 for unknown stacks
docs: explain HOMEGANTRY_HOST
test(docker): cover reconnect backoff
feat(api)!: rename the exposure field
```

`type(optional-scope): description`, with one of `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`,
`chore`, `style`, `revert`; the scope is lower case. What the type does to the next release:

| Title                                       | Changelog section      | Next version (before 1.0) |
| ------------------------------------------- | ---------------------- | ------------------------- |
| `feat: ...`                                 | Features               | minor (`0.2.0` → `0.3.0`) |
| `fix: ...`, `perf: ...`                     | Bug Fixes, Performance | patch (`0.2.0` → `0.2.1`) |
| `feat!: ...` or a `BREAKING CHANGE:` footer | Breaking changes       | minor before 1.0          |
| `docs`, `test`, `refactor`, `ci`, `chore`…  | not listed             | no release on its own     |

Dependabot titles follow the same rules: runtime dependencies and base images are `fix(deps): ...` (they change the
image), dev tooling is `chore(deps-dev): ...`, actions are `ci(deps): ...`. Commits inside a PR should use the same
style, but only the title ends up on `main`. Keep pull requests focused, and update the README/docs in the same pull
request as the behaviour change.

## Releases

Releases are automated with [release-please](https://github.com/googleapis/release-please) in the `release-please`
job of the CI workflow; only the default `GITHUB_TOKEN` is used.

1. **Release PR.** After every push to `main`, release-please opens or updates a pull request
   `chore(main): release X.Y.Z`. It contains the new `CHANGELOG.md` section and the version in `package.json`,
   `package-lock.json`, the `Dockerfile` label default and `.release-please-manifest.json`. Nothing else goes in it.
2. **CI on the release PR.** GitHub starts no workflow for a pull request that `GITHUB_TOKEN` created or pushed to,
   so the release PR shows no checks at first. Before merging, **close and reopen it** (a reopen by a person starts
   CI and the PR-title check). Do this right before merging: every later push to `main` makes release-please update
   the PR again, without checks. The checks are not strictly needed (the PR only changes versions and the
   changelog, and the merge run tests everything again before pushing an image), but required status checks in a
   branch protection rule would otherwise block the merge.
3. **Merge it** (squash). The CI run for that merge does it all in one run, because a tag or release created with
   `GITHUB_TOKEN` would not start another workflow:
   - `release-please` creates the `vX.Y.Z` tag and the GitHub release with the changelog section as notes;
   - `image` builds `linux/amd64` and `linux/arm64`, smoke-tests (`/api/health` answers with the new version) and
     scans both, then pushes `X.Y.Z`, `X.Y`, `latest` (and `X` from 1.0) plus `main` and `sha-…`, with SBOM and
     provenance attestations;
   - `release assets (SBOM)` attaches `homegantry-X.Y.Z-linux-amd64.spdx.json` and `…-linux-arm64.spdx.json` to the
     release.
4. **Check** the release:

   ```bash
   gh release view vX.Y.Z -R geraldvd/homegantry           # notes + two .spdx.json assets
   docker manifest inspect ghcr.io/geraldvd/homegantry:X.Y.Z   # linux/amd64 + linux/arm64
   docker buildx imagetools inspect ghcr.io/geraldvd/homegantry:latest   # same digest as X.Y.Z
   ```

`docker manifest inspect` also lists two `unknown/unknown` entries: those are the attestation manifests, not images.

If `image` or `release assets` fails after the release was created for a passing reason (registry or network
trouble), use **Re-run failed jobs** on that run: the release outputs are kept, so the same tags are pushed. If the
scan blocks the image, fix the finding (or record an accepted one in `.grype.yaml`, with a reason) in a pull request
and release a patch version; the blocked version keeps its tag but gets no image. To force a version, put
`Release-As: X.Y.Z` in the body of a commit on `main`. Pushes to `main` never move `latest`.

## Adding a service to the knowledge base

Each service is one small YAML file in `knowledge-base/`; no code changes needed:

```bash
cp knowledge-base/_template.yaml knowledge-base/my-service.yaml
# edit the file
npm run kb:check
```

```yaml
name: Jellyfin
description: The free software media system
icon: jellyfin
category: Media
defaultPort: 8096
patterns:
  - jellyfin/jellyfin
  - linuxserver/jellyfin
aliases:
  - jellyfin
```

- **`patterns`**: image repositories (without tag). A pattern matches whole path segments on any registry, so
  `linuxserver/jellyfin` matches `lscr.io/linuxserver/jellyfin:latest`, and `redis` never matches `redis-exporter`.
  Use `*` for an explicit glob (`example/app-*`).
- **`aliases`**: compose service names / container names. Comparison ignores case, `-`, `_` and `.`.
- **`traefik`**: router/service names for services that do not run in Docker (Proxmox, a NAS, a router).
- **`icon`**: a slug from [dashboard-icons](https://github.com/homarr-labs/dashboard-icons) (e.g. `jellyfin`). Leave it
  out if there is none.
- **`category`**: reuse an existing category where possible (Media, Monitoring, Storage, Network, Security, ...).
- **`infrastructure: true`**: hides the service by default (databases, caches, socket proxies).

`npm run kb:check` validates the format, icon slugs and duplicates. Use public images and products only. The full
reference is in [docs/guide/knowledge-base.md](docs/guide/knowledge-base.md). If you cannot open a pull request, file a
[Missing service](https://github.com/geraldvd/homegantry/issues/new?template=missing_service.yml) issue instead.

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Make your change with tests and docs.
3. Run the checks above.
4. Open a pull request and fill in the checklist in the template.

Security issues: please do **not** open a public issue, see [SECURITY.md](SECURITY.md).
