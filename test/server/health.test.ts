import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { container } from '../fixtures/containers.js';
import { loadApp, makeTempDir, type Env } from '../helpers.js';

type Handler = http.RequestListener;

const servers: Array<http.Server | https.Server> = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

async function listen<T extends http.Server | https.Server>(server: T): Promise<number> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
}

async function fakeHttp(handler: Handler) {
  const seen: Array<{ method: string; url: string; authorization?: string }> = [];
  const port = await listen(
    http.createServer((req, res) => {
      seen.push({
        method: req.method ?? '',
        url: req.url ?? '',
        authorization: req.headers.authorization,
      });
      handler(req, res);
    }),
  );
  return { url: `http://127.0.0.1:${port}`, port, seen };
}

/** A throwaway self-signed certificate, generated per run so no key lives in the repository. */
function selfSigned() {
  const dir = makeTempDir();
  const key = path.join(dir, 'key.pem');
  const cert = path.join(dir, 'cert.pem');
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      key,
      '-out',
      cert,
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
    ],
    { stdio: 'ignore' },
  );
  return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
}

const ok: Handler = (_req, res) => {
  res.writeHead(200).end();
};

async function loadHealth(env: Env = {}) {
  const s = await loadApp([], { HOMEGANTRY_HEALTHCHECK_TIMEOUT: '0.2', ...env });
  const health = await import('../../server/health.js');
  const routes = await import('../../server/routes.js');
  return { ...s, health, routes };
}

function labelled(id: string, url: string, labels: Record<string, string> = {}) {
  return container({
    id,
    name: id,
    image: 'example/app:1',
    labels: { 'homegantry.url': url, ...labels },
  });
}

describe('checkUrl', () => {
  it.each([200, 204, 301, 302, 401, 403, 404])('HTTP %i is up', async (status) => {
    const { health } = await loadHealth();
    const srv = await fakeHttp((_req, res) => res.writeHead(status).end());
    expect(await health.checkUrl(srv.url)).toMatchObject({ status: 'up', httpStatus: status });
    expect(srv.seen.map((r) => r.method)).toEqual(['HEAD']);
  });

  it.each([500, 502, 503, 504])('HTTP %i is down', async (status) => {
    const { health } = await loadHealth();
    const srv = await fakeHttp((_req, res) => res.writeHead(status).end());
    expect(await health.checkUrl(srv.url)).toMatchObject({
      status: 'down',
      reason: 'http',
      httpStatus: status,
    });
  });

  it('falls back to GET when HEAD is not allowed', async () => {
    const { health } = await loadHealth();
    const srv = await fakeHttp((req, res) =>
      res.writeHead(req.method === 'HEAD' ? 405 : 200).end(),
    );
    expect(await health.checkUrl(srv.url)).toMatchObject({ status: 'up', httpStatus: 200 });
    expect(srv.seen.map((r) => r.method)).toEqual(['HEAD', 'GET']);
  });

  it('falls back to GET when HEAD breaks the server', async () => {
    const { health } = await loadHealth();
    const srv = await fakeHttp((req, res) => {
      if (req.method === 'HEAD') req.socket.destroy();
      else res.writeHead(200).end();
    });
    expect((await health.checkUrl(srv.url)).status).toBe('up');
  });

  it('does not follow redirects', async () => {
    const { health } = await loadHealth();
    const target = await fakeHttp(ok);
    const srv = await fakeHttp((_req, res) => {
      res.writeHead(302, { Location: target.url }).end();
    });
    expect((await health.checkUrl(srv.url)).status).toBe('up');
    expect(target.seen).toEqual([]);
  });

  it('reports a timeout', async () => {
    const { health } = await loadHealth({ HOMEGANTRY_HEALTHCHECK_TIMEOUT: '0.05' });
    const srv = await fakeHttp(() => {});
    expect(await health.checkUrl(srv.url)).toMatchObject({ status: 'down', reason: 'timeout' });
    expect(srv.seen).toHaveLength(1);
  });

  it('reports a refused connection', async () => {
    const { health } = await loadHealth();
    expect(await health.checkUrl('http://127.0.0.1:1')).toMatchObject({
      status: 'down',
      reason: 'unreachable',
    });
  });

  it('reports a TLS error as such', async () => {
    const { health } = await loadHealth();
    const port = await listen(https.createServer(selfSigned(), ok));
    expect(await health.checkUrl(`https://127.0.0.1:${port}`)).toMatchObject({
      status: 'unknown',
      reason: 'tls',
    });
  });

  it('allows self-signed certificates when configured', async () => {
    const { health } = await loadHealth({ HOMEGANTRY_HEALTHCHECK_INSECURE_TLS: 'true' });
    const port = await listen(https.createServer(selfSigned(), ok));
    expect((await health.checkUrl(`https://127.0.0.1:${port}`)).status).toBe('up');
  });

  it('records when it checked', async () => {
    const { health } = await loadHealth();
    const srv = await fakeHttp(ok);
    const { checkedAt } = await health.checkUrl(srv.url);
    expect(Number.isNaN(Date.parse(checkedAt))).toBe(false);
  });

  it('sends no credentials from the URL', async () => {
    const { health } = await loadHealth();
    const srv = await fakeHttp(ok);
    await health.checkUrl(`http://user:change-me-pass@127.0.0.1:${srv.port}/`);
    expect(srv.seen[0]!.authorization).toBeUndefined();
  });
});

