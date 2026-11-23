import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { container } from '../fixtures/containers.js';
import { loadApp, openSse } from '../helpers.js';

const TOKEN = 'change-me-0123456789abcdefghij';

const lab = [
  container({ id: 'c1', name: 'jellyfin', image: 'jellyfin/jellyfin', project: 'media' }),
  container({ id: 'c2', name: 'grafana', image: 'grafana/grafana', project: 'monitoring' }),
];

async function setup() {
  const s = await loadApp(lab, { HOMEGANTRY_ADMIN_TOKEN: TOKEN });
  const api = request.agent(s.app).set('Authorization', `Bearer ${TOKEN}`);
  const stream = await openSse(s.app);
  await stream.waitFor(1);
  return { ...s, api, stream };
}

const ofType = (events: Array<{ type: string; data: unknown }>, type: string) =>
  events.filter((e) => e.type === type).map((e) => e.data as { id: string; name?: string });

describe('SSE visibility filter (#19)', () => {
  it('tells clients to drop a service that becomes hidden, without sending its data', async () => {
    const s = await setup();
    await s.api.put('/api/services/c1/override').send({ hidden: true, displayName: 'Secret name' });
    await s.stream.waitFor(2);
    expect(s.stream.events[1]).toEqual({ type: 'service_removed', data: { id: 'c1' } });
    expect(JSON.stringify(s.stream.events)).not.toContain('Secret name');
    s.stream.close();
  });

  it('sends nothing for further updates to a hidden service', async () => {
    const s = await setup();
    await s.api.put('/api/services/c1/override').send({ hidden: true });
    await s.stream.waitFor(2);
    await s.api.put('/api/services/c1/override').send({ displayName: 'Still hidden' });
    await s.api.put('/api/services/c2/override').send({ displayName: 'Marker' });
    await s.stream.waitFor(3);
    expect(s.stream.events).toHaveLength(3);
    expect(s.stream.events[2]).toMatchObject({ type: 'service_updated', data: { id: 'c2' } });
    s.stream.close();
  });

  it('sends the service again when it is un-hidden', async () => {
    const s = await setup();
    await s.api.put('/api/services/c1/override').send({ hidden: true });
    await s.stream.waitFor(2);
    await s.api.put('/api/services/c1/override').send({ hidden: false });
    await s.stream.waitFor(3);
    expect(s.stream.events[2]).toMatchObject({ type: 'service_updated', data: { id: 'c1' } });
    s.stream.close();
  });

  it('does not send updates for services in an invisible stack', async () => {
    const s = await setup();
    s.stacksStore.set({ media: { visible: false } });
    s.dockerEvents.emit('service_updated', s.getServices().find((x) => x.id === 'c1'));
    s.dockerEvents.emit(
      'service_updated',
      s.getServices().find((x) => x.id === 'c2'),
    );
    await s.stream.waitFor(3);
    expect(s.stream.events[1]).toEqual({ type: 'service_removed', data: { id: 'c1' } });
    expect(s.stream.events[2]).toMatchObject({ type: 'service_updated', data: { id: 'c2' } });
    s.stream.close();
  });

  it('removes and restores services when a stack is toggled', async () => {
    const s = await setup();
    await s.api.patch('/api/stacks/media').send({ visible: false }).expect(200);
    await s.stream.waitFor(3);
    expect(ofType(s.stream.events, 'service_removed')).toEqual([{ id: 'c1' }]);

    await s.api.patch('/api/stacks/media').send({ visible: true }).expect(200);
    await s.stream.waitFor(5);
    expect(ofType(s.stream.events, 'service_updated').map((x) => x.id)).toEqual(['c1']);
    s.stream.close();
  });

  it('never announces a hidden service that appears during a scan', async () => {
    const s = await setup();
    s.overridesStore.set({ c3: { hidden: true } });
    s.fake.state.containers = [
      ...lab,
      container({ id: 'c3', name: 'hidden-app', image: 'example/app:1', project: 'media' }),
      container({ id: 'c4', name: 'visible-app', image: 'example/app:1', project: 'media' }),
    ];
    await s.fullScan();
    await s.stream.waitFor(2);
    expect(ofType(s.stream.events, 'service_updated').map((x) => x.id)).toEqual(['c4']);
    expect(JSON.stringify(s.stream.events)).not.toContain('hidden-app');
    s.stream.close();
  });
});
