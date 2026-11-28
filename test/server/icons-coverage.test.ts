import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { container } from '../fixtures/containers.js';
import { loadApp, openSse } from '../helpers.js';
import { ICON_CDN, imgSrc, parseIconSource } from '../../server/icons.js';
import type { Service } from '../../server/types.js';

const TOKEN = 'change-me-0123456789abcdefghij';
const bearer = `Bearer ${TOKEN}`;

const lab = [
  container({ name: 'jellyfin', image: 'lscr.io/linuxserver/jellyfin:latest', project: 'media' }),
  container({ name: 'db', image: 'postgres:16', project: 'media', service: 'database' }),
  container({
    name: 'custom-one',
    image: 'registry.example.com:5000/team/custom-one:1.2@sha256:0123456789abcdef',
    project: 'tools',
    labels: { 'example.note': 'do-not-leak', 'homegantry.icon': 'https://icons.example.com/a.png' },
  }),
  container({ name: 'custom-two', image: 'example/custom-two:2', project: 'tools' }),
  container({ name: 'custom-two-b', image: 'example/custom-two:3', project: 'tools' }),
];

describe('parseIconSource', () => {
  it.each(['', 'cdn', 'CDN', '  cdn '])('%j is the CDN', (raw) => {
    expect(parseIconSource(raw)).toEqual({ mode: 'cdn', baseUrl: ICON_CDN });
  });

  it.each(['off', 'OFF'])('%s turns icons off', (raw) => {
    expect(parseIconSource(raw)).toEqual({ mode: 'off' });
  });

  it.each([
    ['https://icons.example.com', 'https://icons.example.com'],
    ['https://icons.example.com/', 'https://icons.example.com'],
    ['http://192.168.1.100:8080/dashboard-icons/', 'http://192.168.1.100:8080/dashboard-icons'],
    ['https://user:change-me@icons.example.com/x?y=1#z', 'https://icons.example.com/x'],
  ])('%s is a custom base URL', (raw, baseUrl) => {
    expect(parseIconSource(raw)).toEqual({ mode: 'custom', baseUrl });
  });

  it.each(['javascript:alert(1)', 'ftp://icons.example.com', 'not a url'])(
    'an invalid value (%s) fails closed',
    (raw) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(parseIconSource(raw)).toEqual({ mode: 'off' });
      expect(warn).toHaveBeenCalledOnce();
      expect(String(warn.mock.calls[0]![0])).not.toContain(raw);
    },
  );

  it('the CSP allows no external image when off', () => {
    expect(imgSrc({ mode: 'off' })).toBe("img-src 'self' data:");
  });
});

describe('HOMEGANTRY_ICON_SOURCE over HTTP', () => {
  it('defaults to the CDN', async () => {
    const { app } = await loadApp(lab);
    const res = await request(app).get('/api/ui-config').expect(200);
    expect(res.body).toEqual({
      icons: { mode: 'cdn', baseUrl: ICON_CDN },
      version: expect.any(String),
    });
    expect(res.headers['content-security-policy']).toContain("img-src 'self' data: https: http:");
  });

  it('serves a custom base URL', async () => {
    const { app } = await loadApp(lab, {
      HOMEGANTRY_ICON_SOURCE: 'https://user:change-me@icons.example.com/set/',
    });
    const res = await request(app).get('/api/ui-config').expect(200);
    expect(res.body).toEqual({
      icons: { mode: 'custom', baseUrl: 'https://icons.example.com/set' },
      version: expect.any(String),
    });
    expect(JSON.stringify(res.body)).not.toContain('change-me');
  });

  describe('off', () => {
    const off = { HOMEGANTRY_ICON_SOURCE: 'off' };

    it('leaves no external source in the CSP', async () => {
      const { app } = await loadApp(lab, off);
      for (const route of ['/', '/api/services', '/api/ui-config']) {
        const res = await request(app).get(route);
        const csp = res.headers['content-security-policy'] as string;
        expect(csp).toContain("img-src 'self' data:;");
        expect(csp).not.toMatch(/https?:/);
      }
    });

    it('sends no base URL to the client', async () => {
      const { app } = await loadApp(lab, off);
      const res = await request(app).get('/api/ui-config').expect(200);
      expect(res.body).toEqual({ icons: { mode: 'off' }, version: expect.any(String) });
    });

    it('drops explicit icon URLs from REST, keeps slugs', async () => {
      const { app } = await loadApp(lab, off);
      const res = await request(app).get('/api/services').expect(200);
      const byName = (n: string) => (res.body as Service[]).find((s) => s.container?.name === n);
      expect(byName('custom-one')?.icon).toBe('');
      expect(byName('jellyfin')?.icon).toBe('jellyfin');
      expect(JSON.stringify(res.body)).not.toContain('icons.example.com');
    });

    it('drops explicit icon URLs from SSE', async () => {
      const { app } = await loadApp(lab, off);
      const sse = await openSse(app);
      await sse.waitFor(1);
      sse.close();
      expect(JSON.stringify(sse.events)).not.toContain('icons.example.com');
    });

    it('drops explicit icon URLs from stored stacks', async () => {
      const { app, stacksStore } = await loadApp(lab, off);
      stacksStore.set({ tools: { visible: true, icon: 'https://icons.example.com/s.png' } });
      const res = await request(app).get('/api/stacks').expect(200);
      expect(JSON.stringify(res.body)).not.toContain('icons.example.com');
    });
  });

  it('keeps explicit icon URLs with the CDN source', async () => {
    const { app } = await loadApp(lab);
    const res = await request(app).get('/api/services').expect(200);
    const svc = (res.body as Service[]).find((s) => s.container?.name === 'custom-one');
    expect(svc?.icon).toBe('https://icons.example.com/a.png');
  });
});

