# Knowledge Base

The knowledge base is how HomeGantry names a container without any labels. It is one small YAML file per service in
[`knowledge-base/`](https://github.com/geraldvd/homegantry/tree/main/knowledge-base). The files are validated and
converted to JSON at build time, so the running server needs no YAML parser.

## Add a service to the knowledge base

1. Copy the template to a new file named after the service:

   ```bash
   cp knowledge-base/_template.yaml knowledge-base/my-service.yaml
   ```

2. Edit it (see the [format](#format) below). Use public image names only.
3. Run the check:

   ```bash
   npm run kb:check
   ```

4. Open a pull request.

Not comfortable with a pull request? Open a
[Missing service](https://github.com/geraldvd/homegantry/issues/new?template=missing_service.yml) issue with the image
name, homepage and icon.

## Format

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

| Field            | Required | Description                                                                                              |
| ---------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `name`           | yes      | Display name                                                                                             |
| `description`    | yes      | One line about the service                                                                               |
| `category`       | yes      | Reuse an existing category where possible                                                                |
| `icon`           | no       | Slug from [dashboard-icons](https://github.com/homarr-labs/dashboard-icons); without it, a letter avatar |
| `defaultPort`    | no       | Default web UI port                                                                                      |
| `patterns`       | \*       | Image repositories, without tag or digest                                                                |
| `aliases`        | \*       | Compose service / container names. Case, `-`, `_` and `.` are ignored                                    |
| `traefik`        | \*       | Traefik router/service names, for services that do not run in Docker (Proxmox, a NAS, a router)          |
| `infrastructure` | no       | `true` hides the service by default (databases, caches, agents, socket proxies)                          |

\* An entry needs at least one of `patterns`, `aliases` or `traefik`.

`npm run kb:check` fails on an invalid entry, an unknown icon slug, or a pattern, alias or Traefik name that another
entry already uses. CI runs the same check.

## Matching rules

### Images

A pattern names a whole repository. Registry, tag and digest are handled for you:

| Pattern               | Matches                                                      | Does not match                       |
| --------------------- | ------------------------------------------------------------ | ------------------------------------ |
| `redis`               | `redis:7`, `docker.io/library/redis`, `bitnami/redis`        | `redis-exporter`, `example/redis-db` |
| `linuxserver/sonarr`  | `lscr.io/linuxserver/sonarr:4`, `ghcr.io/linuxserver/sonarr` | `example/sonarr`                     |
| `ghcr.io/example/app` | `ghcr.io/example/app:1`                                      | `quay.io/example/app`, `example/app` |
| `example/app-*`       | `example/app-web`, `ghcr.io/example/app-worker:1`            | `example/app`, `example/app/nested`  |

- Without a registry, a pattern matches on any registry and below any namespace or mirror prefix.
- With a registry, it matches only that registry.
- `*` is an explicit glob and stays within one path segment.
- If several entries match, the most specific pattern wins: a literal before a glob, then the longest.

### Order of precedence

For each field, the first source that has a value wins.

| Field       | 1           | 2                        | 3                      | 4              | 5                      |
| ----------- | ----------- | ------------------------ | ---------------------- | -------------- | ---------------------- |
| Name        | UI override | `homegantry.name`        | `homepage.name`        | Knowledge base | Container name         |
| Icon        | UI override | `homegantry.icon`        | `homepage.icon`        | Knowledge base | Letter avatar          |
| Category    | UI override | `homegantry.category`    | `homepage.group`       | Knowledge base | `Other`                |
| Description | UI override | `homegantry.description` | `homepage.description` | Knowledge base | _(empty)_              |
| URL         | UI override | `homegantry.url`         | `homepage.href`        | Traefik        | `HOMEGANTRY_HOST:port` |

A `homegantry.name` or `homepage.name` label means you named the service yourself: the knowledge base is then skipped
for that container. A knowledge-base entry is looked up by compose service name, then container name, then image.
Services without a container are looked up by Traefik router name, then service name.

## Coverage report

Editors see **N of M containers recognised** and the list of unrecognised images in the Settings drawer. The same data
is available from `GET /api/kb/coverage`, which needs edit rights and returns image repositories only:

```json
{ "total": 12, "recognised": 11, "unrecognised": ["example/custom-app"] }
```

## Icon metadata

The check compares slugs with a pinned copy of the dashboard-icons file list in
`knowledge-base/_meta/dashboard-icons.json`, so tests never call the network. To move the pin to the latest upstream
commit (or a specific one), run:

```bash
npm run kb:refresh-icons           # latest main
npm run kb:refresh-icons <commit>  # a specific commit
```

Then run `npm run kb:check` and commit the updated file.
