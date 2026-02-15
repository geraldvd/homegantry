import { Router, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  overridesStore,
  manualServicesStore,
  settingsStore,
} from './storage.js';
import { getServices, isConnected, dockerEvents } from './docker.js';
import type {
  Service,
  ServiceOverride,
  ManualService,
  DashboardSettings,
  SSEEvent,
} from './types.js';

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

function mergeServices(includeHidden: boolean): Service[] {
  const docker = getServices();
  const manual = manualServicesStore.get().map(manualToService);
  const all = [...docker, ...manual];

  if (!includeHidden) {
    return all.filter((s) => !s.hidden);
  }
  return all;
}

// ---- Service routes ----

router.get('/api/services', (_req: Request, res: Response) => {
  const includeHidden = _req.query.includeHidden === 'true';
  res.json(mergeServices(includeHidden));
});

router.put('/api/services/:id/override', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const body = req.body as ServiceOverride;
  const overrides = overridesStore.get();
  overrides[id] = { ...overrides[id], ...body };
  overridesStore.set(overrides);
  res.json({ ok: true });
});

router.delete('/api/services/:id/override', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const overrides = overridesStore.get();
  delete overrides[id];
  overridesStore.set(overrides);
  res.json({ ok: true });
});

router.post('/api/services/manual', (req: Request, res: Response) => {
  const body = req.body as Omit<ManualService, 'id'>;
  const manual = manualServicesStore.get();
  const entry: ManualService = { ...body, id: uuidv4() };
  manual.push(entry);
  manualServicesStore.set(manual);
  res.status(201).json(entry);
});

router.put('/api/services/manual/:id', (req: Request, res: Response) => {
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
  res.json(manual[idx]);
});

router.delete('/api/services/manual/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const manual = manualServicesStore.get();
  const idx = manual.findIndex((m) => m.id === id);
  if (idx === -1) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  manual.splice(idx, 1);
  manualServicesStore.set(manual);
  res.json({ ok: true });
});

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

  // Send initial state
  send({ type: 'initial_state', data: mergeServices(false) });

  // Forward docker events
  const onUpdated = (svc: Service) => {
    send({ type: 'service_updated', data: svc });
  };
  const onRemoved = (data: { id: string }) => {
    send({ type: 'service_removed', data });
  };
  const onSettings = (data: DashboardSettings) => {
    send({ type: 'settings_updated', data });
  };

  dockerEvents.on('service_updated', onUpdated);
  dockerEvents.on('service_removed', onRemoved);
  dockerEvents.on('settings_updated', onSettings);

  // Heartbeat
  const heartbeat = setInterval(() => {
    send({ type: 'heartbeat', data: {} });
  }, 30_000);

  _req.on('close', () => {
    clearInterval(heartbeat);
    dockerEvents.off('service_updated', onUpdated);
    dockerEvents.off('service_removed', onRemoved);
    dockerEvents.off('settings_updated', onSettings);
  });
});

// ---- Settings ----

router.get('/api/settings', (_req: Request, res: Response) => {
  res.json(settingsStore.get());
});

router.patch('/api/settings', (req: Request, res: Response) => {
  const current = settingsStore.get();
  const updated: DashboardSettings = { ...current, ...(req.body as Partial<DashboardSettings>) };
  settingsStore.set(updated);
  dockerEvents.emit('settings_updated', updated);
  res.json(updated);
});

// ---- Health ----

router.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    docker: isConnected() ? 'connected' : 'disconnected',
  });
});
