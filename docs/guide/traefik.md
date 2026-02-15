# Traefik Integration

HomeGantry can automatically extract service URLs from [Traefik](https://traefik.io/) reverse proxy labels. This is entirely optional — HomeGantry works without any reverse proxy.

## How It Works

When a container has Traefik router labels, HomeGantry reads the `Host()` rule to determine the service URL:

```yaml
labels:
  traefik.http.routers.myapp.rule: "Host(`app.example.com`)"
  # HomeGantry resolves this to: https://app.example.com
```

HomeGantry assumes HTTPS when a Traefik TLS configuration is present:

```yaml
labels:
  traefik.http.routers.myapp.rule: "Host(`app.example.com`)"
  traefik.http.routers.myapp.tls: "true"
  # → https://app.example.com

  traefik.http.routers.anotherapp.rule: "Host(`other.example.com`)"
  # No TLS label → http://other.example.com
```

## Do I Need Traefik?

**No.** Traefik is not required to use HomeGantry. The Traefik integration is purely for URL auto-detection. If you don't use Traefik, HomeGantry resolves service URLs through:

1. `homegantry.url` or `homepage.href` labels
2. `http://{HOMEGANTRY_HOST}:{container_port}` fallback
3. Manual configuration through the UI

## Running HomeGantry Behind Traefik

If you want to expose HomeGantry itself through Traefik, see the [Reverse Proxy](/guide/reverse-proxy) guide for a complete example.
