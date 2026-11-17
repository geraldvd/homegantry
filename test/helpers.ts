import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { expect, vi } from 'vitest';
import type Dockerode from 'dockerode';
import type { DockerClient } from '../server/docker.js';

export type Env = Record<string, string | undefined>;

const tempDirs: string[] = [];

/** Create an empty temp directory that is removed after the current test. */
export function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'homegantry-test-'));
  tempDirs.push(dir);
  return dir;
}

/** Remove every temp data directory created by `loadServer()` (called after each test in setup.ts). */
export function cleanupTempDirs(): void {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Load a fresh copy of the server modules with the given environment.
 * `config` and the JSON stores are read at import time, so every call resets the
 * module registry and points HOMEGANTRY_DATA_DIR at a new empty temp directory
 * (removed again after the test).
 */
export async function loadServer(env: Env = {}) {
  vi.resetModules();
  const dataDir = makeTempDir();
  vi.stubEnv('HOMEGANTRY_DATA_DIR', dataDir);
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);

  const config = await import('../server/config.js');
  const storage = await import('../server/storage.js');
  const matcher = await import('../server/matcher.js');
  const docker = await import('../server/docker.js');
  const app = await import('../server/app.js');
  return { dataDir, ...config, ...storage, ...matcher, ...docker, ...app };
}

/**
 * `loadServer()` + a fake Docker client with `containers`, one completed scan, and an app
 * serving a stub client directory.
 */
export async function loadApp(containers: Dockerode.ContainerInfo[], env: Env = {}) {
  const server = await loadServer({ HOMEGANTRY_HOST: '192.168.1.100', ...env });
  const clientDir = path.join(server.dataDir, 'client');
  fs.mkdirSync(clientDir);
  fs.writeFileSync(path.join(clientDir, 'index.html'), '<!doctype html><title>HomeGantry</title>');
  const fake = fakeDocker(containers);
  server.setDockerClient(fake.client);
  await server.fullScan();
  const app = server.createApp(clientDir);
  return { ...server, app, fake };
}

/**
 * Open `/api/events` on a real ephemeral port and collect the parsed SSE events.
 * Call `close()` when done (it also stops the server).
 */
export async function openSse(app: http.RequestListener) {
  const srv = http.createServer(app).listen(0);
  await new Promise((r) => srv.once('listening', r));
  const { port } = srv.address() as AddressInfo;
  const events: Array<{ type: string; data: unknown }> = [];
  const res = await new Promise<http.IncomingMessage>((resolve) =>
    http.get({ port, path: '/api/events' }, resolve),
  );
  let buf = '';
  res.setEncoding('utf8');
  res.on('data', (chunk: string) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      events.push(JSON.parse(buf.slice(0, idx).replace(/^data: /, '')));
      buf = buf.slice(idx + 2);
    }
  });
  const waitFor = (n: number) => vi.waitFor(() => expect(events.length).toBeGreaterThanOrEqual(n));
  const close = () => {
    res.destroy();
    srv.close();
  };
  return { res, events, waitFor, close };
}

/** A fake Docker client: `listContainers` returns whatever `containers` holds at call time. */
export function fakeDocker(initial: Dockerode.ContainerInfo[] = []) {
  const state = { containers: initial };
  const listContainers = vi.fn(async () => state.containers);
  const getEvents = vi.fn(async () => new PassThrough());
  const client = { listContainers, getEvents } as unknown as DockerClient;
  return { client, state, listContainers, getEvents };
}
