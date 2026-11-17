import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { vi } from 'vitest';
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

/** A fake Docker client: `listContainers` returns whatever `containers` holds at call time. */
export function fakeDocker(initial: Dockerode.ContainerInfo[] = []) {
  const state = { containers: initial };
  const listContainers = vi.fn(async () => state.containers);
  const getEvents = vi.fn(async () => new PassThrough());
  const client = { listContainers, getEvents } as unknown as DockerClient;
  return { client, state, listContainers, getEvents };
}
