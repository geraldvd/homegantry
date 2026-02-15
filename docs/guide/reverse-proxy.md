# Reverse Proxy

HomeGantry can be placed behind a reverse proxy for HTTPS, authentication, and custom domain access. Below are examples for common reverse proxies.

## Traefik

```yaml
services:
  homegantry:
    image: ghcr.io/geraldvd/homegantry:latest
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - homegantry_data:/data
    environment:
      - HOMEGANTRY_HOST=${HOMEGANTRY_HOST:-}
      - HOMEGANTRY_TITLE=${HOMEGANTRY_TITLE:-HomeGantry}
    restart: unless-stopped
    networks:
      - proxy
    labels:
      - homegantry.hidden=true
      - traefik.enable=true
      - traefik.docker.network=proxy
      - traefik.http.routers.homegantry.rule=Host(`homegantry.example.com`)
      - traefik.http.routers.homegantry.tls=true
      - traefik.http.routers.homegantry.tls.certresolver=le
      - traefik.http.services.homegantry.loadbalancer.server.port=3000

volumes:
  homegantry_data:

networks:
  proxy:
    external: true
```

Replace `homegantry.example.com` with your domain. The `proxy` network must be created separately and shared with your Traefik instance.

### Adding Authentication

If you use an authentication middleware (e.g., Authentik, Authelia, or Traefik BasicAuth), add it as a middleware label:

```yaml
labels:
  - traefik.http.routers.homegantry.middlewares=my-auth@docker
```

## Nginx

```nginx
server {
    listen 443 ssl;
    server_name homegantry.example.com;

    ssl_certificate     /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;

    location / {
        proxy_pass http://homegantry:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # SSE support — disable buffering for real-time events
    location /api/events {
        proxy_pass http://homegantry:3000;
        proxy_set_header Host $host;
        proxy_set_header Connection '';
        proxy_http_version 1.1;
        chunked_transfer_encoding off;
        proxy_buffering off;
        proxy_cache off;
    }
}
```

::: warning
The `/api/events` endpoint uses Server-Sent Events. Make sure your reverse proxy does **not** buffer this endpoint, or real-time updates will be delayed.
:::

## Caddy

```
homegantry.example.com {
    reverse_proxy homegantry:3000
}
```

Caddy handles SSE correctly by default — no special configuration needed.
