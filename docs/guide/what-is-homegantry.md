# What is HomeGantry?

HomeGantry is a lightweight dashboard for Docker homelabs that **automatically discovers** your running containers and presents them in a clean, responsive UI.

## Why HomeGantry?

Most homelab dashboards require you to manually configure every service. HomeGantry takes a different approach:

1. **Connect to the Docker socket** — HomeGantry watches for container start/stop events in real time.
2. **Match against a knowledge base** — A built-in database of 60+ popular self-hosted applications provides icons, categories, and display names automatically.
3. **Extract URLs from labels** — Traefik router rules, `homepage.*` labels, and `homegantry.*` labels are all read to determine service URLs.

The result is a dashboard that works out of the box with zero configuration for most setups.

## Features

- **Auto-discovery** — Detects running Docker containers and matches them against a knowledge base of 60+ services
- **Dark mode glass-morphism UI** — Responsive grid and list layouts
- **Real-time updates** — Server-Sent Events (SSE) push changes instantly, no polling needed
- **Stack management** — Group services by Docker Compose project, toggle stack visibility
- **Traefik support** — Automatically extracts URLs from Traefik router rules
- **Homepage compatibility** — Reads `homepage.*` Docker labels for easy migration from Homepage
- **Manual services** — Add non-Docker services to your dashboard
- **Customizable** — Override names, icons, categories, and URLs per-service through the UI

## Architecture

HomeGantry is a full-stack TypeScript application:

| Layer | Technology |
|---|---|
| Frontend | React, Tailwind CSS, Vite |
| Backend | Node.js, Express |
| Docker integration | Dockerode (Docker Engine API) |
| Persistence | JSON files (no database required) |
| Real-time | Server-Sent Events (SSE) |

The entire application runs as a single Docker container. Persistent data (overrides, manual services, settings) is stored in a `/data` volume as JSON files.
