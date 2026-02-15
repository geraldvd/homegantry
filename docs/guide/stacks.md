# Stack Management

HomeGantry groups services by their Docker Compose project (stack). This gives you a high-level view of your homelab and lets you control visibility per-stack.

## How Stacks Work

Every container started via `docker compose` belongs to a project. HomeGantry reads the `com.docker.compose.project` label to determine which stack a container belongs to.

## Settings Drawer

Open the Settings drawer (gear icon in the header) to manage stacks:

- **Toggle visibility** — Show or hide all services in a stack with a single switch
- **Custom name** — Set a display name for each stack
- **Custom icon** — Choose an icon for the stack

## Grouping Modes

HomeGantry supports two grouping modes, selectable in the Settings drawer:

- **By Category** — Services are grouped by their category (Media, Networking, Monitoring, etc.)
- **By Stack** — Services are grouped by their Docker Compose project

## `HOMEGANTRY_COMPOSE_ONLY`

By default, HomeGantry only shows containers that belong to a Docker Compose project (`HOMEGANTRY_COMPOSE_ONLY=true`). This filters out standalone containers that aren't part of a stack.

Set `HOMEGANTRY_COMPOSE_ONLY=false` to show all containers, including those started with `docker run`.
