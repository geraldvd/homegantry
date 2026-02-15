# Deployment

## Basic Deployment

The simplest way to run HomeGantry — exposed on a port with a named volume for persistence.

```yaml
# docker-compose.yml
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
      - HOMEGANTRY_HOST=192.168.1.100
    restart: unless-stopped

volumes:
  homegantry_data:
```

```bash
docker compose up -d
```

Access at `http://your-server-ip:3000`.

## With Traefik

See the [Reverse Proxy](/guide/reverse-proxy) guide for Traefik-specific configuration.

## Updating

Pull the latest image and recreate the container:

```bash
docker compose pull
docker compose up -d
```

Your data is preserved in the named volume.

## Volumes

HomeGantry needs two volume mounts:

| Mount | Purpose |
|---|---|
| `/var/run/docker.sock` | **Required.** Read-only access to the Docker daemon for container discovery. |
| `/data` | **Recommended.** Persistent storage for overrides, manual services, settings, and stack configs. Without this, customizations are lost on container recreation. |

## Security Notes

- The Docker socket is mounted **read-only** (`:ro`). HomeGantry never modifies containers.
- HomeGantry does not authenticate users by default. If exposed to the internet, place it behind a reverse proxy with authentication (see [Reverse Proxy](/guide/reverse-proxy)).
