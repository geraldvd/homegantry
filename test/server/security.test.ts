import type { Request } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { exampleLab } from '../fixtures/containers.js';
import { loadApp, loadServer, type Env } from '../helpers.js';

const TOKEN = 'change-me-0123456789abcdefghij';
const AUTH = { Authorization: `Bearer ${TOKEN}` };

async function setup(env: Env = {}, options?: Parameters<typeof loadApp>[2]) {
  return loadApp(exampleLab, { HOMEGANTRY_ADMIN_TOKEN: TOKEN, ...env }, options);
}

/** A minimal Express-like request for unit-testing helpers. */
function fakeReq(remoteAddress: string, headers: Record<string, string> = {}): Request {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    socket: { remoteAddress },
    get: (name: string) => lower[name.toLowerCase()],
  } as unknown as Request;
}

describe('security headers', () => {
  it('are set on API responses and the SPA', async () => {
    const { app } = await setup();
    for (const url of ['/api/health', '/']) {
      const res = await request(app).get(url).expect(200);
      expect(res.headers['content-security-policy']).toContain("default-src 'self'");
      expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
      expect(res.headers['content-security-policy']).toContain("script-src 'self'");
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['referrer-policy']).toBe('same-origin');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['x-powered-by']).toBeUndefined();
    }
  });
});

