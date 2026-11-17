# Environment Variables

All configuration is done through environment variables. None are required — sensible defaults are provided for everything.

## Reference

| Variable                     | Default                | Description                                                                                                                    |
| ---------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `HOMEGANTRY_PORT`            | `3000`                 | Port the server listens on inside the container                                                                                |
| `HOMEGANTRY_HOST`            | _(empty)_              | Fallback host/IP for building service URLs (e.g. `192.168.1.100`). Used when no Traefik rule or explicit URL label is present. |
| `HOMEGANTRY_TITLE`           | `HomeGantry`           | Dashboard title shown in the header                                                                                            |
| `HOMEGANTRY_DOCKER_SOCKET`   | `/var/run/docker.sock` | Path to the Docker socket                                                                                                      |
| `HOMEGANTRY_POLL_INTERVAL`   | `60`                   | Seconds between full Docker rescans. Real-time events are always active; this is a safety-net rescan.                          |
| `HOMEGANTRY_SHOW_STOPPED`    | `false`                | Show stopped containers on the dashboard                                                                                       |
| `HOMEGANTRY_HOMEPAGE_COMPAT` | `true`                 | Read `homepage.*` Docker labels (for migration from Homepage)                                                                  |
| `HOMEGANTRY_EXCLUDE_SELF`    | `true`                 | Hide the HomeGantry container from its own dashboard                                                                           |
| `HOMEGANTRY_COMPOSE_ONLY`    | `true`                 | Only show containers that belong to a Docker Compose project                                                                   |
| `HOMEGANTRY_DATA_DIR`        | `/data`                | Directory for persistent JSON data (overrides, settings, manual services)                                                      |
| `HOMEGANTRY_LOG_LEVEL`       | `info`                 | Log level: `debug`, `info`, `warn`, `error`                                                                                    |

## Security

See the [Security model](/guide/security) for how these fit together.

| Variable                     | Default   | Description                                                                                                                                                                                       |
| ---------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HOMEGANTRY_ADMIN_TOKEN`     | _(empty)_ | Token that unlocks editing (UI: "Unlock editing"; API: `Authorization: Bearer <token>`). Must be at least 24 characters, otherwise it is ignored.                                                 |
| `HOMEGANTRY_AUTH_HEADER`     | _(empty)_ | Header set by your forward-auth proxy, e.g. `Remote-User` (Authelia) or `X-authentik-username` (Authentik). Any non-empty value allows editing.                                                   |
| `HOMEGANTRY_TRUSTED_PROXIES` | _(empty)_ | Comma-separated IPs/CIDRs of your reverse proxy. `HOMEGANTRY_AUTH_HEADER`, `X-Forwarded-For` and `X-Forwarded-Host` are only honoured from these.                                                 |
| `HOMEGANTRY_READONLY`        | `false`   | Disable editing completely, even with a valid token or header                                                                                                                                     |
| `HOMEGANTRY_CORS_ORIGINS`    | _(empty)_ | Comma-separated origins allowed to call the API from another website (e.g. `https://dash.example.com`). CORS is off when empty.                                                                   |
| `DOCKER_HOST`                | _(empty)_ | Docker API endpoint, e.g. `tcp://socket-proxy:2375` for a [read-only socket proxy](/guide/security#docker-socket-use-a-read-only-socket-proxy). Takes precedence over `HOMEGANTRY_DOCKER_SOCKET`. |

With neither `HOMEGANTRY_ADMIN_TOKEN` nor `HOMEGANTRY_AUTH_HEADER` + `HOMEGANTRY_TRUSTED_PROXIES` set, HomeGantry is
read-only.

## Example `.env` File

```bash
HOMEGANTRY_PORT=3000
HOMEGANTRY_HOST=192.168.1.100
HOMEGANTRY_TITLE=My Homelab
HOMEGANTRY_POLL_INTERVAL=30
HOMEGANTRY_SHOW_STOPPED=false
HOMEGANTRY_HOMEPAGE_COMPAT=true
HOMEGANTRY_EXCLUDE_SELF=true
HOMEGANTRY_COMPOSE_ONLY=true
HOMEGANTRY_LOG_LEVEL=info
# Optional: enable editing (generate with: openssl rand -hex 32)
HOMEGANTRY_ADMIN_TOKEN=change-me-use-a-long-random-token
```

## `HOMEGANTRY_HOST` Explained

This is the most important variable for most setups. It tells HomeGantry what IP or hostname to use when building clickable URLs for services that don't have an explicit URL set.

**URL resolution order:**

1. `homegantry.url` label on the container (explicit)
2. `homepage.href` label (if `HOMEGANTRY_HOMEPAGE_COMPAT` is enabled)
3. Traefik `Host()` router rule (auto-extracted)
4. `http://{HOMEGANTRY_HOST}:{container_port}` (fallback)

If `HOMEGANTRY_HOST` is empty and none of the above apply, the service will have no URL.