describe('health check runs', () => {
  it('limits concurrency', async () => {
    const { health } = await loadHealth({ HOMEGANTRY_HEALTHCHECK_CONCURRENCY: '2' });
    let active = 0;
    let peak = 0;
    const srv = await fakeHttp((_req, res) => {
      active++;
      peak = Math.max(peak, active);
      setTimeout(() => {
        active--;
        res.writeHead(200).end();
      }, 20);
    });
    const targets = Array.from({ length: 6 }, (_, i) => ({
      id: `s${i}`,
      url: `${srv.url}/${i}`,
    }));
    await health.runHealthChecks(targets);
    expect(srv.seen).toHaveLength(6);
    expect(peak).toBe(2);
  });

  it('reports changes only, and forgets services that are no longer checked', async () => {
    const { health } = await loadHealth();
    let status = 200;
    const srv = await fakeHttp((_req, res) => res.writeHead(status).end());
    const changed = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const targets = [{ id: 'a', url: srv.url }];

    await health.runHealthChecks(targets, changed);
    expect(changed).toHaveBeenCalledTimes(1);
    await health.runHealthChecks(targets, changed);
    expect(changed).toHaveBeenCalledTimes(1);

    status = 503;
    await health.runHealthChecks(targets, changed);
    expect(changed).toHaveBeenCalledTimes(2);
    expect(health.getHealth('a')?.status).toBe('down');
    expect(warn).toHaveBeenCalledTimes(1);

    await health.runHealthChecks([], changed);
    expect(health.getHealth('a')).toBeUndefined();
    expect(changed).toHaveBeenCalledTimes(3);
  });

  it('never logs userinfo, query strings or credentials', async () => {
    const { health } = await loadHealth();
    const logs = (['log', 'info', 'warn', 'error'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {}),
    );
    const srv = await fakeHttp((_req, res) => res.writeHead(500).end());
    const secretUrl = `http://admin:change-me-pass@127.0.0.1:${srv.port}/app?token=change-me-token#x`;
    await health.runHealthChecks([
      { id: 'a', url: secretUrl },
      { id: 'b', url: 'http://admin:change-me-pass@127.0.0.1:1/?token=change-me-token' },
    ]);
    const output = JSON.stringify(logs.flatMap((spy) => spy.mock.calls));
    expect(output).toContain('[health]');
    expect(output).toContain('/app');
    for (const forbidden of ['change-me-pass', 'change-me-token', 'admin', '?', '#x']) {
      expect(output).not.toContain(forbidden);
    }
  });

  it('does not overlap runs on the interval and stops cleanly', async () => {
    const { health } = await loadHealth({ HOMEGANTRY_HEALTHCHECK_INTERVAL: '5' });
    vi.useFakeTimers();
    try {
      let release: (() => void) | undefined;
      const getTargets = vi.fn(() => {
        return [] as Array<{ id: string; url: string }>;
      });
      const blocked = new Promise<void>((resolve) => (release = resolve));
      const slowTargets = vi.fn(async () => {
        await blocked;
        return getTargets();
      });
      health.startHealthChecks(slowTargets, () => {});
      await vi.advanceTimersByTimeAsync(20_000);
      expect(slowTargets).toHaveBeenCalledTimes(1);
      release!();
      await vi.advanceTimersByTimeAsync(5000);
      expect(slowTargets).toHaveBeenCalledTimes(2);
      health.stopHealthChecks();
      await vi.advanceTimersByTimeAsync(20_000);
      expect(slowTargets).toHaveBeenCalledTimes(2);
    } finally {
      health.stopHealthChecks();
      vi.useRealTimers();
    }
  });

  it('HOMEGANTRY_HEALTHCHECK=false turns checks off', async () => {
    const srv = await fakeHttp(ok);
    const s = await loadApp([labelled('c1', srv.url)], { HOMEGANTRY_HEALTHCHECK: 'false' });
    const routes = await import('../../server/routes.js');
    routes.startServiceHealthChecks();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(srv.seen).toEqual([]);
    const res = await request(s.app).get('/api/services').expect(200);
    expect(res.body[0].health).toBeUndefined();
  });
});

