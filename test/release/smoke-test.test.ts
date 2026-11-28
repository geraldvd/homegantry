import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { waitForHealth } from '../../scripts/smoke-test.js';

const servers: http.Server[] = [];

/** A local server whose `/api/health` answers with `responses` in turn (the last one repeats). */
async function serve(responses: Array<{ status: number; body: unknown }>): Promise<string> {
  let i = 0;
  const srv = http.createServer((req, res) => {
    const r = responses[Math.min(i++, responses.length - 1)]!;
    res.writeHead(req.url === '/api/health' ? r.status : 404, {
      'Content-Type': 'application/json',
    });
    res.end(JSON.stringify(r.body));
  });
  servers.push(srv);
  await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
}

afterEach(() => {
  for (const srv of servers.splice(0)) srv.close();
});

const fast = { timeoutMs: 1000, intervalMs: 20 };
const healthy = { status: 'ok', docker: 'disconnected', version: '0.2.0' };

describe('waitForHealth', () => {
  it('returns the health body once the server answers', async () => {
    const url = await serve([{ status: 200, body: healthy }]);
    await expect(waitForHealth(url, { ...fast, expectedVersion: '0.2.0' })).resolves.toEqual(
      healthy,
    );
  });

  it('keeps trying while the server is starting', async () => {
    const url = await serve([
      { status: 503, body: {} },
      { status: 500, body: {} },
      { status: 200, body: healthy },
    ]);
    await expect(waitForHealth(url, fast)).resolves.toEqual(healthy);
  });

  it('gives up when nothing listens', async () => {
    await expect(
      waitForHealth('http://127.0.0.1:1', { timeoutMs: 100, intervalMs: 20 }),
    ).rejects.toThrow(/did not answer .*last: /);
  });

  it('fails on a different version', async () => {
    const url = await serve([{ status: 200, body: healthy }]);
    await expect(waitForHealth(url, { ...fast, expectedVersion: '0.3.0' })).rejects.toThrow(
      /version "0.2.0", expected "0.3.0"/,
    );
  });

  it('fails when the status is not ok', async () => {
    const url = await serve([{ status: 200, body: { status: 'starting' } }]);
    await expect(waitForHealth(url, fast)).rejects.toThrow(/did not answer/);
  });

  it('gives up after the timeout', async () => {
    const url = await serve([{ status: 500, body: {} }]);
    await expect(waitForHealth(url, { timeoutMs: 100, intervalMs: 20 })).rejects.toThrow(
      /did not answer .* within 0\.1 s/,
    );
  });
});
