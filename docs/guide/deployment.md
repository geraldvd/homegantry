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
      - '3000:3000'
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

## Which image tag

Images are multi-arch (`linux/amd64` and `linux/arm64`). Pin a minor version, e.g.
`ghcr.io/geraldvd/homegantry:0.2`: it gets fixes but no breaking changes. `latest` follows releases (not every merge
to `main`), so before 1.0 it can jump to a version with breaking changes. `main` is the development build. All tags:
[Releases and upgrading](/guide/releases#image-tags).

## Updating

Read the [changelog](https://github.com/geraldvd/homegantry/blob/main/CHANGELOG.md) for the new version, set the tag
if you pin one, then pull the image and recreate the container:

```bash
docker compose pull
docker compose up -d
```

Your data is preserved in the named volume. More in [Releases and upgrading](/guide/releases#upgrading).

## Volumes

HomeGantry needs two volume mounts:

| Mount                  | Purpose                                                                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/var/run/docker.sock` | **Required.** Read-only access to the Docker daemon for container discovery.                                                                                    |
| `/data`                | **Recommended.** Persistent storage for overrides, manual services, settings, and stack configs. Without this, customizations are lost on container recreation. |

## Security Notes

- HomeGantry is **read-only by default**. To edit from the UI, set `HOMEGANTRY_ADMIN_TOKEN` or use a forward-auth
  header; see the [Security model](/guide/security).
- HomeGantry never modifies containers. Even so, prefer a [read-only socket proxy](/guide/security#docker-socket-use-a-read-only-socket-proxy)
  over mounting `/var/run/docker.sock` directly.
- If the list of services itself is sensitive, put HomeGantry behind a reverse proxy with authentication (see
  [Reverse Proxy](/guide/reverse-proxy)).
