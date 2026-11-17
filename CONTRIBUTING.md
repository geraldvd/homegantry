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
that serves a small example lab (see `test/fixtures/containers.ts`). The fixture backend serves the UI from
`dist/client`, so either run `npm run dev:client` next to it (UI on port 5173, with hot reload) or run
`npm run build:client` once first (UI on port 3000). This is a development aid only and is not part of the shipped
server.

## Checks

Every pull request must keep these green (CI runs them on Node 20 and 22):

```bash
npm run typecheck   # TypeScript, client + server + tests
npm run lint        # ESLint + Prettier check (npm run format fixes formatting)
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

## Commit style

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(matcher): match images from quay.io
fix(routes): return 404 for unknown stacks
docs: explain HOMEGANTRY_HOST
test(docker): cover reconnect backoff
```

Common types: `feat`, `fix`, `docs`, `test`, `refactor`, `style`, `build`, `ci`, `chore`. Keep commits small and
focused, and update the README/docs in the same pull request as the behaviour change.

## Adding a service to the knowledge base

The knowledge base is `server/known-services.json`, a list of entries like:

```json
{
  "name": "Jellyfin",
  "description": "The free software media system",
  "icon": "jellyfin",
  "category": "Media",
  "defaultPort": 8096,
  "patterns": ["jellyfin/jellyfin", "linuxserver/jellyfin", "ghcr.io/jellyfin/jellyfin"],
  "aliases": ["jellyfin"]
}
```

- **`patterns`**: image repositories (without tag). Matching is a case-insensitive substring match on the image
  repository, so `linuxserver/jellyfin` also matches `lscr.io/linuxserver/jellyfin:latest`. Keep patterns specific
  enough that they do not match unrelated images.
- **`aliases`**: compose service names / container names. Comparison ignores case, `-`, `_` and `.`.
- **`icon`**: a slug from [dashboard-icons](https://github.com/homarr-labs/dashboard-icons) (e.g. `jellyfin`).
- **`category`**: reuse an existing category where possible (Media, Monitoring, Storage, Network, Security, ...).
- **`infrastructure: true`**: hides the service by default (databases, caches, socket proxies).

Entries are checked in order and the first match wins. Add a test case to `test/server/matcher.test.ts` for the new
image, run the checks above, and open a pull request (the "New service" issue template lists the same information).

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Make your change with tests and docs.
3. Run the checks above.
4. Open a pull request and fill in the checklist in the template.

Security issues: please do **not** open a public issue, see [SECURITY.md](SECURITY.md).