describe('health targets and API', () => {
  it('checks the service URL and exposes the result via REST', async () => {
    const srv = await fakeHttp(ok);
    const s = await loadApp([labelled('c1', srv.url)]);
    const routes = await import('../../server/routes.js');
    await routes.checkServicesNow();
    const res = await request(s.app).get('/api/services').expect(200);
    expect(res.body[0].health).toEqual({
      status: 'up',
      checkedAt: expect.any(String),
      httpStatus: 200,
    });
  });

  it('honours the homegantry.healthcheck=false label', async () => {
    const srv = await fakeHttp(ok);
    const s = await loadApp([labelled('c1', srv.url, { 'homegantry.healthcheck': 'false' })]);
    const routes = await import('../../server/routes.js');
    await routes.checkServicesNow();
    expect(srv.seen).toEqual([]);
    const res = await request(s.app).get('/api/services').expect(200);
    expect(res.body[0].health).toBeUndefined();
  });

  it('honours the homegantry.healthcheck.url label', async () => {
    const srv = await fakeHttp(ok);
    await loadApp([
      labelled('c1', 'https://app.example.com', {
        'homegantry.healthcheck.url': `${srv.url}/healthz`,
      }),
    ]);
    const routes = await import('../../server/routes.js');
    await routes.checkServicesNow();
    expect(srv.seen.map((r) => r.url)).toEqual(['/healthz']);
  });

  it.each(['javascript:alert(1)', 'file:///etc/passwd', 'ftp://192.168.1.100/'])(
    'ignores the unsafe health URL %s',
    async (url) => {
      const srv = await fakeHttp(ok);
      await loadApp([labelled('c1', srv.url, { 'homegantry.healthcheck.url': url })]);
      const routes = await import('../../server/routes.js');
      await routes.checkServicesNow();
      expect(srv.seen.map((r) => r.url)).toEqual(['/']);
    },
  );

  it('skips stopped containers, hidden services and services without a URL', async () => {
    const srv = await fakeHttp(ok);
    const s = await loadApp(
      [
        { ...labelled('stopped', srv.url), State: 'exited' },
        labelled('hidden', srv.url),
        container({ id: 'nourl', name: 'nourl', image: 'example/app:1' }),
      ],
      { HOMEGANTRY_SHOW_STOPPED: 'true' },
    );
    s.overridesStore.set({ hidden: { hidden: true } });
    s.rematchService('hidden');
    const routes = await import('../../server/routes.js');
    await routes.checkServicesNow();
    expect(srv.seen).toEqual([]);
  });

  it('checks manual services', async () => {
    const srv = await fakeHttp(ok);
    const s = await loadApp([]);
    s.manualServicesStore.set([
      {
        id: 'm1',
        displayName: 'Router',
        url: srv.url,
        icon: '',
        category: 'Network',
        description: '',
        sortOrder: 0,
      },
    ]);
    const routes = await import('../../server/routes.js');
    await routes.checkServicesNow();
    const res = await request(s.app).get('/api/services').expect(200);
    expect(res.body[0].health.status).toBe('up');
  });

  it('pushes health changes over SSE through the sanitiser', async () => {
    const { openSse } = await import('../helpers.js');
    const srv = await fakeHttp((_req, res) => res.writeHead(503).end());
    const s = await loadApp([labelled('c1', srv.url)]);
    const routes = await import('../../server/routes.js');
    const stream = await openSse(s.app);
    await stream.waitFor(1);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await routes.checkServicesNow();
    await stream.waitFor(2);
    const update = stream.events[1] as { type: string; data: { health: Record<string, unknown> } };
    expect(update.type).toBe('service_updated');
    expect(Object.keys(update.data.health).sort()).toEqual([
      'checkedAt',
      'httpStatus',
      'reason',
      'status',
    ]);
    stream.close();
  });

  it('drops unexpected fields from a health result', async () => {
    const { publicService } = await import('../../server/sanitize.js');
    const out = publicService({
      id: 'c1',
      source: 'docker',
      name: 'App',
      description: '',
      url: 'https://app.example.com',
      icon: '',
      category: 'Other',
      status: 'running',
      hidden: false,
      sortOrder: 0,
      health: {
        status: 'down',
        checkedAt: '2026-01-01T00:00:00.000Z',
        error: 'connect ECONNREFUSED 192.168.1.100:8096',
      } as never,
    });
    expect(out.health).toEqual({ status: 'down', checkedAt: '2026-01-01T00:00:00.000Z' });
  });

  it('adds no mutating route', async () => {
    const s = await loadApp([]);
    await request(s.app).post('/api/health').expect(403);
    await request(s.app).put('/api/services/c1/health').send({}).expect(403);
  });
});