describe('CORS', () => {
  it('is off by default', async () => {
    const { app } = await setup();
    const res = await request(app).get('/api/health').set('Origin', 'https://other.example.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows only the configured origins', async () => {
    const { app } = await setup({ HOMEGANTRY_CORS_ORIGINS: 'https://dash.example.com' });
    const ok = await request(app).get('/api/health').set('Origin', 'https://dash.example.com');
    expect(ok.headers['access-control-allow-origin']).toBe('https://dash.example.com');
    const other = await request(app).get('/api/health').set('Origin', 'https://evil.example.com');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('lets a configured origin pass the same-origin check on writes', async () => {
    const { app } = await setup({ HOMEGANTRY_CORS_ORIGINS: 'https://dash.example.com' });
    await request(app)
      .patch('/api/settings')
      .set(AUTH)
      .set('Origin', 'https://dash.example.com')
      .send({ columns: 2 })
      .expect(200);
  });
});

describe('same-origin check on mutating routes', () => {
  it('rejects a cross-origin write even with a valid token', async () => {
    const s = await setup();
    const res = await request(s.app)
      .patch('/api/settings')
      .set(AUTH)
      .set('Origin', 'https://evil.example.com')
      .send({ columns: 2 })
      .expect(403);
    expect(res.body.error).toMatch(/cross-origin/);
    expect(s.settingsStore.get().columns).toBe(4);
  });

  it('accepts a write whose Origin matches the Host header', async () => {
    const { app } = await setup();
    await request(app)
      .patch('/api/settings')
      .set(AUTH)
      .set('Host', 'homegantry.example.com')
      .set('Origin', 'https://homegantry.example.com')
      .send({ columns: 2 })
      .expect(200);
  });

  it('falls back to the Referer header', async () => {
    const { app } = await setup();
    await request(app)
      .patch('/api/settings')
      .set(AUTH)
      .set('Host', 'homegantry.example.com')
      .set('Referer', 'https://evil.example.com/page')
      .send({ columns: 2 })
      .expect(403);
    await request(app)
      .patch('/api/settings')
      .set(AUTH)
      .set('Host', 'homegantry.example.com')
      .set('Referer', 'https://homegantry.example.com/')
      .send({ columns: 2 })
      .expect(200);
  });

  it('rejects the opaque "null" origin', async () => {
    const { app } = await setup();
    await request(app)
      .patch('/api/settings')
      .set(AUTH)
      .set('Origin', 'null')
      .send({ columns: 2 })
      .expect(403);
  });

  it('does not apply to reads', async () => {
    const { app } = await setup();
    await request(app).get('/api/services').set('Origin', 'https://evil.example.com').expect(200);
  });

  it('honours X-Forwarded-Host only from a trusted proxy', async () => {
    const { isSameOrigin } = await import('../../server/security.js');
    const headers = {
      host: 'homegantry:3000',
      'x-forwarded-host': 'homegantry.example.com',
      origin: 'https://homegantry.example.com',
    };
    expect(isSameOrigin(fakeReq('192.168.1.100', headers), [])).toBe(false);

    const server = await loadServer({ HOMEGANTRY_TRUSTED_PROXIES: '192.168.1.100' });
    const security = await import('../../server/security.js');
    expect(server.config.trustedProxies).toBe('192.168.1.100');
    expect(security.isSameOrigin(fakeReq('192.168.1.100', headers), [])).toBe(true);
    expect(security.isSameOrigin(fakeReq('192.168.1.200', headers), [])).toBe(false);
  });
});

describe('rate limiting', () => {
  it('limits mutating requests per client IP with 429 + Retry-After', async () => {
    const { app } = await setup({}, { writeLimit: { windowMs: 60_000, max: 3 } });
    for (let i = 0; i < 3; i++) {
      await request(app).patch('/api/settings').set(AUTH).send({ columns: 2 }).expect(200);
    }
    const res = await request(app).patch('/api/settings').set(AUTH).send({ columns: 2 });
    expect(res.status).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    // Reads are not limited.
    await request(app).get('/api/settings').expect(200);
  });

  it('blocks a client after too many failed token attempts, even with the right token', async () => {
    const { app } = await setup({}, { failedAuthLimit: { windowMs: 60_000, max: 3 } });
    for (let i = 0; i < 3; i++) {
      await request(app)
        .patch('/api/settings')
        .set('Authorization', 'Bearer change-me-wrong-token-000000000')
        .send({ columns: 2 })
        .expect(401);
    }
    await request(app).patch('/api/settings').set(AUTH).send({ columns: 2 }).expect(429);
    await request(app).get('/api/auth').set(AUTH).expect(429);
  });

  it('counts failed attempts on GET /api/auth too', async () => {
    const { app } = await setup({}, { failedAuthLimit: { windowMs: 60_000, max: 2 } });
    await request(app).get('/api/auth').set('Authorization', 'Bearer nope').expect(401);
    await request(app).get('/api/auth').set('Authorization', 'Bearer nope').expect(401);
    await request(app).get('/api/auth').set(AUTH).expect(429);
  });

  it('RateLimiter resets after the window', async () => {
    const { RateLimiter } = await import('../../server/security.js');
    let now = 0;
    const limiter = new RateLimiter({ windowMs: 1000, max: 2 }, () => now);
    expect(limiter.hit('a')).toBe(false);
    expect(limiter.hit('a')).toBe(false);
    expect(limiter.blocked('a')).toBe(true);
    expect(limiter.hit('a')).toBe(true);
    expect(limiter.hit('b')).toBe(false);
    expect(limiter.retryAfter('a')).toBe(1);
    now = 1000;
    expect(limiter.blocked('a')).toBe(false);
    expect(limiter.hit('a')).toBe(false);
  });
});

describe('request body', () => {
  it('rejects bodies over the size limit with a JSON 413', async () => {
    const { app } = await setup();
    const res = await request(app)
      .patch('/api/settings')
      .set(AUTH)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ dashboardTitle: 'x'.repeat(20_000) }));
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: 'request body too large' });
  });

  it('rejects malformed JSON with a JSON 400 (no stack trace)', async () => {
    const { app } = await setup();
    const res = await request(app)
      .patch('/api/settings')
      .set(AUTH)
      .set('Content-Type', 'application/json')
      .send('{ not json');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid JSON body' });
  });

  it('does not parse the body of an unauthorised request', async () => {
    const { app } = await setup();
    const res = await request(app)
      .patch('/api/settings')
      .set('Content-Type', 'application/json')
      .send('{ not json');
    expect(res.status).toBe(401);
  });
});

