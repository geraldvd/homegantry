import { Router, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  overridesStore,
  manualServicesStore,
  settingsStore,
  stacksStore,
  getStackConfig,
} from './storage.js';
import {
  getServices,
  isConnected,
  dockerEvents,
  rematchService,
  getDiscoveredStacks,
  getKbCoverage,
  getServiceLabels,
  usesLocalhostFallback,
} from './docker.js';
import { config } from './config.js';
import { getHealth, runHealthChecks, startHealthChecks, type HealthTarget } from './health.js';
import { safeHttpUrl } from './urls.js';
import type {
  Service,
  ServiceOverride,
  ManualService,
  DashboardSettings,
  StackConfig,
  SSEEvent,
} from './types.js';
import {
  publicManualService,
  publicService,
  publicSettings,
  publicStack,
  publicStacks,
  publicUiConfig,
} from './sanitize.js';
import {
  idParams,
  manualCreateBody,
  manualUpdateBody,
  overrideBody,
  servicesQuery,
  settingsBody,
  stackBody,
  stackParams,
  validate,
} from './validation.js';

export const router = Router();

// ---- helpers ----

function manualToService(m: ManualService): Service {
  return {
    id: m.id,
    source: 'manual',
    name: m.displayName,
    description: m.description,
    url: m.url,
    icon: m.icon,
    category: m.category,
    status: 'running',
    hidden: false,
    sortOrder: m.sortOrder,
  };
}

function stackVisible(s: Service): boolean {
  return !s.stack || getStackConfig(s.stack).visible;
}

/** What a read-only client may see; the same rule for REST and every SSE event. */
function isVisible(s: Service): boolean {
  return !s.hidden && stackVisible(s);
}

function withHealth(s: Service): Service {
  const health = getHealth(s.id);
  return health ? { ...s, health } : s;
}

function mergeServices(includeHidden: boolean): Service[] {
  const docker = getServices();
  const manual = manualServicesStore.get().map(manualToService);
  return [...docker, ...manual].filter(includeHidden ? stackVisible : isVisible).map(withHealth);
}

// ---- health checks ----

function healthTargets(): HealthTarget[] {
  const targets: HealthTarget[] = [];
  for (const s of mergeServices(false)) {
    if (s.source === 'docker' && s.status !== 'running') continue;
    const labels = getServiceLabels(s.id);
    if (labels['homegantry.healthcheck']?.trim().toLowerCase() === 'false') continue;
    const labelUrl = safeHttpUrl(labels['homegantry.healthcheck.url']);
    if (!labelUrl && usesLocalhostFallback(s)) continue;
    const url = labelUrl ?? safeHttpUrl(s.url);
    if (url) targets.push({ id: s.id, url });
  }
  return targets;
}

function announceHealth(id: string): void {
  const svc = mergeServices(true).find((s) => s.id === id);
  if (svc) dockerEvents.emit('service_updated', svc);
}

/** Run one round of health checks now. */
export async function checkServicesNow(): Promise<void> {
  if (config.healthcheck) await runHealthChecks(healthTargets(), announceHealth);
}

/** Start the periodic health checks (unless HOMEGANTRY_HEALTHCHECK=false). */
export function startServiceHealthChecks(): void {
  if (config.healthcheck) startHealthChecks(healthTargets, announceHealth);
}

// ---- Service routes ----

// `?includeHidden=true` is only reached with edit rights (guardHiddenServices in security.ts).
router.get('/api/services', validate({ query: servicesQuery }), (_req: Request, res: Response) => {
  const includeHidden = _req.query.includeHidden === 'true';
  res.json(mergeServices(includeHidden).map(publicService));
});

router.put(
  '/api/services/:id/override',
  validate({ params: idParams, body: overrideBody }),
  (req: Request, res: Response) => {
    const id = req.params.id as string;
    const body = req.body as ServiceOverride;
    const overrides = overridesStore.get();
    overrides[id] = { ...overrides[id], ...body };
    overridesStore.set(overrides);

    // Re-match with new overrides and emit SSE
    const updated = rematchService(id);
    if (updated) {
      dockerEvents.emit('service_updated', updated);
    }

    res.json({ ok: true });
  },
);

router.delete(
  '/api/services/:id/override',
  validate({ params: idParams }),
  (req: Request, res: Response) => {
    const id = req.params.id as string;
    const overrides = overridesStore.get();
    delete overrides[id];
    overridesStore.set(overrides);

    // Re-match without overrides and emit SSE
    const updated = rematchService(id);
    if (updated) {
      dockerEvents.emit('service_updated', updated);
    }

    res.json({ ok: true });
  },
);

router.post(
  '/api/services/manual',
  validate({ body: manualCreateBody }),
  (req: Request, res: Response) => {
    const body = req.body as Omit<ManualService, 'id'>;
    const manual = manualServicesStore.get();
    const entry: ManualService = { ...body, id: uuidv4() };
    manual.push(entry);
    manualServicesStore.set(manual);

    // Emit SSE for new manual service
    dockerEvents.emit('service_updated', manualToService(entry));

    res.status(201).json(publicManualService(entry));
  },
);

