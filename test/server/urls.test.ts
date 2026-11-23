import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { publicService } from '../../server/sanitize.js';
import type { Service } from '../../server/types.js';
import { redactUrl, safeHttpUrl, safeIcon, safeServiceUrl } from '../../server/urls.js';
import { container } from '../fixtures/containers.js';
import { loadApp, openSse } from '../helpers.js';

const TOKEN = 'change-me-0123456789abcdefghij';

const UNSAFE_URLS = [
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  ' javascript:alert(1)',
  'java\tscript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'vbscript:msgbox(1)',
  'file:///etc/passwd',
  'ftp://files.example.com',
  'not a url',
  '',
];

describe('safeHttpUrl', () => {
  it.each(UNSAFE_URLS)('rejects %j', (value) => {
    expect(safeHttpUrl(value)).toBeUndefined();
  });

  it.each([null, undefined, 42, {}, ['https://app.example.com']])('rejects non-string %j', (v) => {
    expect(safeHttpUrl(v)).toBeUndefined();
  });

  it.each([
    ['https://app.example.com', 'https://app.example.com'],
    ['http://192.168.1.100:8096', 'http://192.168.1.100:8096'],
    ['https://app.example.com/', 'https://app.example.com/'],
    ['https://app.example.com/admin?tab=1#top', 'https://app.example.com/admin?tab=1#top'],
    ['  https://app.example.com  ', 'https://app.example.com'],
  ])('keeps %s', (value, expected) => {
    expect(safeHttpUrl(value)).toBe(expected);
  });

  it.each([
    ['https://user:change-me-pass@app.example.com/x', 'https://app.example.com/x'],
    ['https://user@app.example.com', 'https://app.example.com'],
    ['https://:change-me-pass@app.example.com:8443/', 'https://app.example.com:8443/'],
    ['https:\\\\user:change-me-pass@app.example.com', 'https://app.example.com'],
  ])('strips userinfo from %s', (value, expected) => {
    expect(safeHttpUrl(value)).toBe(expected);
  });
});

describe('safeServiceUrl / safeIcon', () => {
  it('maps unsafe URLs to "#" and keeps "#"', () => {
    expect(safeServiceUrl('javascript:alert(1)')).toBe('#');
    expect(safeServiceUrl('#')).toBe('#');
    expect(safeServiceUrl('https://app.example.com')).toBe('https://app.example.com');
  });

  it.each(['jellyfin', 'home-assistant', 'jellyfin.png', 'mdi_movie'])('keeps slug %s', (slug) => {
    expect(safeIcon(slug)).toBe(slug);
  });

  it.each(['javascript:alert(1)', 'data:image/svg+xml,<svg/>', '../../etc/passwd', 'a b'])(
    'drops icon %s',
    (icon) => {
      expect(safeIcon(icon)).toBe('');
    },
  );

  it('keeps http(s) icon URLs without userinfo', () => {
    expect(safeIcon('https://user:change-me-pass@cdn.example.com/a.png')).toBe(
      'https://cdn.example.com/a.png',
    );
  });
});

describe('redactUrl', () => {
  it('drops userinfo, query string and fragment', () => {
    expect(redactUrl('https://user:change-me-pass@app.example.com:8443/a/b?token=x#frag')).toBe(
      'https://app.example.com:8443/a/b',
    );
  });

  it('does not echo values it cannot parse', () => {
    expect(redactUrl('user:change-me-pass@@not a url')).toBe('[invalid url]');
  });
});

describe('publicService URL filtering (#16, #17)', () => {
  const base: Service = {
    id: 'c1',
    source: 'docker',
    name: 'App',
    description: '',
    url: 'https://app.example.com',
    icon: 'app',
    category: 'Other',
    status: 'running',
    hidden: false,
    sortOrder: 0,
  };

  it('replaces unsafe url and icon values', () => {
    const out = publicService({ ...base, url: 'javascript:alert(1)', icon: 'data:image/png,x' });
    expect(out.url).toBe('#');
    expect(out.icon).toBe('');
  });

  it('strips userinfo', () => {
    expect(publicService({ ...base, url: 'https://u:change-me-pass@app.example.com' }).url).toBe(
      'https://app.example.com',
    );
  });
});

