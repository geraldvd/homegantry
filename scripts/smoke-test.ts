/**
 * Smoke test for a freshly built image: waits until `GET /api/health` answers `status: "ok"` and,
 * optionally, checks the reported version.
 *
 * CI: `node --experimental-strip-types scripts/smoke-test.ts http://127.0.0.1:3000 0.2.0`
 * (no npm install needed).
 */
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

export interface WaitOptions {
  /** Fail unless `/api/health` reports exactly this version. */
  expectedVersion?: string;
  timeoutMs?: number;
  intervalMs?: number;
}

export async function waitForHealth(
  baseUrl: string,
  { expectedVersion, timeoutMs = 60_000, intervalMs = 1000 }: WaitOptions = {},
): Promise<Record<string, unknown>> {
  const url = new URL('/api/health', baseUrl).href;
  const deadline = Date.now() + timeoutMs;
  let last = 'no answer';
  for (;;) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(Math.max(intervalMs, 1000)) });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok && body.status === 'ok') {
        if (expectedVersion !== undefined && body.version !== expectedVersion) {
          throw new VersionMismatch(
            `${url} reports version "${String(body.version)}", expected "${expectedVersion}"`,
          );
        }
        return body;
      }
      last = `HTTP ${res.status} ${JSON.stringify(body)}`;
    } catch (err) {
      if (err instanceof VersionMismatch) throw err;
      last = err instanceof Error ? err.message : String(err);
    }
    if (Date.now() >= deadline) {
      throw new Error(`${url} did not answer "ok" within ${timeoutMs / 1000} s (last: ${last})`);
    }
    await sleep(intervalMs);
  }
}

class VersionMismatch extends Error {}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [baseUrl = 'http://127.0.0.1:3000', expectedVersion] = process.argv.slice(2);
  waitForHealth(baseUrl, { expectedVersion }).then(
    (body) => console.log(`Smoke test passed: ${JSON.stringify(body)}`),
    (err: Error) => {
      console.log(`::error title=Smoke test failed::${err.message}`);
      process.exitCode = 1;
    },
  );
}
