# Security Model

HomeGantry is **secure by default**: out of the box the dashboard is read-only, the API never returns secrets, and
nothing you do in the browser can change your containers. This page explains what HomeGantry protects, how to enable
editing, and how to deploy it safely.

## Threat model

HomeGantry is meant to run on a home LAN, often behind a reverse proxy, and sometimes reachable from the internet.

| What we protect                    | How                                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Your Docker host**               | HomeGantry only _reads_ from Docker (list containers, watch events). It never starts, stops, creates or removes anything. Use a read-only socket proxy. |
| **Secrets in your containers**     | The API returns an explicit allow-list of fields. Env vars, mounts, full label sets and other internals are never sent to the browser.                  |
| **Your dashboard configuration**   | All edits (overrides, manual services, stacks, settings) are refused unless the request is authorised.                                                  |
| **Visitors' browsers**             | Strict security headers (CSP, no framing), URLs are validated (`http(s)` only, so no `javascript:` links), all input is validated.                      |
| **Brute force and request floods** | Per-IP rate limits on writes and on failed authentication attempts; request bodies are limited to 16 kB.                                                |

Out of scope: user accounts and roles (HomeGantry has one "editor" level), and protecting the _read-only_ dashboard
from people who can reach it. If the list of services itself is sensitive, put HomeGantry behind your reverse proxy's
authentication (see below).

## Read-only by default

Without configuration HomeGantry is a read-only dashboard: every `PUT`, `POST`, `PATCH` and `DELETE` under `/api/` is
rejected, and the UI hides the edit controls and shows a **Read-only** badge. The startup log says how to enable
editing.

![Read-only dashboard](/security-read-only.png)

There are two ways to authorise edits. Either is enough; both are optional.

### Option 1: admin token

```bash
# Generate a long random token (at least 24 characters, or it is ignored)
openssl rand -hex 32
```

```yaml
environment:
  - HOMEGANTRY_ADMIN_TOKEN=${HOMEGANTRY_ADMIN_TOKEN} # set it in .env, not in git
```

The UI now shows **Unlock editing**. Enter the token once; it is kept in the tab's `sessionStorage` (gone when you
close the tab) and sent as `Authorization: Bearer <token>`. **Lock** forgets it again. Scripts can use the same
header:

```bash
curl -X PATCH https://homegantry.example.com/api/settings \
  -H "Authorization: Bearer $HOMEGANTRY_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"columns": 5}'
```

The token is compared in constant time. After 10 failed attempts from one IP within 15 minutes, further attempts are
refused (HTTP 429) until the window ends.

![Unlocked dashboard](/security-unlocked.png)

### Option 2: forward-auth header (Authelia, Authentik, oauth2-proxy, ...)

If your reverse proxy already authenticates users, let it tell HomeGantry who is signed in:

```yaml
environment:
  - HOMEGANTRY_AUTH_HEADER=Remote-User # Authelia; Authentik: X-authentik-username
  - HOMEGANTRY_TRUSTED_PROXIES=172.18.0.0/16 # the proxy's IP or network
```

Any request that carries a non-empty `Remote-User` header **from a trusted proxy IP** may edit. The header is ignored
from every other IP, so a client cannot simply send it itself. Make sure:

- `HOMEGANTRY_TRUSTED_PROXIES` lists only your reverse proxy (an IP or a small CIDR such as its Docker network);
- HomeGantry's port is **not** published directly (otherwise clients bypass the proxy), and
- the proxy strips or overwrites the header on incoming requests (Authelia, Authentik and oauth2-proxy do this for the
  headers they set).

### Fully read-only

`HOMEGANTRY_READONLY=true` disables editing completely, even with a valid token or header. Useful for a public
"status wall" instance.

## No secrets in the API

`/api/services`, `/api/stacks`, `/api/settings` and the `/api/events` stream return the same explicit allow-list of
fields: name, description, URL, icon, category, status, stack, and for containers only the name, image, state, compose
project/service and port numbers. Container environment variables, mounts and full label sets are never read into the
response. Labels whose key looks secret (`*password*`, `*passwd*`, `*secret*`, `*token*`, `*key*`, `*credential*`)
are dropped as soon as containers are read, so they never enter HomeGantry's state at all.

## Request hardening

