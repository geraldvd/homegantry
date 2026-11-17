import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { exampleLab } from '../fixtures/containers.js';
import { loadApp } from '../helpers.js';

const TOKEN = 'change-me-0123456789abcdefghij';

async function setup() {
  const s = await loadApp(exampleLab, { HOMEGANTRY_ADMIN_TOKEN: TOKEN });
  const api = request.agent(s.app).set('Authorization', `Bearer ${TOKEN}`);
  return { ...s, api };
}

const manualBody = {
  displayName: 'Router',
  url: 'http://192.168.1.1',
  icon: 'router',
  category: 'Network',
  description: 'Home router',
  sortOrder: 1,
};

describe('input validation (zod)', () => {
  it('returns 400 with the failing fields', async () => {
    const { api } = await setup();
    const res = await api.patch('/api/settings').send({ columns: 'six' }).expect(400);
    expect(res.body.error).toBe('invalid request');
    expect(res.body.issues).toEqual([expect.objectContaining({ path: 'body.columns' })]);
  });

  describe('PUT /api/services/:id/override', () => {
    it.each([
      ['unknown field', { displayName: 'X', admin: true }],
      ['javascript: URL', { url: 'javascript:alert(1)' }],
      ['data: URL', { url: 'data:text/html,<script>alert(1)</script>' }],
      ['non-boolean hidden', { hidden: 'yes' }],
      ['non-integer sortOrder', { sortOrder: 1.5 }],
      ['overlong name', { displayName: 'x'.repeat(201) }],
      ['icon with path characters', { icon: '../../etc/passwd' }],
      ['array body', [1, 2]],
    ])('rejects %s', async (_name, body) => {
      const s = await setup();
      await s.api.put('/api/services/id-jellyfin/override').send(body).expect(400);
      expect(s.overridesStore.get()).toEqual({});
    });

    it.each([
      { url: 'https://jellyfin.example.com' },
      { url: 'http://192.168.1.100:8096' },
      { url: '#' },
      { icon: 'jellyfin' },
      { icon: 'https://cdn.example.com/icons/jellyfin.png' },
      { hidden: true, sortOrder: -3 },
    ])('accepts %j', async (body) => {
      const { api } = await setup();
      await api.put('/api/services/id-jellyfin/override').send(body).expect(200);
    });

    it.each(['constructor', 'prototype', 'bad id', 'a'.repeat(129)])(
      'rejects the id %s',
      async (id) => {
        const s = await setup();
        await s.api
          .put(`/api/services/${encodeURIComponent(id)}/override`)
          .send({ hidden: true })
          .expect(400);
        expect(Object.keys(s.overridesStore.get())).toEqual([]);
      },
    );

    it('cannot pollute the object prototype via __proto__', async () => {
      const s = await setup();
      await s.api.put('/api/services/__proto__/override').send({ hidden: true }).expect(400);
      expect(({} as Record<string, unknown>).hidden).toBeUndefined();
    });
  });

  describe('manual services', () => {
    it('POST requires a name and an http(s) URL', async () => {
      const { api } = await setup();
      await api.post('/api/services/manual').send({ url: 'http://192.168.1.1' }).expect(400);
      await api.post('/api/services/manual').send({ displayName: 'Router' }).expect(400);
      await api
        .post('/api/services/manual')
        .send({ ...manualBody, url: 'javascript:alert(1)' })
        .expect(400);
    });

    it('POST fills optional fields with defaults', async () => {
      const { api } = await setup();
      const res = await api
        .post('/api/services/manual')
        .send({ displayName: 'Router', url: 'http://192.168.1.1' })
        .expect(201);
      expect(res.body).toEqual({
        id: expect.any(String),
        displayName: 'Router',
        url: 'http://192.168.1.1',
        icon: '',
        category: '',
        description: '',
        sortOrder: 0,
      });
    });

    it('POST ignores a client-supplied id by rejecting unknown fields', async () => {
      const { api } = await setup();
      await api
        .post('/api/services/manual')
        .send({ ...manualBody, id: 'chosen' })
        .expect(400);
    });

    it('PUT rejects invalid fields and the id field', async () => {
      const s = await setup();
      const { body: created } = await s.api.post('/api/services/manual').send(manualBody);
      await s.api.put(`/api/services/manual/${created.id}`).send({ id: 'hijack' }).expect(400);
      await s.api.put(`/api/services/manual/${created.id}`).send({ url: 'ftp://x' }).expect(400);
      expect(s.manualServicesStore.get()).toEqual([created]);
    });
  });

  describe('PATCH /api/stacks/:name', () => {
    it('validates the stack name and body', async () => {
      const { api } = await setup();
      await api.patch('/api/stacks/media').send({ visible: 'no' }).expect(400);
      await api.patch('/api/stacks/media').send({ color: 'red' }).expect(400);
      await api.patch('/api/stacks/constructor').send({ visible: false }).expect(400);
      await api.patch('/api/stacks/media').send({ icon: 'plex', displayName: 'Media' }).expect(200);
    });
  });

  describe('PATCH /api/settings', () => {
    it.each([
      { columns: 0 },
      { columns: 7 },
      { layout: 'masonry' },
      { groupBy: 'owner' },
      { showStatus: 1 },
      { dashboardTitle: '' },
      { dashboardTitle: 'x'.repeat(101) },
      { theme: 'light' },
    ])('rejects %j', async (body) => {
      const s = await setup();
      await s.api.patch('/api/settings').send(body).expect(400);
      expect(s.settingsStore.get().columns).toBe(4);
    });
  });

  describe('GET /api/services', () => {
    it('validates includeHidden', async () => {
      const { api } = await setup();
      await api.get('/api/services?includeHidden=maybe').expect(400);
      await api.get('/api/services?includeHidden=false').expect(200);
    });
  });
});
