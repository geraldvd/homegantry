# Health Checks

HomeGantry checks whether each service answers over HTTP and shows the result as a badge on its card. Checks are on by
default. Set `HOMEGANTRY_HEALTHCHECK=false` to turn them off.

## What the badges mean

| Badge           | Meaning                                                               |
| --------------- | --------------------------------------------------------------------- |
| **Up**          | The service answered with a status below 500, including 401, 403, 404 |
| **Down**        | HTTP 5xx, a timeout, or the host could not be reached                 |
| **TLS error**   | The certificate could not be verified, so the result is inconclusive  |
| **Not checked** | No usable result                                                      |

A card shows one status: a stopped container is **Stopped**, a running container without a result is **Running**,
otherwise the health result decides (see [Using the Dashboard](/guide/using-the-dashboard#status-on-a-card)). The
tooltip shows the detail and the last-checked time. An unchanged result is pushed to open dashboards at least every 30
seconds, so that time stays current. The **Show Status** setting hides the status.

## How a check works

- HomeGantry sends `HEAD`. It retries with `GET` on 405, on a 5xx, or if the server drops the connection.
- Redirects are not followed: a 3xx means the service is up.
- At most `HOMEGANTRY_HEALTHCHECK_CONCURRENCY` checks run at once, every `HOMEGANTRY_HEALTHCHECK_INTERVAL` seconds. A
  slow round is never overlapped by the next one.
- Stopped containers, hidden services, services in hidden stacks and services without a URL are skipped.
- With `HOMEGANTRY_HOST` empty, a service whose only URL is the `http://localhost:<port>` link fallback is skipped and
  has no badge, because `localhost` inside the container is HomeGantry itself. Set `HOMEGANTRY_HOST` or
  `homegantry.healthcheck.url` to check it.

::: tip Checks run from the HomeGantry container
The URL must resolve and be reachable from inside that container. If a public hostname does not work there, point the
check at the internal address with `homegantry.healthcheck.url`.
:::

## Per-service labels

```yaml
labels:
  # Do not check this service
  homegantry.healthcheck: 'false'

  # Check this URL instead of the service URL
  homegantry.healthcheck.url: 'http://jellyfin:8096/health'
```

Only `http(s)` URLs are used. An invalid `homegantry.healthcheck.url` is ignored and the service URL is checked instead.

## Turning checks off without labels

Services that only exist as Traefik routes (file provider) and manual services have no labels. Unlock editing, open
the service's edit dialog (<kbd>e</kbd> on a focused card, or the pencil) and clear **Health check (HTTP)**. This works
for every service and is stored as an override; it beats the `homegantry.healthcheck` label, so you can also turn checks
back on for a labelled container. **Revert to auto-detected** removes the override.

Via the API (edit rights required):

```bash
curl -X PUT -H "Authorization: Bearer $HOMEGANTRY_ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"healthcheck": false}' https://dash.example.com/api/services/<id>/override
# manual services: PUT /api/services/manual/<id> with the same body
# back to the label (or the default): {"healthcheck": null}
```

## Self-signed certificates

A self-signed certificate shows as **TLS error**. Either point `homegantry.healthcheck.url` at a plain-HTTP internal
address, or set `HOMEGANTRY_HEALTHCHECK_INSECURE_TLS=true` to skip certificate verification for health checks only.
Nothing but the status code is used from these responses.

## Privacy and security

- Health checks send no credentials. `user:pass@` in a URL is removed first.
- Logs contain the URL without userinfo, query string or fragment, and only when a result changes.
- The API returns only the status, reason, HTTP code and time, never raw error messages.
- HomeGantry requests the URLs of your services, so anyone who can edit the dashboard or set container labels can make
  it send a request to an address it can reach. Only the resulting status is shown. Keep editing restricted, see the
  [Security model](/guide/security).

## Options

| Variable                              | Default | Description                                  |
| ------------------------------------- | ------- | -------------------------------------------- |
| `HOMEGANTRY_HEALTHCHECK`              | `true`  | Enable HTTP health checks                    |
| `HOMEGANTRY_HEALTHCHECK_INTERVAL`     | `60`    | Seconds between check rounds (minimum 5)     |
| `HOMEGANTRY_HEALTHCHECK_TIMEOUT`      | `5`     | Seconds before a request counts as timed out |
| `HOMEGANTRY_HEALTHCHECK_CONCURRENCY`  | `8`     | Maximum simultaneous checks                  |
| `HOMEGANTRY_HEALTHCHECK_INSECURE_TLS` | `false` | Accept self-signed certificates              |
