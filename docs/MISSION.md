# HomeGantry — Mission

## Why

Homelab dashboards (Homepage, Homarr, Dashy, Heimdall, Glance) all make you describe your services by hand, in YAML or
by clicking. HomeGantry starts from what is already running: it reads Docker (and Traefik) and builds the dashboard
itself. Labels are only for overrides.

## Who it is for

Self-hosters running Docker Compose stacks, typically behind a reverse proxy, who want an always-correct overview of
their lab without maintaining a config file.

## Principles

1. **Zero-config first.** A fresh install on a typical lab shows a useful dashboard with no configuration.
2. **Secure by default.** Read-only unless explicitly authorised; never leak secrets (env vars, tokens, internal
   details) through the API; safe to put behind a reverse proxy.
3. **Small and dependable.** One container, few dependencies, low memory. No telemetry, no external calls except
   optional icon CDNs that can be turned off.
4. **Tested.** Every feature ships with tests; CI must be green before merge.
5. **Documented.** README and docs change in the same PR as the behaviour.
6. **Friendly to contributors.** The service knowledge base is easy to extend without touching code.

## Non-goals (for now)

User accounts and roles, multi-host agents, widgets that call third-party APIs, container management
(start/stop/remove) — HomeGantry observes, it does not control.

## How it is built

Developed largely by AI coding agents under human direction, milestone by milestone, with a human check-in after each
milestone. Roadmap: M0 foundations → M1 secure by default → M2 discovery v2 (Traefik API, exposure badges, health) →
M3 knowledge base & icons → M4 UX → M5 release engineering → M6 launch.

Decisions are recorded in [DECISIONS.md](DECISIONS.md).