describe('auth helpers', () => {
  it('normaliseIp unwraps IPv4-mapped IPv6 and zone ids', async () => {
    const { normaliseIp } = await import('../../server/auth.js');
    expect(normaliseIp('::ffff:192.168.1.100')).toBe('192.168.1.100');
    expect(normaliseIp('fe80::1%eth0')).toBe('fe80::1');
    expect(normaliseIp(undefined)).toBe('');
  });

  it('parseTrustedProxies accepts IPs and CIDRs and reports invalid entries', async () => {
    const { parseTrustedProxies } = await import('../../server/auth.js');
    const p = parseTrustedProxies('172.16.0.0/12, 192.168.1.100 fd00::/8,bogus, 10.0.0.0/33');
    expect(p.size).toBe(3);
    expect(p.invalid).toEqual(['bogus', '10.0.0.0/33']);
    expect(p.has('172.18.0.5')).toBe(true);
    expect(p.has('::ffff:172.18.0.5')).toBe(true);
    expect(p.has('192.168.1.100')).toBe(true);
    expect(p.has('192.168.1.101')).toBe(false);
    expect(p.has('fd00::1')).toBe(true);
    expect(p.has('not-an-ip')).toBe(false);
    expect(parseTrustedProxies('').has('127.0.0.1')).toBe(false);
  });

  it('clientIp uses X-Forwarded-For only behind a trusted proxy', async () => {
    const { clientIp, parseTrustedProxies } = await import('../../server/auth.js');
    const proxies = parseTrustedProxies('172.16.0.0/12');
    const xff = { 'X-Forwarded-For': '203.0.113.7, 192.168.1.50, 172.18.0.2' };
    expect(clientIp(fakeReq('172.18.0.3', xff), proxies)).toBe('192.168.1.50');
    expect(clientIp(fakeReq('192.168.1.60', xff), proxies)).toBe('192.168.1.60');
    expect(clientIp(fakeReq('172.18.0.3'), proxies)).toBe('172.18.0.3');
    expect(clientIp(fakeReq('172.18.0.3', { 'X-Forwarded-For': '172.18.0.9' }), proxies)).toBe(
      '172.18.0.9',
    );
  });

  it('tokensEqual compares in constant time and handles different lengths', async () => {
    const { tokensEqual } = await import('../../server/auth.js');
    expect(tokensEqual(TOKEN, TOKEN)).toBe(true);
    expect(tokensEqual(TOKEN, TOKEN + 'x')).toBe(false);
    expect(tokensEqual('', TOKEN)).toBe(false);
  });

  it('securitySummary explains how to enable editing when nothing is configured', async () => {
    await loadServer();
    const { securitySummary } = await import('../../server/auth.js');
    const { errors, info } = securitySummary();
    expect(errors).toEqual([]);
    expect(info.join('\n')).toMatch(/editing is disabled: set HOMEGANTRY_ADMIN_TOKEN/);
  });

  it('securitySummary reports a short token, a header without proxies and bad CIDRs', async () => {
    await loadServer({
      HOMEGANTRY_ADMIN_TOKEN: 'too-short',
      HOMEGANTRY_AUTH_HEADER: 'Remote-User',
      HOMEGANTRY_TRUSTED_PROXIES: 'bogus',
    });
    const { securitySummary } = await import('../../server/auth.js');
    const { errors } = securitySummary();
    expect(errors).toHaveLength(3);
    expect(errors[0]).toMatch(/shorter than 24/);
    expect(errors[1]).toMatch(/TRUSTED_PROXIES is empty/);
    expect(errors[2]).toMatch(/invalid entry "bogus"/);
  });

  it('securitySummary lists the enabled methods and READONLY', async () => {
    await loadServer({
      HOMEGANTRY_ADMIN_TOKEN: TOKEN,
      HOMEGANTRY_AUTH_HEADER: 'Remote-User',
      HOMEGANTRY_TRUSTED_PROXIES: '172.16.0.0/12',
    });
    let { securitySummary } = await import('../../server/auth.js');
    expect(securitySummary().info).toEqual([
      'editing enabled via admin token or Remote-User header from trusted proxies',
    ]);
    await loadServer({ HOMEGANTRY_ADMIN_TOKEN: TOKEN, HOMEGANTRY_READONLY: 'true' });
    ({ securitySummary } = await import('../../server/auth.js'));
    expect(securitySummary().info[0]).toMatch(/read-only mode/);
  });
});
