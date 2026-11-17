/**
 * Regression tests for mission principle 2 (#7): the API never exposes container env vars,
 * mounts, full label sets or secret-looking labels, even when Docker returns them.
 */
import type Dockerode from 'dockerode';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { container } from '../fixtures/containers.js';
import { loadApp, openSse } from '../helpers.js';

const SECRET_VALUES = [
  'change-me-env-password',
  'change-me-config-token',
  'change-me-widget-key',
  'change-me-label-secret',
  '/srv/secrets',
];

/** A container as a leaky Docker client might return it (inspect-style fields included). */
function leakyContainer(): Dockerode.ContainerInfo {
  const base = container({
    id: 'leaky',
    name: 'grafana',
    image: 'grafana/grafana-oss:11',
    project: 'monitoring',
    ports: [{ PrivatePort: 3000, PublicPort: 3000 }],
    labels: {
      'traefik.http.routers.grafana.rule': 'Host(`grafana.example.com`)',
      'homepage.widget.key': 'change-me-widget-key',
      'app.secret': 'change-me-label-secret',
    },
  });
  return {
    ...base,
    Env: ['GF_SECURITY_ADMIN_PASSWORD=change-me-env-password'],
    Config: { Env: ['TOKEN=change-me-config-token'], Labels: base.Labels },
    Mounts: [
      {
        Type: 'bind',
        Source: '/srv/secrets',
        Destination: '/secrets',
        Mode: 'ro',
        RW: false,
        Propagation: '',
      },
    ],
  } as unknown as Dockerode.ContainerInfo;
}

const FORBIDDEN_KEYS = ['Env', 'Config', 'Mounts', 'Labels', 'labels', 'HostConfig'];

function assertClean(body: unknown) {
  const json = JSON.stringify(body);
  for (const value of SECRET_VALUES) expect(json).not.toContain(value);
  for (const key of FORBIDDEN_KEYS) expect(json).not.toContain(`"${key}"`);
}

describe('no secrets in the API (#7)', () => {
  it('GET /api/services returns only allow-listed fields', async () => {
    const { app } = await loadApp([leakyContainer()]);
    const res = await request(app).get('/api/services?includeHidden=true').expect(200);
    assertClean(res.body);
    expect(res.body).toHaveLength(1);
    expect(Object.keys(res.body[0]).sort()).toEqual(
      [
        'category',
        'container',
        'description',
        'hidden',
        'icon',
        'id',
        'name',
        'sortOrder',
        'source',
        'stack',
        'status',
        'url',
      ].sort(),
    );
    expect(Object.keys(res.body[0].container).sort()).toEqual(
      ['compose_project', 'compose_service', 'image', 'name', 'ports', 'state'].sort(),
    );
    expect(res.body[0].url).toBe('https://grafana.example.com');
  });

  it('GET /api/stacks returns only allow-listed fields', async () => {
    const s = await loadApp([leakyContainer()]);
    s.stacksStore.set({ monitoring: { visible: true, injected: 'x' } as never });
    const res = await request(s.app).get('/api/stacks').expect(200);
    expect(res.body).toEqual({ monitoring: { visible: true } });
  });

  it('strips secret-looking labels before they are stored for re-matching', async () => {
    const s = await loadApp([leakyContainer()]);
    const svc = s.rematchService('leaky');
    expect(svc).toBeDefined();
    assertClean(svc);
  });

  it('SSE initial_state and service_updated carry the same sanitised data', async () => {
    const s = await loadApp([leakyContainer()]);
    const stream = await openSse(s.app);
    await stream.waitFor(1);
    assertClean(stream.events[0]);

    const rest = await request(s.app).get('/api/services');
    expect(stream.events[0]).toEqual({ type: 'initial_state', data: rest.body });

    // Even if something upstream emits an unsanitised object, the stream filters it.
    s.dockerEvents.emit('service_updated', {
      ...rest.body[0],
      Env: ['X=change-me-env-password'],
      container: { ...rest.body[0].container, Labels: { a: 'change-me-label-secret' } },
    });
    s.dockerEvents.emit('stacks_updated', { monitoring: { visible: true, Env: ['x'] } });
    s.dockerEvents.emit('settings_updated', {
      dashboardTitle: 'Lab',
      columns: 4,
      showStatus: true,
      layout: 'grid',
      showStopped: false,
      groupBy: 'category',
      Env: ['TOKEN=change-me-config-token'],
    });
    await stream.waitFor(4);
    expect(stream.events[1]).toEqual({ type: 'service_updated', data: rest.body[0] });
    expect(stream.events[2]).toEqual({
      type: 'stacks_updated',
      data: { monitoring: { visible: true } },
    });
    for (const e of stream.events) assertClean(e);
    stream.close();
  });
});
