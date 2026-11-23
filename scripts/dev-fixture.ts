/**
 * Development aid: run the HomeGantry backend against a fake Docker client and a fake Traefik API
 * that serve the example lab from test/fixtures/. Health checks hit a local fake server, so every
 * badge state is visible. No Docker socket is needed, nothing is written to ./data (a temporary
 * data directory is used) and no request leaves this machine, apart from the browser loading icons.
 *
 * Not part of the shipped server: it lives outside server/ and is never built into dist/.
 *
 * The backend serves the UI from dist/client, so either build the client first or run the
 * Vite dev server next to it:
 *
 *   npm run build:client && npm run dev:fixture   # everything on :3000
 *   npm run dev:fixture                           # backend on :3000 ...
 *   npm run dev:client                            # ... plus Vite on :5173 (proxies /api to :3000)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';

const { startFakeTraefik } = await import('../test/fixtures/traefik.js');
const traefik = await startFakeTraefik();

process.env.HOMEGANTRY_DATA_DIR ??= fs.mkdtempSync(path.join(os.tmpdir(), 'homegantry-fixture-'));
process.env.HOMEGANTRY_HOST ??= '192.168.1.100';
process.env.HOMEGANTRY_TRAEFIK_API_URL ??= traefik.url;
process.env.HOMEGANTRY_HEALTHCHECK_TIMEOUT ??= '1';

// Import after the environment is set: config and storage read it at import time.
const { config } = await import('../server/config.js');
const { createApp } = await import('../server/app.js');
const { dockerEvents, getServices, setDockerClient, startWatching } =
  await import('../server/docker.js');
const { runHealthChecks } = await import('../server/health.js');
const { exampleLab, knowledgeBaseExamples } = await import('../test/fixtures/containers.js');

// ---- fake backends for the health checks ----

function listen(server: http.Server | https.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
  });
}

/** `/status/<code>` answers with that code, `/hang` never answers. */
const handler: http.RequestListener = (req, res) => {
  const code = /^\/status\/(\d{3})$/.exec(req.url ?? '')?.[1];
  if (code) res.writeHead(Number(code)).end();
};

/** A throwaway self-signed server for the "TLS error" badge; skipped without openssl. */
async function startSelfSigned(): Promise<number | undefined> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'homegantry-fixture-tls-'));
  const keyFile = path.join(dir, 'key.pem');
  const certFile = path.join(dir, 'cert.pem');
  try {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        keyFile,
        '-out',
        certFile,
        '-days',
        '1',
        '-subj',
        '/CN=localhost',
      ],
      { stdio: 'ignore' },
    );
    const options = { key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) };
    return await listen(https.createServer(options, handler));
  } catch {
    return undefined;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const httpPort = await listen(http.createServer(handler));
const tlsPort = await startSelfSigned();
const local = (route: string) => `http://127.0.0.1:${httpPort}${route}`;

/** One example of every health state. Services not listed here are up. */
const healthExamples: Record<string, string> = {
  'id-radarr': local('/status/401'),
  'id-nextcloud': local('/status/503'),
  'id-prowlarr': local('/hang'),
  'traefik-nas-file': 'http://127.0.0.1:1/',
  ...(tlsPort ? { 'traefik-proxmox-file': `https://127.0.0.1:${tlsPort}/` } : {}),
};

async function checkFixtureHealth() {
  const targets = getServices()
    .filter((s) => !s.hidden)
    .map((s) => ({ id: s.id, url: healthExamples[s.id] ?? local('/status/200') }));
  await runHealthChecks(targets, (id) => {
    const svc = getServices().find((s) => s.id === id);
    if (svc) dockerEvents.emit('service_updated', svc);
  });
}

// ---- app ----

setDockerClient({
  listContainers: async () => [...exampleLab, ...knowledgeBaseExamples],
  getEvents: async () => new PassThrough(),
} as unknown as Parameters<typeof setDockerClient>[0]);

const app = createApp(path.resolve('dist/client'));
app.listen(config.port, () => {
  console.log(`[homegantry] fixture backend on http://localhost:${config.port}`);
  console.log(`[homegantry] data dir: ${config.dataDir}`);
  void startWatching().then(async () => {
    await checkFixtureHealth();
    setInterval(() => void checkFixtureHealth(), 30_000);
  });
});
