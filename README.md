# HomeGantry

Auto-discovering Docker homelab dashboard with real-time updates.

<!-- screenshot placeholder -->

## Features

- **Auto-discovery** — Detects running Docker containers and matches them against a knowledge base of 60+ services
- **Dark mode** glass-morphism UI with responsive grid and list layouts
- **Real-time updates** via Server-Sent Events (SSE) — no manual refresh needed
- **Stack management** — Group services by Docker Compose project, toggle stack visibility
- **Traefik support** — Automatically extracts URLs from Traefik router rules
- **Homepage compatibility** — Reads `homepage.*` Docker labels for easy migration
- **Manual services** — Add non-Docker services to your dashboard
- **Customizable** — Override names, icons, categories, and URLs per-service

## Quick Start

```yaml
# docker-compose.yml
services:
  homegantry:
    image: homegantry:latest
    ports:
      - "3000:3000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./data:/app/data
    environment:
      - HOMEGANTRY_HOST=192.168.1.100
    restart: unless-stopped
```

```bash
docker compose up -d
```

Open `http://localhost:3000` in your browser.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `HOMEGANTRY_PORT` | `3000` | Server listen port |
| `HOMEGANTRY_HOST` | _(empty)_ | Host/IP for service URL fallback (e.g. `192.168.1.100`) |
| `HOMEGANTRY_TITLE` | `HomeGantry` | Dashboard title |
| `HOMEGANTRY_DOCKER_SOCKET` | `/var/run/docker.sock` | Docker socket path |
| `HOMEGANTRY_POLL_INTERVAL` | `60` | Seconds between full Docker rescans |
| `HOMEGANTRY_SHOW_STOPPED` | `false` | Show stopped containers |
| `HOMEGANTRY_HOMEPAGE_COMPAT` | `true` | Read `homepage.*` labels |
| `HOMEGANTRY_EXCLUDE_SELF` | `true` | Hide the HomeGantry container |
| `HOMEGANTRY_COMPOSE_ONLY` | `true` | Only show containers from Compose projects |
| `HOMEGANTRY_DATA_DIR` | `./data` | Persistent data directory |
| `HOMEGANTRY_LOG_LEVEL` | `info` | Log level |

## Docker Labels

### HomeGantry labels

```yaml
labels:
  homegantry.name: "My Service"
  homegantry.icon: "plex"
  homegantry.url: "https://plex.example.com"
  homegantry.category: "Media"
  homegantry.description: "Media server"
  homegantry.exclude: "true"  # hide this container
```

### Homepage compatibility

```yaml
labels:
  homepage.name: "Sonarr"
  homepage.icon: "sonarr"
  homepage.href: "https://sonarr.example.com"
  homepage.group: "Media"
  homepage.description: "TV show manager"
```

### Traefik support

When Traefik router rules are present, HomeGantry extracts the `Host()` domain automatically:

```yaml
labels:
  traefik.http.routers.myapp.rule: "Host(`app.example.com`)"
  # HomeGantry resolves URL to https://app.example.com
```

## Stack Management

HomeGantry groups services by Docker Compose project (stack). In the Settings drawer you can:

- Toggle stack visibility to show/hide all services in a stack
- Set a custom display name and icon for each stack
- Switch between grouping by category or stack

## Development

```bash
npm install
npm run dev
```

This starts both the backend (`tsx watch`) and Vite dev server concurrently. Frontend is at `http://localhost:5173`.

```bash
npm run build        # Production build
npm run typecheck    # Type-check both frontend and server
```

## License

MIT
