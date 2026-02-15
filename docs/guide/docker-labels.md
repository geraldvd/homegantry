# Docker Labels

HomeGantry reads Docker labels to determine how services appear on the dashboard. You can use HomeGantry-native labels, Homepage-compatible labels, or both.

## HomeGantry Labels

These take the highest priority and are the recommended way to configure services.

```yaml
labels:
  homegantry.name: "My Service"          # Display name
  homegantry.icon: "plex"                # Icon identifier
  homegantry.url: "https://plex.lan"     # Clickable URL
  homegantry.category: "Media"           # Category grouping
  homegantry.description: "Media server" # Short description
  homegantry.exclude: "true"             # Hide from dashboard
  homegantry.hidden: "true"              # Same as exclude
```

All labels are optional. If not provided, HomeGantry uses its knowledge base to auto-detect names, icons, and categories based on the Docker image.

## Homepage Labels

For easy migration from [Homepage](https://gethomepage.dev/), HomeGantry reads `homepage.*` labels when `HOMEGANTRY_HOMEPAGE_COMPAT` is enabled (default: `true`).

```yaml
labels:
  homepage.name: "Sonarr"
  homepage.icon: "sonarr"
  homepage.href: "https://sonarr.example.com"
  homepage.group: "Media"
  homepage.description: "TV show manager"
```

HomeGantry-native labels always take precedence over Homepage labels when both are present.

## Hiding Containers

There are several ways to hide a container from the dashboard:

```yaml
labels:
  # Any of these will hide the container:
  homegantry.exclude: "true"
  homegantry.hidden: "true"
```

Infrastructure containers (Traefik, Docker socket proxies, etc.) are hidden by default. You can also toggle stack visibility in the Settings drawer.

## Label Priority

When multiple label sources are present, HomeGantry resolves them in this order:

1. **UI overrides** — Changes made through the HomeGantry web interface
2. **`homegantry.*` labels** — Native HomeGantry labels
3. **`homepage.*` labels** — Homepage-compatible labels
4. **Knowledge base** — Built-in service database (60+ services)
5. **Docker metadata** — Container name, image name as final fallback
