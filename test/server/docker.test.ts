import { describe, expect, it, vi } from 'vitest';
import { container } from '../fixtures/containers.js';
import { fakeDocker, loadServer, type Env } from '../helpers.js';

async function setup(
  env: Env = {},
  containers = [container({ name: 'jellyfin', image: 'jellyfin/jellyfin' })],
) {
  const server = await loadServer(env);
  const fake = fakeDocker(containers);
  server.setDockerClient(fake.client);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  return { ...server, fake };
}

describe('docker scanning', () => {
  it('lists only running containers by default', async () => {
    const s = await setup();
    await s.fullScan();
    expect(s.fake.listContainers).toHaveBeenCalledWith({
      all: false,
      filters: { status: ['running'] },
    });
  });

  it('lists all containers when HOMEGANTRY_SHOW_STOPPED=true', async () => {
    const s = await setup({ HOMEGANTRY_SHOW_STOPPED: 'true' });
    await s.fullScan();
    expect(s.fake.listContainers).toHaveBeenCalledWith({ all: true, filters: undefined });
  });

  it('converts containers into matched services and marks Docker connected', async () => {
    const s = await setup({}, [
      container({
        id: 'c1',
        name: 'jellyfin',
        image: 'jellyfin/jellyfin',
        project: 'media',
        ports: [{ PrivatePort: 8096, PublicPort: 8096 }, { PrivatePort: 1900 }],
      }),
    ]);
    expect(s.isConnected()).toBe(false);
    await s.fullScan();
    expect(s.isConnected()).toBe(true);
    const [svc] = s.getServices();
    expect(svc).toMatchObject({
      id: 'c1',
      name: 'Jellyfin',
      stack: 'media',
      url: 'http://localhost:8096',
    });
    // Ports without a public mapping are dropped.
    expect(svc!.container!.ports).toEqual([{ private: 8096, public: 8096 }]);
    expect(svc!.container!.name).toBe('jellyfin');
  });

  it('excludes itself (homegantry image or homegantry.exclude label) by default', async () => {
    const s = await setup({}, [
      container({ name: 'hg', image: 'ghcr.io/example/homegantry:latest' }),
      container({ name: 'skip', image: 'example/x', labels: { 'homegantry.exclude': 'true' } }),
      container({ name: 'keep', image: 'example/y' }),
    ]);
    await s.fullScan();
    expect(s.getServices().map((x) => x.name)).toEqual(['keep']);
  });

  it('keeps itself when HOMEGANTRY_EXCLUDE_SELF=false', async () => {
    const s = await setup({ HOMEGANTRY_EXCLUDE_SELF: 'false' }, [
      container({ name: 'hg', image: 'ghcr.io/example/homegantry:latest' }),
    ]);
    await s.fullScan();
    expect(s.getServices()).toHaveLength(1);
  });

  it('skips non-Compose containers by default, keeps them with HOMEGANTRY_COMPOSE_ONLY=false', async () => {
    const containers = [container({ name: 'loose', image: 'example/x', project: null })];
    const a = await setup({}, containers);
    await a.fullScan();
    expect(a.getServices()).toHaveLength(0);

    const b = await setup({ HOMEGANTRY_COMPOSE_ONLY: 'false' }, containers);
    await b.fullScan();
    expect(b.getServices()).toHaveLength(1);
  });

  it('emits service_updated for new/changed and service_removed for gone containers', async () => {
    const a = container({ id: 'a', name: 'jellyfin', image: 'jellyfin/jellyfin' });
    const b = container({ id: 'b', name: 'grafana', image: 'grafana/grafana' });
    const s = await setup({}, [a, b]);
    const updated: string[] = [];
    const removed: string[] = [];
    s.dockerEvents.on('service_updated', (svc: { id: string }) => updated.push(svc.id));
    s.dockerEvents.on('service_removed', (d: { id: string }) => removed.push(d.id));

    await s.fullScan();
    expect(updated).toEqual(['a', 'b']);

    // Unchanged state: no events.
    updated.length = 0;
    await s.fullScan();
    expect(updated).toEqual([]);

    // b disappears, a changes state.
    s.fake.state.containers = [{ ...a, State: 'exited' }];
    await s.fullScan();
    expect(removed).toEqual(['b']);
    expect(updated).toEqual(['a']);
  });

  it('marks Docker disconnected and keeps the previous services when a scan fails', async () => {
    const s = await setup();
    await s.fullScan();
    s.fake.listContainers.mockRejectedValueOnce(new Error('socket gone'));
    await s.fullScan();
    expect(s.isConnected()).toBe(false);
    expect(s.getServices()).toHaveLength(1);
    expect(console.error).toHaveBeenCalledWith('[docker] scan failed:', 'socket gone');
  });

  it('returns sorted unique stack names', async () => {
    const s = await setup({}, [
      container({ name: 'a', image: 'x/a', project: 'zeta' }),
      container({ name: 'b', image: 'x/b', project: 'alpha' }),
      container({ name: 'c', image: 'x/c', project: 'zeta' }),
    ]);
    await s.fullScan();
    expect(s.getDiscoveredStacks()).toEqual(['alpha', 'zeta']);
  });

  it('rematchService picks up new overrides for a known container and ignores unknown ids', async () => {
    const s = await setup({}, [
      container({ id: 'c1', name: 'jellyfin', image: 'jellyfin/jellyfin' }),
    ]);
    await s.fullScan();
    s.overridesStore.set({ c1: { displayName: 'Movies' } });
    expect(s.rematchService('c1')?.name).toBe('Movies');
    expect(s.getServices()[0]!.name).toBe('Movies');
    expect(s.rematchService('unknown')).toBeUndefined();
  });

  it('startWatching scans, subscribes to container events and rescans on events', async () => {
    vi.useFakeTimers();
    try {
      const s = await setup({ HOMEGANTRY_POLL_INTERVAL: '5' });
      await s.startWatching();
      expect(s.fake.listContainers).toHaveBeenCalledTimes(1);
      expect(s.fake.getEvents).toHaveBeenCalledWith({
        filters: {
          type: ['container'],
          event: ['start', 'stop', 'die', 'destroy', 'rename', 'health_status'],
        },
      });
      const stream = (await s.fake.getEvents.mock.results[0]!.value) as NodeJS.WritableStream;
      stream.write('{}');
      await vi.advanceTimersByTimeAsync(0);
      expect(s.fake.listContainers).toHaveBeenCalledTimes(2);

      // Periodic reconciliation.
      await vi.advanceTimersByTimeAsync(5000);
      expect(s.fake.listContainers).toHaveBeenCalledTimes(3);
      s.stopWatching();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(s.fake.listContainers).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reconnects to the event stream with backoff after an error', async () => {
    vi.useFakeTimers();
    try {
      const s = await setup();
      s.fake.getEvents.mockRejectedValueOnce(new Error('refused'));
      await s.startWatching();
      expect(s.isConnected()).toBe(false);
      await vi.advanceTimersByTimeAsync(1000);
      expect(s.fake.getEvents).toHaveBeenCalledTimes(2);
      expect(s.isConnected()).toBe(true);
      s.stopWatching();
    } finally {
      vi.useRealTimers();
    }
  });
});
