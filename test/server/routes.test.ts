import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { container, exampleLab } from '../fixtures/containers.js';
import { loadApp, openSse } from '../helpers.js';

const TOKEN = 'change-me-0123456789abcdefghij';

/** App with an admin token configured; `api` is a supertest agent that sends the token. */
async function setup(containers = exampleLab) {
  const server = await loadApp(containers, { HOMEGANTRY_ADMIN_TOKEN: TOKEN });
  const api = request.agent(server.app).set('Authorization', `Bearer ${TOKEN}`);
  return { ...server, api };
}

const manualBody = {
  displayName: 'Router',
  url: 'http://192.168.1.1',
  icon: 'router',
  category: 'Network',
  description: 'Home router',
  sortOrder: 1,
};

describe('GET /api/services', () => {
  it('returns visible Docker services, hiding infrastructure', async () => {
    const { api } = await setup();
    const res = await api.get('/api/services').expect(200);
    const names = (res.body as Array<{ name: string }>).map((s) => s.name);
    expect(names).toContain('Jellyfin');
    expect(names).toContain('Team Wiki');
    expect(names).not.toContain('MariaDB');
    expect(res.body).toHaveLength(exampleLab.length - 1);
  });

  it('includes hidden services with ?includeHidden=true', async () => {
    const { api } = await setup();
    const res = await api.get('/api/services?includeHidden=true').expect(200);
    expect(res.body).toHaveLength(exampleLab.length);
    expect(res.body).toContainEqual(expect.objectContaining({ name: 'MariaDB', hidden: true }));
  });

  it('builds the expected service objects', async () => {
    const { api } = await setup();
    const res = await api.get('/api/services').expect(200);
    const byName = Object.fromEntries(
      (res.body as Array<{ name: string }>).map((s) => [s.name, s]),
    );
    expect(byName['Jellyfin']).toMatchObject({
      url: 'https://jellyfin.example.com',
      stack: 'media',
      status: 'running',
    });
    expect(byName['Prowlarr']).toMatchObject({ url: 'http://192.168.1.100:9696' });
    expect(byName['Team Wiki']).toMatchObject({
      url: 'https://wiki.example.com',
      category: 'Productivity',
    });
  });
});

describe('service overrides', () => {
  it('PUT stores an override, re-matches the service and emits service_updated', async () => {
    const s = await setup();
    const events: unknown[] = [];
    s.dockerEvents.on('service_updated', (svc) => events.push(svc));
    await s.api
      .put('/api/services/id-jellyfin/override')
      .send({ displayName: 'Movies', category: 'Fun' })
      .expect(200, { ok: true });
    expect(s.overridesStore.get()).toEqual({
      'id-jellyfin': { displayName: 'Movies', category: 'Fun' },
    });
    expect(events).toEqual([
      expect.objectContaining({ id: 'id-jellyfin', name: 'Movies', category: 'Fun' }),
    ]);
    const res = await s.api.get('/api/services');
    expect(res.body).toContainEqual(expect.objectContaining({ id: 'id-jellyfin', name: 'Movies' }));
  });

  it('PUT merges with an existing override', async () => {
    const s = await setup();
    await s.api.put('/api/services/id-jellyfin/override').send({ displayName: 'Movies' });
    await s.api.put('/api/services/id-jellyfin/override').send({ icon: 'film' });
    expect(s.overridesStore.get()['id-jellyfin']).toEqual({ displayName: 'Movies', icon: 'film' });
  });

  it('PUT for an unknown id stores the override without emitting', async () => {
    const s = await setup();
    const listener = vi.fn();
    s.dockerEvents.on('service_updated', listener);
    await s.api.put('/api/services/nope/override').send({ hidden: true }).expect(200, { ok: true });
    expect(s.overridesStore.get()).toEqual({ nope: { hidden: true } });
    expect(listener).not.toHaveBeenCalled();
  });

  it('DELETE removes the override and restores the matched service', async () => {
    const s = await setup();
    await s.api.put('/api/services/id-jellyfin/override').send({ displayName: 'Movies' });
    const events: Array<{ name: string }> = [];
    s.dockerEvents.on('service_updated', (svc) => events.push(svc));
    await s.api.delete('/api/services/id-jellyfin/override').expect(200, { ok: true });
    expect(s.overridesStore.get()).toEqual({});
    expect(events[0]?.name).toBe('Jellyfin');
  });

  it('persists overrides to the data directory', async () => {
    const s = await setup();
    await s.api.put('/api/services/id-jellyfin/override').send({ displayName: 'Movies' });
    const file = JSON.parse(fs.readFileSync(path.join(s.dataDir, 'overrides.json'), 'utf-8'));
    expect(file).toEqual({ 'id-jellyfin': { displayName: 'Movies' } });
  });
});

