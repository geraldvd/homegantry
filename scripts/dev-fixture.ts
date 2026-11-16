/**
 * Development aid: run the HomeGantry backend against a fake Docker client that serves the
 * example lab from test/fixtures/containers.ts. No Docker socket is needed and nothing is
 * written to ./data (a temporary data directory is used).
 *
 * Not part of the shipped server: it lives outside server/ and is never built into dist/.
 *
 *   npm run dev:fixture   # backend on :3000
 *   npm run dev:client    # Vite on :5173 (proxies /api to :3000)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';

process.env.HOMEGANTRY_DATA_DIR ??= fs.mkdtempSync(path.join(os.tmpdir(), 'homegantry-fixture-'));
process.env.HOMEGANTRY_HOST ??= '192.168.1.100';

// Import after the environment is set: config and storage read it at import time.
const { config } = await import('../server/config.js');
const { createApp } = await import('../server/app.js');
const { setDockerClient, startWatching } = await import('../server/docker.js');
const { exampleLab } = await import('../test/fixtures/containers.js');

setDockerClient({
  listContainers: async () => exampleLab,
  getEvents: async () => new PassThrough(),
} as unknown as Parameters<typeof setDockerClient>[0]);

const app = createApp(path.resolve('dist/client'));
app.listen(config.port, () => {
  console.log(`[homegantry] fixture backend on http://localhost:${config.port}`);
  console.log(`[homegantry] data dir: ${config.dataDir}`);
  void startWatching();
});