router.put(
  '/api/services/manual/:id',
  validate({ params: idParams, body: manualUpdateBody }),
  (req: Request, res: Response) => {
    const id = req.params.id as string;
    const body = req.body as Partial<ManualService>;
    const manual = manualServicesStore.get();
    const idx = manual.findIndex((m) => m.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    manual[idx] = { ...manual[idx]!, ...body, id };
    manualServicesStore.set(manual);

    // Emit SSE for updated manual service
    dockerEvents.emit('service_updated', manualToService(manual[idx]!));

    res.json(publicManualService(manual[idx]!));
  },
);

router.delete(
  '/api/services/manual/:id',
  validate({ params: idParams }),
  (req: Request, res: Response) => {
    const id = req.params.id as string;
    const manual = manualServicesStore.get();
    const idx = manual.findIndex((m) => m.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    manual.splice(idx, 1);
    manualServicesStore.set(manual);

    // Emit SSE for removed service
    dockerEvents.emit('service_removed', { id });

    res.json({ ok: true });
  },
);

// ---- Stacks API ----

router.get('/api/stacks', (_req: Request, res: Response) => {
  const discovered = getDiscoveredStacks();
  const stored = stacksStore.get();
  const merged: Record<string, StackConfig> = {};
  for (const name of discovered) {
    merged[name] = stored[name] ?? { visible: true };
  }
  res.json(publicStacks(merged));
});

router.patch(
  '/api/stacks/:name',
  validate({ params: stackParams, body: stackBody }),
  (req: Request, res: Response) => {
    const name = req.params.name as string;
    const body = req.body as Partial<StackConfig>;
    const stacks = stacksStore.get();
    stacks[name] = { ...{ visible: true }, ...stacks[name], ...body };
    stacksStore.set(stacks);

    // Emit stacks_updated
    const discovered = getDiscoveredStacks();
    const merged: Record<string, StackConfig> = {};
    for (const n of discovered) {
      merged[n] = stacks[n] ?? { visible: true };
    }
    dockerEvents.emit('stacks_updated', merged);

    res.json(publicStack(stacks[name]));
  },
);

// ---- SSE ----

router.get('/api/events', (_req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const send = (event: SSEEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  // Every event goes through the same allow-lists as the REST API.
  const initial = mergeServices(false);
  send({ type: 'initial_state', data: initial.map(publicService) });

  // Services this client currently knows about: one that stops being visible is removed from
  // its dashboard without sending the new data.
  const shown = new Set(initial.map((s) => s.id));

  // Forward docker events
  const onUpdated = (svc: Service) => {
    if (isVisible(svc)) {
      shown.add(svc.id);
      send({ type: 'service_updated', data: publicService(withHealth(svc)) });
    } else if (shown.delete(svc.id)) {
      send({ type: 'service_removed', data: { id: svc.id } });
    }
  };
  const onRemoved = (data: { id: string }) => {
    // Only for services this client was shown: the id of a hidden service stays private.
    if (shown.delete(data.id)) send({ type: 'service_removed', data: { id: data.id } });
  };
  const onSettings = (data: DashboardSettings) => {
    send({ type: 'settings_updated', data: publicSettings(data) });
  };
  const onStacksUpdated = (data: Record<string, StackConfig>) => {
    send({ type: 'stacks_updated', data: publicStacks(data) });
    // A toggled stack changes which services are visible.
    for (const svc of getServices()) {
      if (isVisible(svc) !== shown.has(svc.id)) onUpdated(svc);
    }
  };

  dockerEvents.on('service_updated', onUpdated);
  dockerEvents.on('service_removed', onRemoved);
  dockerEvents.on('settings_updated', onSettings);
  dockerEvents.on('stacks_updated', onStacksUpdated);

  // Heartbeat
  const heartbeat = setInterval(() => {
    send({ type: 'heartbeat', data: {} });
  }, 30_000);

  _req.on('close', () => {
    clearInterval(heartbeat);
    dockerEvents.off('service_updated', onUpdated);
    dockerEvents.off('service_removed', onRemoved);
    dockerEvents.off('settings_updated', onSettings);
    dockerEvents.off('stacks_updated', onStacksUpdated);
  });
});

// ---- Settings ----

router.get('/api/settings', (_req: Request, res: Response) => {
  res.json(publicSettings(settingsStore.get()));
});

router.patch('/api/settings', validate({ body: settingsBody }), (req: Request, res: Response) => {
  const current = settingsStore.get();
  const updated: DashboardSettings = { ...current, ...(req.body as Partial<DashboardSettings>) };
  settingsStore.set(updated);
  dockerEvents.emit('settings_updated', updated);
  res.json(publicSettings(updated));
});

// ---- Client configuration and knowledge-base coverage ----

router.get('/api/ui-config', (_req: Request, res: Response) => {
  res.json(publicUiConfig());
});

// Only reached with edit rights (guardCoverage in security.ts).
router.get('/api/kb/coverage', (_req: Request, res: Response) => {
  res.json(getKbCoverage());
});

// ---- Health ----

router.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    docker: isConnected() ? 'connected' : 'disconnected',
  });
});
