/**
 * M4 API changes: resetting override fields with `null` (#31), the per-service health-check
 * opt-out without labels (#32), a fresh `checkedAt` on an open dashboard (#30) and grouping by
 * URL host. Edit rights for the changed routes are covered in auth.test.ts.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { container, exampleLab } from '../fixtures/containers.js';
import { loadApp, openSse } from '../helpers.js';

const TOKEN = 'change-me-0123456789abcdefghij';

const servers: http.Server[] = [];

afterEach(async () => {
  vi.useRealTimers();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

async function setup(containers = exampleLab) {
  const server = await loadApp(containers, { HOMEGANTRY_ADMIN_TOKEN: TOKEN });
  const api = request.agent(server.app).set('Authorization', `Bearer ${TOKEN}`);
  const routes = await import('../../server/routes.js');
  const health = await import('../../server/health.js');
  return { ...server, api, routes, health };
}

/** A local HTTP server that answers 200 and records what it was asked. */
async function fakeHttp() {
  const seen: string[] = [];
  const server = http.createServer((req, res) => {
    seen.push(req.url ?? '');
    res.writeHead(200).end();
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, seen };
}

function labelled(id: string, url: string, labels: Record<string, string> = {}) {
  return container({
    id,
    name: id,
    image: 'example/app:1',
    labels: { 'homegantry.url': url, ...labels },
  });
}

async function serviceById(api: Awaited<ReturnType<typeof setup>>['api'], id: string) {
  const res = await api.get('/api/services').expect(200);
  return (res.body as Array<{ id: string; [key: string]: unknown }>).find((s) => s.id === id);
}

describe('#31 reset an override field with null', () => {
  it('url: null drops the stored URL and returns to the auto-detected one', async () => {
    const s = await setup();
    await s.api
      .put('/api/services/id-jellyfin/override')
      .send({ url: 'https://movies.example.com', displayName: 'Movies' })
      .expect(200);
    expect((await serviceById(s.api, 'id-jellyfin'))?.url).toBe('https://movies.example.com');

    const events: Array<{ id: string; url: string }> = [];
    s.dockerEvents.on('service_updated', (svc) => events.push(svc));
    await s.api.put('/api/services/id-jellyfin/override').send({ url: null }).expect(200);

    expect(s.overridesStore.get()['id-jellyfin']).toEqual({ displayName: 'Movies' });
    expect(events).toEqual([
      expect.objectContaining({ id: 'id-jellyfin', url: 'https://jellyfin.example.com' }),
    ]);
    expect(await serviceById(s.api, 'id-jellyfin')).toMatchObject({
      url: 'https://jellyfin.example.com',
      name: 'Movies',
    });
  });

  it('removes the override entry when its last field is reset', async () => {
    const s = await setup();
    await s.api
      .put('/api/services/id-jellyfin/override')
      .send({ url: 'https://movies.example.com' });
    await s.api.put('/api/services/id-jellyfin/override').send({ url: null }).expect(200);
    expect(s.overridesStore.get()).toEqual({});
  });

  it('accepts null for every override field', async () => {
    const s = await setup();
    await s.api
      .put('/api/services/id-jellyfin/override')
      .send({
        displayName: 'Movies',
        icon: 'film',
        category: 'Fun',
        description: 'x',
        sortOrder: 3,
      })
      .expect(200);
    await s.api
      .put('/api/services/id-jellyfin/override')
      .send({
        displayName: null,
        url: null,
        icon: null,
        category: null,
        description: null,
        hidden: null,
        sortOrder: null,
        healthcheck: null,
      })
      .expect(200);
    expect(s.overridesStore.get()).toEqual({});
    expect(await serviceById(s.api, 'id-jellyfin')).toMatchObject({
      name: 'Jellyfin',
      category: 'Media',
    });
  });

  it('still rejects an empty string or an unsafe URL', async () => {
    const s = await setup();
    await s.api.put('/api/services/id-jellyfin/override').send({ url: '' }).expect(400);
    await s.api
      .put('/api/services/id-jellyfin/override')
      .send({ url: 'javascript:alert(1)' })
      .expect(400);
    expect(s.overridesStore.get()).toEqual({});
  });
});

describe('#32 health-check opt-out without labels', () => {
  it('healthcheck: false stops probing a service and drops its result at once', async () => {
    const srv = await fakeHttp();
    const s = await setup([labelled('c1', srv.url)]);
    await s.routes.checkServicesNow();
    expect(srv.seen).toHaveLength(1);
    expect((await serviceById(s.api, 'c1'))?.health).toMatchObject({ status: 'up' });

    const stream = await openSse(s.app);
    await stream.waitFor(1);
    await s.api.put('/api/services/c1/override').send({ healthcheck: false }).expect(200);
    await stream.waitFor(2);
    const update = stream.events[1] as { type: string; data: Record<string, unknown> };
    expect(update.type).toBe('service_updated');
    expect(update.data.health).toBeUndefined();
    expect(update.data.healthcheckDisabled).toBe(true);
    stream.close();

    await s.routes.checkServicesNow();
    expect(srv.seen).toHaveLength(1);
    const svc = await serviceById(s.api, 'c1');
    expect(svc?.health).toBeUndefined();
    expect(svc?.healthcheckDisabled).toBe(true);
  });

  it('healthcheck: true in an override beats the homegantry.healthcheck=false label', async () => {
    const srv = await fakeHttp();
    const s = await setup([labelled('c1', srv.url, { 'homegantry.healthcheck': 'false' })]);
    expect((await serviceById(s.api, 'c1'))?.healthcheckDisabled).toBe(true);
    await s.routes.checkServicesNow();
    expect(srv.seen).toHaveLength(0);

    await s.api.put('/api/services/c1/override').send({ healthcheck: true }).expect(200);
    await s.routes.checkServicesNow();
    expect(srv.seen).toHaveLength(1);
    expect((await serviceById(s.api, 'c1'))?.healthcheckDisabled).toBeUndefined();
  });

  it('works for a Traefik-only service (no labels at all)', async () => {
    const s = await setup([]);
    s.overridesStore.set({ 'traefik-nas-file': { healthcheck: false } });
    const svc = s.matchRoute({
      id: 'traefik-nas-file',
      routerName: 'nas',
      serviceName: 'nas',
      url: 'https://nas.example.com',
    } as Parameters<typeof s.matchRoute>[0]);
    expect(svc.healthcheckDisabled).toBe(true);
  });

  it('works for a manual service', async () => {
    const srv = await fakeHttp();
    const s = await setup([]);
    const created = await s.api
      .post('/api/services/manual')
      .send({ displayName: 'Router', url: srv.url })
      .expect(201);
    const updated = await s.api
      .put(`/api/services/manual/${created.body.id}`)
      .send({ healthcheck: false })
      .expect(200);
    expect(updated.body.healthcheck).toBe(false);
    await s.routes.checkServicesNow();
    expect(srv.seen).toHaveLength(0);
    expect((await serviceById(s.api, created.body.id))?.healthcheckDisabled).toBe(true);

    await s.api.put(`/api/services/manual/${created.body.id}`).send({ healthcheck: true });
    await s.routes.checkServicesNow();
    expect(srv.seen).toHaveLength(1);
  });

  it('rejects a non-boolean value', async () => {
    const s = await setup();
    await s.api
      .put('/api/services/id-jellyfin/override')
      .send({ healthcheck: 'false' })
      .expect(400);
  });
});

describe('#30 "last checked" stays fresh', () => {
  it('re-announces an unchanged result at most every 30 seconds', async () => {
    const srv = await fakeHttp();
    const s = await setup([]);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    const changed = vi.fn();
    const targets = [{ id: 'a', url: srv.url }];

    await s.health.runHealthChecks(targets, changed);
    expect(changed).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-01-01T12:00:10Z'));
    await s.health.runHealthChecks(targets, changed);
    expect(changed).toHaveBeenCalledTimes(1);
    // The stored time moves on even when nothing is announced.
    expect(s.health.getHealth('a')?.checkedAt).toBe('2026-01-01T12:00:10.000Z');

    vi.setSystemTime(new Date('2026-01-01T12:00:31Z'));
    await s.health.runHealthChecks(targets, changed);
    expect(changed).toHaveBeenCalledTimes(2);
    expect(s.health.getHealth('a')?.checkedAt).toBe('2026-01-01T12:00:31.000Z');
  });

  it('pushes the new checkedAt over SSE', async () => {
    const srv = await fakeHttp();
    const s = await setup([labelled('c1', srv.url)]);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    await s.routes.checkServicesNow();

    const stream = await openSse(s.app);
    await stream.waitFor(1);
    vi.setSystemTime(new Date('2026-01-01T12:01:00Z'));
    await s.routes.checkServicesNow();
    await stream.waitFor(2);
    const update = stream.events[1] as { data: { health: { checkedAt: string } } };
    expect(update.data.health.checkedAt).toBe('2026-01-01T12:01:00.000Z');
    stream.close();
  });
});

describe('settings: group by URL host', () => {
  it('accepts groupBy "host" and persists it', async () => {
    const s = await setup();
    const res = await s.api.patch('/api/settings').send({ groupBy: 'host' }).expect(200);
    expect(res.body.groupBy).toBe('host');
    await s.api.get('/api/settings').expect(200, res.body);
  });

  it('rejects an unknown grouping', async () => {
    const s = await setup();
    await s.api.patch('/api/settings').send({ groupBy: 'colour' }).expect(400);
  });
});