describe('unsafe values end to end (#16, #17)', () => {
  const unsafeLabel = container({
    id: 'c-label',
    name: 'labelled',
    image: 'example/app:1',
    labels: { 'homegantry.url': 'javascript:alert(1)', 'homegantry.icon': 'data:image/png,x' },
  });
  const userinfoLabel = container({
    id: 'c-userinfo',
    name: 'userinfo',
    image: 'example/app:1',
    labels: { 'homegantry.url': 'https://admin:change-me-pass@app.example.com/' },
  });

  it('filters a javascript: URL from a label in REST and SSE', async () => {
    const s = await loadApp([unsafeLabel]);
    const res = await request(s.app).get('/api/services').expect(200);
    expect(res.body[0]).toMatchObject({ url: '#', icon: '' });
    const stream = await openSse(s.app);
    await stream.waitFor(1);
    expect(JSON.stringify(stream.events)).not.toContain('javascript:');
    stream.close();
  });

  it('strips userinfo from a label URL in REST and SSE', async () => {
    const s = await loadApp([userinfoLabel]);
    const res = await request(s.app).get('/api/services').expect(200);
    expect(res.body[0].url).toBe('https://app.example.com/');
    const stream = await openSse(s.app);
    await stream.waitFor(1);
    expect(JSON.stringify(stream.events)).not.toContain('change-me-pass');
    stream.close();
  });

  it('filters a pre-M1 stored override', async () => {
    const s = await loadApp([container({ id: 'c1', name: 'app', image: 'example/app:1' })]);
    s.overridesStore.set({ c1: { url: 'javascript:alert(1)', icon: 'javascript:alert(2)' } });
    s.rematchService('c1');
    const res = await request(s.app).get('/api/services').expect(200);
    expect(res.body[0]).toMatchObject({ url: '#', icon: '' });
  });

  it('filters a pre-M1 stored manual service', async () => {
    const s = await loadApp([]);
    s.manualServicesStore.set([
      {
        id: 'm1',
        displayName: 'Old',
        url: 'data:text/html,<script>alert(1)</script>',
        icon: 'javascript:alert(1)',
        category: 'Other',
        description: '',
        sortOrder: 0,
      },
    ]);
    const res = await request(s.app).get('/api/services').expect(200);
    expect(res.body[0]).toMatchObject({ url: '#', icon: '' });
  });

  it('strips userinfo from manual services before storing and returning them', async () => {
    const s = await loadApp([], { HOMEGANTRY_ADMIN_TOKEN: TOKEN });
    const api = request.agent(s.app).set('Authorization', `Bearer ${TOKEN}`);
    const created = await api
      .post('/api/services/manual')
      .send({ displayName: 'Router', url: 'http://admin:change-me-pass@192.168.1.1' })
      .expect(201);
    expect(created.body.url).toBe('http://192.168.1.1');
    expect(JSON.stringify(s.manualServicesStore.get())).not.toContain('change-me-pass');
  });

  it('does not echo a stored unsafe URL from the manual update response', async () => {
    const s = await loadApp([], { HOMEGANTRY_ADMIN_TOKEN: TOKEN });
    const api = request.agent(s.app).set('Authorization', `Bearer ${TOKEN}`);
    s.manualServicesStore.set([
      {
        id: 'm1',
        displayName: 'Old',
        url: 'javascript:alert(1)',
        icon: '',
        category: 'Other',
        description: '',
        sortOrder: 0,
      },
    ]);
    const res = await api.put('/api/services/manual/m1').send({ displayName: 'New' }).expect(200);
    expect(res.body.url).toBe('#');
  });
});