describe('manual services', () => {
  it('POST creates a manual service with an id and returns 201', async () => {
    const s = await setup();
    const events: unknown[] = [];
    s.dockerEvents.on('service_updated', (svc) => events.push(svc));
    const res = await s.api.post('/api/services/manual').send(manualBody).expect(201);
    expect(res.body).toEqual({ ...manualBody, id: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    expect(events).toEqual([
      {
        id: res.body.id,
        source: 'manual',
        name: 'Router',
        description: 'Home router',
        url: 'http://192.168.1.1',
        icon: 'router',
        category: 'Network',
        status: 'running',
        hidden: false,
        sortOrder: 1,
      },
    ]);
    const list = await s.api.get('/api/services');
    expect(list.body).toContainEqual(
      expect.objectContaining({ id: res.body.id, source: 'manual' }),
    );
  });

  it('PUT updates a manual service and keeps its id', async () => {
    const s = await setup();
    const { body: created } = await s.api.post('/api/services/manual').send(manualBody);
    const res = await s.api
      .put(`/api/services/manual/${created.id}`)
      .send({ displayName: 'Gateway' })
      .expect(200);
    expect(res.body).toEqual({ ...manualBody, displayName: 'Gateway', id: created.id });
  });

  it('PUT returns 404 for an unknown manual service', async () => {
    const { api } = await setup();
    await api.put('/api/services/manual/nope').send({}).expect(404, { error: 'not found' });
  });

  it('DELETE removes a manual service and emits service_removed', async () => {
    const s = await setup();
    const { body: created } = await s.api.post('/api/services/manual').send(manualBody);
    const removed = vi.fn();
    s.dockerEvents.on('service_removed', removed);
    await s.api.delete(`/api/services/manual/${created.id}`).expect(200, { ok: true });
    expect(removed).toHaveBeenCalledWith({ id: created.id });
    expect(s.manualServicesStore.get()).toEqual([]);
  });

  it('DELETE returns 404 for an unknown manual service', async () => {
    const { api } = await setup();
    await api.delete('/api/services/manual/nope').expect(404, { error: 'not found' });
  });
});

describe('stacks', () => {
  it('GET returns every discovered stack, visible by default', async () => {
    const { api } = await setup();
    const res = await api.get('/api/stacks').expect(200);
    expect(res.body).toEqual({
      cloud: { visible: true },
      home: { visible: true },
      media: { visible: true },
      monitoring: { visible: true },
      security: { visible: true },
      tools: { visible: true },
    });
  });

  it('PATCH hides a stack, emits stacks_updated and filters its services', async () => {
    const s = await setup();
    const events: unknown[] = [];
    s.dockerEvents.on('stacks_updated', (d) => events.push(d));
    const res = await s.api.patch('/api/stacks/media').send({ visible: false }).expect(200);
    expect(res.body).toEqual({ visible: false });
    expect(events[0]).toMatchObject({ media: { visible: false }, cloud: { visible: true } });

    const services = await s.api.get('/api/services?includeHidden=true');
    expect((services.body as Array<{ stack?: string }>).some((x) => x.stack === 'media')).toBe(
      false,
    );
    const stacks = await s.api.get('/api/stacks');
    expect(stacks.body.media).toEqual({ visible: false });
  });

  it('PATCH merges fields and defaults visible to true', async () => {
    const { api } = await setup();
    const res = await api.patch('/api/stacks/media').send({ displayName: 'Media' }).expect(200);
    expect(res.body).toEqual({ visible: true, displayName: 'Media' });
  });
});

describe('settings', () => {
  it('GET returns defaults derived from config', async () => {
    const { api } = await setup();
    await api.get('/api/settings').expect(200, {
      dashboardTitle: 'HomeGantry',
      columns: 4,
      showStatus: true,
      layout: 'grid',
      showStopped: false,
      groupBy: 'category',
    });
  });

  it('PATCH merges, persists and emits settings_updated', async () => {
    const s = await setup();
    const listener = vi.fn();
    s.dockerEvents.on('settings_updated', listener);
    const res = await s.api.patch('/api/settings').send({ columns: 6, layout: 'list' }).expect(200);
    expect(res.body).toMatchObject({ columns: 6, layout: 'list', dashboardTitle: 'HomeGantry' });
    expect(listener).toHaveBeenCalledWith(res.body);
    await s.api.get('/api/settings').expect(200, res.body);
  });
});

describe('GET /api/health', () => {
  it('reports Docker connected after a successful scan', async () => {
    const { api } = await setup();
    await api.get('/api/health').expect(200, { status: 'ok', docker: 'connected' });
  });

  it('reports Docker disconnected when the socket fails', async () => {
    const s = await setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    s.fake.listContainers.mockRejectedValueOnce(new Error('ENOENT'));
    await s.fullScan();
    await s.api.get('/api/health').expect(200, { status: 'ok', docker: 'disconnected' });
  });
});

describe('GET /api/events (SSE)', () => {
  const openStream = openSse;

  it('sends the initial state then forwards service, settings and stack events', async () => {
    const s = await setup([container({ id: 'c1', name: 'jellyfin', image: 'jellyfin/jellyfin' })]);
    const stream = await openStream(s.app);
    expect(stream.res.statusCode).toBe(200);
    expect(stream.res.headers['content-type']).toBe('text/event-stream');
    expect(stream.res.headers['cache-control']).toBe('no-cache');

    await stream.waitFor(1);
    expect(stream.events[0]).toEqual({
      type: 'initial_state',
      data: [expect.objectContaining({ id: 'c1', name: 'Jellyfin' })],
    });

    s.dockerEvents.emit('service_updated', { id: 'x' });
    s.dockerEvents.emit('service_removed', { id: 'x' });
    s.dockerEvents.emit('settings_updated', { columns: 2 });
    s.dockerEvents.emit('stacks_updated', { media: { visible: true } });
    await stream.waitFor(5);
    expect(stream.events.slice(1)).toEqual([
      { type: 'service_updated', data: { id: 'x' } },
      { type: 'service_removed', data: { id: 'x' } },
      { type: 'settings_updated', data: { columns: 2 } },
      { type: 'stacks_updated', data: { media: { visible: true } } },
    ]);
    stream.close();
  });

  it('removes its listeners when the client disconnects', async () => {
    const s = await setup();
    const stream = await openStream(s.app);
    await stream.waitFor(1);
    expect(s.dockerEvents.listenerCount('service_updated')).toBe(1);
    stream.close();
    await vi.waitFor(() => expect(s.dockerEvents.listenerCount('service_updated')).toBe(0));
    expect(s.dockerEvents.listenerCount('stacks_updated')).toBe(0);
  });
});

describe('static client', () => {
  it('serves index.html for non-API routes (SPA fallback)', async () => {
    const { api } = await setup();
    const res = await api.get('/some/page').expect(200);
    expect(res.text).toContain('<title>HomeGantry</title>');
  });
});