describe('GET /api/kb/coverage', () => {
  const editable = { HOMEGANTRY_ADMIN_TOKEN: TOKEN };

  it('counts recognised containers and lists unrecognised images', async () => {
    const { app } = await loadApp(lab, editable);
    const res = await request(app).get('/api/kb/coverage').set('Authorization', bearer).expect(200);
    expect(res.body).toEqual({
      total: 5,
      recognised: 2,
      unrecognised: ['example/custom-two', 'registry.example.com:5000/team/custom-one'],
    });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('returns only image names', async () => {
    const { app } = await loadApp(lab, editable);
    const res = await request(app).get('/api/kb/coverage').set('Authorization', bearer).expect(200);
    expect(Object.keys(res.body).sort()).toEqual(['recognised', 'total', 'unrecognised']);
    const text = JSON.stringify(res.body);
    for (const leak of ['do-not-leak', 'custom-two-b', 'sha256', 'homegantry.icon', ':1.2']) {
      expect(text).not.toContain(leak);
    }
  });

  it('counts hidden infrastructure containers as recognised', async () => {
    const { app } = await loadApp([lab[1]!], editable);
    const res = await request(app).get('/api/kb/coverage').set('Authorization', bearer).expect(200);
    expect(res.body).toEqual({ total: 1, recognised: 1, unrecognised: [] });
  });

  it('is empty without containers', async () => {
    const { app } = await loadApp([], editable);
    const res = await request(app).get('/api/kb/coverage').set('Authorization', bearer).expect(200);
    expect(res.body).toEqual({ total: 0, recognised: 0, unrecognised: [] });
  });

  it('is 401 without a token when editing is enabled', async () => {
    const { app } = await loadApp(lab, editable);
    const res = await request(app).get('/api/kb/coverage').expect(401);
    expect(JSON.stringify(res.body)).not.toContain('custom');
  });

  it('is 401 with a wrong token', async () => {
    const { app } = await loadApp(lab, editable);
    await request(app)
      .get('/api/kb/coverage')
      .set('Authorization', 'Bearer change-me-wrong-token-000000000')
      .expect(401);
  });

  it('is 403 when editing is not configured', async () => {
    const { app } = await loadApp(lab);
    await request(app).get('/api/kb/coverage').expect(403);
  });

  it('is 403 in read-only mode, even with a valid token', async () => {
    const { app } = await loadApp(lab, { ...editable, HOMEGANTRY_READONLY: 'true' });
    await request(app).get('/api/kb/coverage').set('Authorization', bearer).expect(403);
  });

  it('ignores a forward-auth header from an untrusted client', async () => {
    const env = { HOMEGANTRY_AUTH_HEADER: 'Remote-User', HOMEGANTRY_TRUSTED_PROXIES: '10.0.0.1' };
    const { app } = await loadApp(lab, env);
    await request(app).get('/api/kb/coverage').set('Remote-User', 'someone').expect(401);
  });

  it('does not accept writes', async () => {
    const { app } = await loadApp(lab, editable);
    await request(app).post('/api/kb/coverage').set('Authorization', bearer).expect(404);
  });
});

describe('M1/M2 security model', () => {
  it('still refuses includeHidden without edit rights (#28)', async () => {
    const { app } = await loadApp(lab, { HOMEGANTRY_ADMIN_TOKEN: TOKEN });
    await request(app).get('/api/services?includeHidden=true').expect(401);
    await request(app)
      .get('/api/services?includeHidden=true')
      .set('Authorization', bearer)
      .expect(200);
  });

  it('still refuses includeHidden in read-only mode', async () => {
    const { app } = await loadApp(lab, {
      HOMEGANTRY_ADMIN_TOKEN: TOKEN,
      HOMEGANTRY_READONLY: 'true',
    });
    await request(app)
      .get('/api/services?includeHidden=true')
      .set('Authorization', bearer)
      .expect(403);
  });
});
