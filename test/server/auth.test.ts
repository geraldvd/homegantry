import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { exampleLab } from '../fixtures/containers.js';
import { loadApp, type Env } from '../helpers.js';

const TOKEN = 'change-me-0123456789abcdefghij';
const TOKEN_ENV: Env = { HOMEGANTRY_ADMIN_TOKEN: TOKEN };
const HEADER_ENV = (proxies: string): Env => ({
  HOMEGANTRY_AUTH_HEADER: 'Remote-User',
  HOMEGANTRY_TRUSTED_PROXIES: proxies,
});
const LOOPBACK = '127.0.0.1/32, ::1/128';

const manualBody = {
  displayName: 'Router',
  url: 'http://192.168.1.1',
  icon: 'router',
  category: 'Network',
  description: 'Home router',
  sortOrder: 1,
};

type Method = 'put' | 'post' | 'patch' | 'delete';
interface Route {
  method: Method;
  path: (manualId: string) => string;
  body?: object;
  ok: number;
}

/** Every mutating route of the API, with a valid body and the status it returns when authorised. */
const MUTATING_ROUTES: Route[] = [
  {
    method: 'put',
    path: () => '/api/services/id-jellyfin/override',
    body: { displayName: 'Movies' },
    ok: 200,
  },
  // M4: reset a field to auto-detected (#31) and the health-check opt-out (#32).
  {
    method: 'put',
    path: () => '/api/services/id-jellyfin/override',
    body: { url: null },
    ok: 200,
  },
  {
    method: 'put',
    path: () => '/api/services/id-jellyfin/override',
    body: { healthcheck: false },
    ok: 200,
  },
  { method: 'delete', path: () => '/api/services/id-jellyfin/override', ok: 200 },
  { method: 'post', path: () => '/api/services/manual', body: manualBody, ok: 201 },
  {
    method: 'put',
    path: (id) => `/api/services/manual/${id}`,
    body: { displayName: 'Gateway' },
    ok: 200,
  },
  {
    method: 'put',
    path: (id) => `/api/services/manual/${id}`,
    body: { healthcheck: false },
    ok: 200,
  },
  { method: 'delete', path: (id) => `/api/services/manual/${id}`, ok: 200 },
  { method: 'patch', path: () => '/api/stacks/media', body: { visible: false }, ok: 200 },
  { method: 'patch', path: () => '/api/settings', body: { columns: 3 }, ok: 200 },
  { method: 'patch', path: () => '/api/settings', body: { groupBy: 'host' }, ok: 200 },
];

async function setup(env: Env) {
  const s = await loadApp(exampleLab, env);
  // Seed a manual service directly in the store so manual PUT/DELETE have a target.
  const manualId = '00000000-0000-4000-8000-000000000001';
  s.manualServicesStore.set([{ ...manualBody, id: manualId }]);
  return { ...s, manualId };
}

function send(
  app: Awaited<ReturnType<typeof setup>>['app'],
  route: Route,
  manualId: string,
  headers: Record<string, string> = {},
) {
  let req = request(app)[route.method](route.path(manualId));
  for (const [k, v] of Object.entries(headers)) req = req.set(k, v);
  return route.body ? req.send(route.body) : req;
}

const label = (r: Route) => `${r.method.toUpperCase()} ${r.path(':id')}`;

describe.each(MUTATING_ROUTES)('$method mutating route %#', (route) => {
  it(`${label(route)}: rejected without any auth configured (403)`, async () => {
    const s = await setup({});
    const res = await send(s.app, route, s.manualId);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/editing is disabled/i);
  });

  it(`${label(route)}: rejected without a token (401)`, async () => {
    const s = await setup(TOKEN_ENV);
    const res = await send(s.app, route, s.manualId);
    expect(res.status).toBe(401);
  });

  it(`${label(route)}: rejected with a wrong token (401)`, async () => {
    const s = await setup(TOKEN_ENV);
    const res = await send(s.app, route, s.manualId, {
      Authorization: 'Bearer change-me-wrong-token-0123456789',
    });
    expect(res.status).toBe(401);
  });

  it(`${label(route)}: accepted with the correct token`, async () => {
    const s = await setup(TOKEN_ENV);
    const res = await send(s.app, route, s.manualId, { Authorization: `Bearer ${TOKEN}` });
    expect(res.status).toBe(route.ok);
  });

  it(`${label(route)}: accepted with the auth header from a trusted proxy`, async () => {
    const s = await setup(HEADER_ENV(LOOPBACK));
    const res = await send(s.app, route, s.manualId, { 'Remote-User': 'admin' });
    expect(res.status).toBe(route.ok);
  });

  it(`${label(route)}: header ignored from an untrusted IP (401)`, async () => {
    const s = await setup(HEADER_ENV('192.168.1.0/24'));
    const res = await send(s.app, route, s.manualId, { 'Remote-User': 'admin' });
    expect(res.status).toBe(401);
  });

  it(`${label(route)}: READONLY rejects even a correct token and header (403)`, async () => {
    const s = await setup({ ...TOKEN_ENV, ...HEADER_ENV(LOOPBACK), HOMEGANTRY_READONLY: 'true' });
    const res = await send(s.app, route, s.manualId, {
      Authorization: `Bearer ${TOKEN}`,
      'Remote-User': 'admin',
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/read-only/i);
  });
});