- **Same-origin check:** writes whose `Origin` (or `Referer`) is not HomeGantry's own host are rejected (403). This
  stops other websites from making your browser edit the dashboard (CSRF), including with forward-auth cookies.
  Requests without either header (scripts, `curl`) are allowed through to authentication.
- **Validation:** every request body, route parameter and query string is checked with a schema; unknown fields,
  overlong strings and non-`http(s)` URLs are rejected with 400.
- **Limits:** request bodies up to 16 kB; 120 writes per minute per client IP.
- **Headers:** `Content-Security-Policy` (scripts and connections only to HomeGantry itself, no framing),
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `X-Frame-Options: DENY`.
- **CORS** is off. Set `HOMEGANTRY_CORS_ORIGINS` only if another web app must call the API from the browser.

Behind a trusted proxy, rate limits use the client address from `X-Forwarded-For` and the same-origin check also
accepts `X-Forwarded-Host`; from other IPs those headers are ignored.

## Docker socket: use a read-only socket proxy

Mounting `/var/run/docker.sock` gives a container full control of Docker, even with `:ro` (that only stops the file
from being replaced, not API calls through it). HomeGantry only needs two read-only endpoints, so the recommended setup
puts a socket proxy in between that allows exactly those:

<<< ../../examples/compose.socket-proxy.yaml{yaml}

HomeGantry connects through `DOCKER_HOST=tcp://socket-proxy:2375`; the proxy sits on an `internal` network and allows
only `CONTAINERS` and `EVENTS` (all `GET`). `POST` and everything else is refused. The file is also in the repository
as [`examples/compose.socket-proxy.yaml`](https://github.com/geraldvd/homegantry/blob/main/examples/compose.socket-proxy.yaml).

## Reverse-proxy examples

### Traefik + Authelia (forward auth for everything)

The whole dashboard requires a login; signed-in users may edit.

```yaml
services:
  homegantry:
    image: ghcr.io/geraldvd/homegantry:latest
    environment:
      - DOCKER_HOST=tcp://socket-proxy:2375
      - HOMEGANTRY_AUTH_HEADER=Remote-User
      - HOMEGANTRY_TRUSTED_PROXIES=172.18.0.0/16 # the "proxy" network below
    networks: [proxy, docker-api]
    labels:
      - traefik.enable=true
      - traefik.docker.network=proxy
      - traefik.http.routers.homegantry.rule=Host(`homegantry.example.com`)
      - traefik.http.routers.homegantry.tls.certresolver=le
      - traefik.http.routers.homegantry.middlewares=authelia@docker
      - traefik.http.services.homegantry.loadbalancer.server.port=3000
```

with the usual Authelia middleware on your Authelia container:

```yaml
- traefik.http.middlewares.authelia.forwardauth.address=http://authelia:9091/api/authz/forward-auth
- traefik.http.middlewares.authelia.forwardauth.trustForwardHeader=true
- traefik.http.middlewares.authelia.forwardauth.authResponseHeaders=Remote-User,Remote-Groups,Remote-Email,Remote-Name
```

### Traefik + Authentik

Same as above, with Authentik's outpost middleware and its header name:

```yaml
environment:
  - HOMEGANTRY_AUTH_HEADER=X-authentik-username
  - HOMEGANTRY_TRUSTED_PROXIES=172.18.0.0/16
labels:
  - traefik.http.routers.homegantry.middlewares=authentik@docker
```

```yaml
# on the Authentik outpost container
- traefik.http.middlewares.authentik.forwardauth.address=http://authentik-outpost:9000/outpost.goauthentik.io/auth/traefik
- traefik.http.middlewares.authentik.forwardauth.trustForwardHeader=true
- traefik.http.middlewares.authentik.forwardauth.authResponseHeaders=X-authentik-username,X-authentik-groups,X-authentik-email
```

### Public read-only dashboard, token for editing

No proxy login; everyone sees the dashboard, only token holders edit:

```yaml
environment:
  - HOMEGANTRY_ADMIN_TOKEN=${HOMEGANTRY_ADMIN_TOKEN}
```

::: tip Finding `HOMEGANTRY_TRUSTED_PROXIES`
`docker network inspect proxy` shows the subnet (under `IPAM.Config`) of the network HomeGantry shares with Traefik.
Prefer the proxy's fixed IP if you assign one.
:::

## Reporting a vulnerability

See [SECURITY.md](https://github.com/geraldvd/homegantry/blob/main/SECURITY.md): please report privately via GitHub
security advisories.
