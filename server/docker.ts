import Dockerode from 'dockerode';
import { EventEmitter } from 'node:events';
import { config } from './config.js';
import { matchContainer, type MatchInput } from './matcher.js';
import type { Service } from './types.js';

const docker = new Dockerode({ socketPath: config.dockerSocket });

let services = new Map<string, Service>();
let connected = false;
let eventStream: NodeJS.ReadableStream | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

export const dockerEvents = new EventEmitter();

// Match input cache for rematch support
const matchInputCache = new Map<string, MatchInput>();

// ---- helpers ----

function containerToMatchInput(
  info: Dockerode.ContainerInfo,
): MatchInput {
  const names = info.Names ?? [];
  const name = (names[0] ?? '').replace(/^\//, '');
  const labels = info.Labels ?? {};
  const ports = (info.Ports ?? [])
    .filter((p) => p.PublicPort && p.PrivatePort)
    .map((p) => ({ private: p.PrivatePort!, public: p.PublicPort! }));

  return {
    id: info.Id,
    name,
    image: info.Image ?? '',
    state: info.State ?? 'unknown',
    labels,
    compose_project: labels['com.docker.compose.project'],
    compose_service: labels['com.docker.compose.service'],
    ports,
  };
}

// ---- scanning ----

async function fullScan(): Promise<void> {
  try {
    const filters: Record<string, string[]> = {};
    if (!config.showStopped) {
      filters['status'] = ['running'];
    }
    const containers = await docker.listContainers({
      all: config.showStopped,
      filters: config.showStopped ? undefined : filters,
    });
    const prev = services;
    const next = new Map<string, Service>();

    for (const info of containers) {
      const input = containerToMatchInput(info);
      // Optionally exclude self (the homegantry container)
      if (config.excludeSelf) {
        const labels = info.Labels ?? {};
        if (labels['homegantry.exclude'] === 'true') continue;
        // Also check if image contains homegantry
        if (info.Image?.includes('homegantry')) continue;
      }
      // Compose-only filter: skip containers without compose project label
      if (config.composeOnly && !input.compose_project) continue;

      // Cache the match input for rematch support
      matchInputCache.set(input.id, input);

      const svc = matchContainer(input);
      next.set(svc.id, svc);
    }

    services = next;
    connected = true;

    // Emit service_removed for disappeared containers
    for (const [id] of prev) {
      if (!next.has(id)) {
        dockerEvents.emit('service_removed', { id });
        matchInputCache.delete(id);
      }
    }

    // Emit service_updated for new or changed containers
    for (const [id, svc] of next) {
      const old = prev.get(id);
      if (!old || JSON.stringify(old) !== JSON.stringify(svc)) {
        dockerEvents.emit('service_updated', svc);
      }
    }
  } catch (err) {
    connected = false;
    console.error('[docker] scan failed:', (err as Error).message);
  }
}

// ---- event watching ----

async function watchEvents(backoff = 1000): Promise<void> {
  try {
    const stream = await docker.getEvents({
      filters: {
        type: ['container'],
        event: ['start', 'stop', 'die', 'destroy', 'rename', 'health_status'],
      },
    });
    eventStream = stream;
    connected = true;

    stream.on('data', () => {
      // On any relevant container event, do a full rescan
      // Debounce slightly to avoid rapid consecutive rescans
      void fullScan();
    });

    stream.on('error', (err: Error) => {
      console.error('[docker] event stream error:', err.message);
      connected = false;
      scheduleReconnect(backoff);
    });

    stream.on('end', () => {
      connected = false;
      scheduleReconnect(backoff);
    });
  } catch (err) {
    connected = false;
    console.error('[docker] failed to connect events:', (err as Error).message);
    scheduleReconnect(backoff);
  }
}

function scheduleReconnect(backoff: number): void {
  const next = Math.min(backoff * 2, 30_000);
  setTimeout(() => {
    void watchEvents(next);
  }, backoff);
}

// ---- public API ----

export function getServices(): Service[] {
  return Array.from(services.values());
}

export function isConnected(): boolean {
  return connected;
}

/** Re-run matchContainer for a cached input (picks up new overrides). */
export function rematchService(id: string): Service | undefined {
  const input = matchInputCache.get(id);
  if (!input) return undefined;
  const svc = matchContainer(input);
  services.set(svc.id, svc);
  return svc;
}

/** Returns sorted unique stack names from current services. */
export function getDiscoveredStacks(): string[] {
  const stacks = new Set<string>();
  for (const svc of services.values()) {
    if (svc.stack) stacks.add(svc.stack);
  }
  return [...stacks].sort();
}

export async function startWatching(): Promise<void> {
  await fullScan();
  void watchEvents();

  // Periodic reconciliation
  pollTimer = setInterval(() => {
    void fullScan();
  }, config.pollInterval * 1000);
}

export function stopWatching(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (eventStream) {
    (eventStream as NodeJS.ReadableStream & { destroy?: () => void }).destroy?.();
    eventStream = null;
  }
}
