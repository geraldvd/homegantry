# Getting Started

## Requirements

- **Docker Engine 20.10+** with the Docker socket accessible at `/var/run/docker.sock`
- **Docker Compose v2** (the `docker compose` CLI plugin)
- Containers must be managed by **Docker Compose** (HomeGantry filters by Compose project by default — see [`HOMEGANTRY_COMPOSE_ONLY`](/guide/configuration) to change this)
- **No reverse proxy required** — HomeGantry works standalone on any port. Traefik integration is optional and only used to auto-detect service URLs.

::: tip
HomeGantry does **not** require Traefik, Nginx, or any reverse proxy to run. Traefik support is an optional feature that lets HomeGantry read `Host()` rules from your Traefik labels to automatically populate service URLs. If you don't use Traefik, HomeGantry falls back to `HOMEGANTRY_HOST` + container port or the URLs you configure via labels/UI.
:::

## Quick Start

Create a `docker-compose.yml`:

```yaml
services:
  homegantry:
    image: ghcr.io/geraldvd/homegantry:latest
    container_name: homegantry
    ports:
      - "3000:3000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - homegantry_data:/data
    environment:
      - HOMEGANTRY_HOST=192.168.1.100  # Your server's LAN IP
    restart: unless-stopped

volumes:
  homegantry_data:
```

Then start it:

```bash
docker compose up -d
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## What Happens Next

Once running, HomeGantry will:

1. Connect to the Docker socket and scan for running containers
2. Match containers against its built-in knowledge base of 60+ services
3. Attempt to resolve URLs from Traefik labels, `homepage.*` labels, or `HOMEGANTRY_HOST` + exposed ports
4. Stream updates in real time via SSE — new containers appear automatically

## Customizing Services

You can customize any discovered service directly in the UI:

- Click on a service card to open the edit modal
- Override the name, icon, category, URL, or description
- Changes are persisted in the `/data` volume

You can also add services that aren't running in Docker using the **Add Service** button.

## Next Steps

- [Environment Variables](/guide/configuration) — Full list of configuration options
- [Docker Labels](/guide/docker-labels) — Control how services appear using container labels
- [Traefik Integration](/guide/traefik) — Auto-detect URLs from Traefik router rules
- [Deployment](/guide/deployment) — Production deployment examples