describe('GET /api/services?includeHidden=true needs edit rights', () => {
  const HIDDEN = '/api/services?includeHidden=true';
  const names = (body: unknown) => (body as Array<{ name: string }>).map((x) => x.name);

  it('anonymous: 401 when editing is enabled, and nothing is listed', async () => {
    const s = await setup(TOKEN_ENV);
    const res = await request(s.app).get(HIDDEN).expect(401);
    expect(res.body).toEqual({ error: 'authentication required' });
  });

  it('wrong token: 401 and counted as a failed attempt', async () => {
    const s = await setup(TOKEN_ENV);
    const res = await request(s.app)
      .get(HIDDEN)
      .set('Authorization', 'Bearer wrong-token')
      .expect(401);
    expect(res.body.error).toBe('invalid token');
  });

  it('editing disabled (no token, no header): 403 with the hint', async () => {
    const s = await setup({});
    const res = await request(s.app).get(HIDDEN).expect(403);
    expect(res.body.error).toBe('editing is disabled');
    expect(res.body.hint).toMatch(/HOMEGANTRY_ADMIN_TOKEN/);
  });

  it('READONLY: 403 even with a correct token', async () => {
    const s = await setup({ ...TOKEN_ENV, HOMEGANTRY_READONLY: 'true' });
    const res = await request(s.app)
      .get(HIDDEN)
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(403);
    expect(res.body.error).toMatch(/read-only/i);
  });

  it('admin token: lists hidden services, not cached', async () => {
    const s = await setup(TOKEN_ENV);
    const res = await request(s.app)
      .get(HIDDEN)
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(200);
    expect(names(res.body)).toContain('MariaDB');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('auth header from a trusted proxy: lists hidden services', async () => {
    const s = await setup(HEADER_ENV(LOOPBACK));
    const res = await request(s.app).get(HIDDEN).set('Remote-User', 'admin').expect(200);
    expect(names(res.body)).toContain('MariaDB');
  });

  it('auth header from an untrusted IP: 401', async () => {
    const s = await setup(HEADER_ENV('192.168.1.0/24'));
    await request(s.app).get(HIDDEN).set('Remote-User', 'admin').expect(401);
  });

  it.each(['/api/services', '/api/services?includeHidden=false'])(
    'anonymous %s still works and leaves hidden services out',
    async (path) => {
      const s = await setup(TOKEN_ENV);
      const res = await request(s.app).get(path).expect(200);
      expect(names(res.body)).toContain('Jellyfin');
      expect(names(res.body)).not.toContain('MariaDB');
    },
  );
});

describe('mutations are guarded before they touch state', () => {
  it('a rejected request does not change anything', async () => {
    const s = await setup(TOKEN_ENV);
    await request(s.app).patch('/api/settings').send({ columns: 2 }).expect(401);
    await request(s.app).put('/api/services/id-jellyfin/override').send({ hidden: true });
    expect(s.settingsStore.get().columns).toBe(4);
    expect(s.overridesStore.get()).toEqual({});
  });

  it('unknown mutating /api paths are rejected too', async () => {
    const s = await setup(TOKEN_ENV);
    await request(s.app).post('/api/whatever').expect(401);
  });

  it('read-only users keep full read access', async () => {
    const s = await setup({});
    await request(s.app).get('/api/services').expect(200);
    await request(s.app).get('/api/stacks').expect(200);
    await request(s.app).get('/api/settings').expect(200);
    await request(s.app).get('/api/health').expect(200);
  });

  it('an empty auth header value is not enough', async () => {
    const s = await setup(HEADER_ENV(LOOPBACK));
    await request(s.app).patch('/api/settings').set('Remote-User', '  ').send({}).expect(401);
  });

  it('the header is ignored when no trusted proxies are configured', async () => {
    const s = await setup({ HOMEGANTRY_AUTH_HEADER: 'Remote-User' });
    await request(s.app)
      .patch('/api/settings')
      .set('Remote-User', 'admin')
      .send({ columns: 2 })
      .expect(403);
  });

  it('a token shorter than 24 characters is refused (token auth stays off)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = await setup({ HOMEGANTRY_ADMIN_TOKEN: 'short-token' });
    await request(s.app)
      .patch('/api/settings')
      .set('Authorization', 'Bearer short-token')
      .send({ columns: 2 })
      .expect(403);
  });
});

describe('GET /api/auth', () => {
  it('reports read-only with no methods when nothing is configured', async () => {
    const s = await setup({});
    const res = await request(s.app).get('/api/auth').expect(200);
    expect(res.body).toEqual({
      canEdit: false,
      method: null,
      readonly: false,
      methods: { token: false, header: false },
    });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('reports the token method as available but not yet used', async () => {
    const s = await setup(TOKEN_ENV);
    const res = await request(s.app).get('/api/auth').expect(200);
    expect(res.body).toMatchObject({ canEdit: false, methods: { token: true, header: false } });
  });

  it('confirms a correct token (used by "Unlock editing")', async () => {
    const s = await setup(TOKEN_ENV);
    const res = await request(s.app)
      .get('/api/auth')
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(200);
    expect(res.body).toMatchObject({ canEdit: true, method: 'token' });
  });

  it('returns 401 for a wrong token', async () => {
    const s = await setup(TOKEN_ENV);
    await request(s.app).get('/api/auth').set('Authorization', 'Bearer nope').expect(401);
  });

  it('reports header auth from a trusted proxy', async () => {
    const s = await setup(HEADER_ENV(LOOPBACK));
    const res = await request(s.app).get('/api/auth').set('Remote-User', 'admin').expect(200);
    expect(res.body).toMatchObject({ canEdit: true, method: 'header' });
  });

  it('reports READONLY', async () => {
    const s = await setup({ ...TOKEN_ENV, HOMEGANTRY_READONLY: 'true' });
    const res = await request(s.app)
      .get('/api/auth')
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(200);
    expect(res.body).toEqual({
      canEdit: false,
      method: null,
      readonly: true,
      methods: { token: false, header: false },
    });
  });
});
