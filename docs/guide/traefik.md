# Traefik Discovery

HomeGantry works without a reverse proxy. If you run [Traefik](https://traefik.io/), it can use it in two ways:

- **Labels (always on):** a container's `traefik.http.routers.*.rule` label gives its URL.
- **Traefik API (optional):** HomeGantry reads Traefik's routers, services and middlewares. It then also shows services
  that are not containers on this host, uses the real TLS setup and path, and shows how each service is exposed.

## Enabling the Traefik API safely

The API shows your full routing configuration, so keep it off the internet and off your shared proxy network. Give
Traefik and HomeGantry a small internal network and do not publish port 8080:

```yaml
services:
  traefik:
    image: traefik:v3
    command:
      - --api=true
      - --api.insecure=true # serves the API on the "traefik" entrypoint (:8080), without a router
      - --providers.docker=true
      - --providers.docker.exposedbydefault=false
      - --entrypoints.websecure.address=:443
    ports:
      - '443:443' # note: 8080 is not published
    networks: [proxy, traefik-api]

  homegantry:
    image: ghcr.io/geraldvd/homegantry:latest
    environment:
      - HOMEGANTRY_TRAEFIK_API_URL=http://traefik:8080
    networks: [proxy, traefik-api]

networks:
  proxy:
    external: true
  traefik-api:
    internal: true
```

HomeGantry only sends `GET` requests to `/api/http/routers`, `/api/http/services` and `/api/http/middlewares`, on every
Docker event and every `HOMEGANTRY_POLL_INTERVAL` seconds (at most once per 2 seconds).

If the API sits behind authentication, set `HOMEGANTRY_TRAEFIK_API_USERNAME` and `HOMEGANTRY_TRAEFIK_API_PASSWORD`, or
`HOMEGANTRY_TRAEFIK_API_TOKEN` for a bearer token. These are only sent to the configured API (redirects are refused)
and never appear in logs or API responses. HomeGantry keeps none of the middleware settings it reads, such as
basic-auth users, forward-auth addresses or IP ranges.

If the API is absent, unreachable or returns errors, HomeGantry logs one line and carries on with Docker only. It picks
Traefik up again as soon as the API answers.

## What gets discovered

| Traefik router                                 | On the dashboard                                                      |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| **Docker provider**, container running         | Merged with the container (no duplicate); Traefik supplies URL, badge |
| **Docker provider**, no matching container     | Ignored                                                               |
| **File and other providers**                   | A service of its own, e.g. Proxmox or a NAS on another host           |
| **Internal** (`api@internal`, ACME, ...)       | Ignored                                                               |
| **Redirect-only** (see below)                  | Ignored                                                               |
| **Without a literal host** (`HostRegexp`, ...) | No link or card of its own, but counts for the service's exposure     |

A router is redirect-only when its `redirectScheme` middleware targets the scheme the router does not serve, such as
`scheme: https` on a non-TLS router. Traefik does not redirect a request whose URL would stay the same, so a TLS router
with `scheme: https` still serves the service and counts as a normal router.

Standalone services take their name, icon and category from the knowledge base when the router or service name matches.
Hide or edit them like any other service. Several routers on one Traefik service become one card.

A container is matched to its routers by its `traefik.http.routers.*` and `traefik.http.services.*` labels, or by
Traefik's default name (`<compose service>-<compose project>`).

### How the URL is built

- **Host:** the first literal host in the rule. ``Host(`a.example.com`, `b.example.com`)`` and
  ``Host(`a.example.com`) || Host(`b.example.com`)`` both link to `a.example.com`. Set `homegantry.url` to choose
  another one.
- **Path:** a literal `Path` or `PathPrefix` combined with `&&` is added to the URL.
- **Scheme:** `https` when the router has TLS or uses an entrypoint called `websecure` or `https`, otherwise `http`.
- **Port:** not included. A router on a non-standard entrypoint port needs `homegantry.url`.

An explicit `homegantry.url` or `homepage.href` label always wins. Without the API, label rules are assumed to be
`https` and paths are not added.

## Exposure badges

With the Traefik API enabled, each routed service gets a badge. Its tooltip names the middleware it is based on.

| Badge       | Meaning                                                                    |
| ----------- | -------------------------------------------------------------------------- |
| **Public**  | No middleware that restricts access                                        |
| **SSO**     | Behind a login (forward auth, basic auth, ...)                             |
| **Private** | Only reachable from allowed networks, e.g. LAN or VPN (IP allow-list)      |
| **Unknown** | A middleware HomeGantry cannot classify, and nothing that restricts access |

Services without a Traefik router have no badge.

::: warning A badge is a hint, not a security audit
It reflects the Traefik configuration, not what is reachable from the internet. A published container port bypasses
Traefik entirely, and an IP allow-list only means "private" if its ranges are private networks.
:::

How the level is decided:

1. Chains are expanded, including nested chains.
2. Each middleware is classified by `HOMEGANTRY_EXPOSURE_MAP`, then by the default name patterns, then by its Traefik
   type.
3. The strictest result wins for a router: `private`, then `sso`, then `unknown`, then `public`.
4. If a service has several routers, the **loosest** router sets the badge, including routers that cannot produce a link
   (`PathPrefix` only, `HostRegexp`, wildcards) and routers from another provider that target the same Traefik service
   (`service: app@docker` in a file-provider router). One public route makes the service public.

Default name patterns (case-insensitive):

| Pattern                          | Level     |
| -------------------------------- | --------- |
| `*forwardauth*`                  | `sso`     |
| `*authentik*`, `*authelia*`      | `sso`     |
| `*ipallowlist*`, `*ipwhitelist*` | `private` |

Type fallback: `forwardAuth`, `basicAuth` and `digestAuth` count as `sso`; `ipAllowList` and `ipWhiteList` as
`private`. Traefik's built-in middlewares that do not restrict access (`headers`, `compress`, `rateLimit`, ...) are
neutral. Anything else, such as a plugin, gives `unknown`.

### Custom mapping

`HOMEGANTRY_EXPOSURE_MAP` is a comma-separated list of `pattern=level`. Levels are `public`, `sso`, `private` and
`unknown`. Patterns may use `*` and `?`, ignore case, and match with or without the `@provider` suffix. The first
matching entry wins, and the map is checked before the defaults.

```bash
# A plugin that does SSO, and a group of office-only allow-lists
HOMEGANTRY_EXPOSURE_MAP=my-sso-plugin=sso,office-*=private

# Only this provider's instance counts
HOMEGANTRY_EXPOSURE_MAP=gate@file=sso

# A middleware that looks like auth but lets everyone in
HOMEGANTRY_EXPOSURE_MAP=authelia-bypass=public
```

## Running HomeGantry behind Traefik

To expose HomeGantry itself through Traefik, see the [Reverse Proxy](/guide/reverse-proxy) guide.
