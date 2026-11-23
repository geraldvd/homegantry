/**
 * HTTP health checks: HEAD, falling back to GET, with a timeout and bounded concurrency.
 *
 * Any answer below 500 counts as up (a login page or 404 still means the service responds).
 * Redirects are not followed. Results carry a fixed reason, never a raw error message, because
 * those can contain addresses. Logged URLs have no userinfo or query string.
 */
import http from 'node:http';
import https from 'node:https';
import { config } from './config.js';
import type { ServiceHealth } from './types.js';
import { redactUrl, safeHttpUrl } from './urls.js';

export interface HealthTarget {
  id: string;
  url: string;
}

type OnChange = (id: string) => void;

const MIN_INTERVAL_SECONDS = 5;
const TLS_ERROR = /^(CERT_|UNABLE_TO_|DEPTH_ZERO|SELF_SIGNED|ERR_TLS|ERR_SSL|HOSTNAME_MISMATCH|EPROTO)/;

const results = new Map<string, ServiceHealth>();
let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

interface Probe {
  health: ServiceHealth;
  /** The connection was reset: some servers do this on HEAD. */
  reset?: boolean;
}

function probe(url: string, method: 'HEAD' | 'GET'): Promise<Probe> {
  const checkedAt = new Date().toISOString();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: Probe) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
      req.destroy();
    };

    const client = url.startsWith('https:') ? https : http;
    const req = client.request(url, {
      method,
      agent: false,
      headers: { 'User-Agent': 'HomeGantry-healthcheck', Accept: '*/*' },
      ...(url.startsWith('https:')
        ? { rejectUnauthorized: !config.healthcheckInsecureTls }
        : {}),
    });

    const timeout = setTimeout(
      () => finish({ health: { status: 'down', checkedAt, reason: 'timeout' } }),
      Math.max(config.healthcheckTimeout, 0.01) * 1000,
    );

    req.on('response', (res) => {
      const httpStatus = res.statusCode ?? 0;
      res.resume();
      finish({
        health:
          httpStatus < 500
            ? { status: 'up', checkedAt, httpStatus }
            : { status: 'down', checkedAt, reason: 'http', httpStatus },
      });
    });

    req.on('error', (err: NodeJS.ErrnoException) => {
      const code = err.code ?? '';
      if (TLS_ERROR.test(code)) {
        finish({ health: { status: 'unknown', checkedAt, reason: 'tls' } });
        return;
      }
      finish({
        health: { status: 'down', checkedAt, reason: 'unreachable' },
        reset: code === 'ECONNRESET',
      });
    });

    req.end();
  });
}

/** Check one URL. Never rejects; credentials in the URL are not sent. */
export async function checkUrl(url: string): Promise<ServiceHealth> {
  const safe = safeHttpUrl(url);
  if (!safe) return { status: 'unknown', checkedAt: new Date().toISOString() };
  const head = await probe(safe, 'HEAD');
  const status = head.health.httpStatus ?? 0;
  if (status === 405 || status >= 500 || head.reset) return (await probe(safe, 'GET')).health;
  return head.health;
}

export function getHealth(id: string): ServiceHealth | undefined {
  return results.get(id);
}

function sameResult(a: ServiceHealth | undefined, b: ServiceHealth): boolean {
  return a?.status === b.status && a.reason === b.reason && a.httpStatus === b.httpStatus;
}

async function checkTarget(target: HealthTarget, onChange?: OnChange): Promise<void> {
  const health = await checkUrl(target.url);
  const previous = results.get(target.id);
  results.set(target.id, health);
  if (sameResult(previous, health)) return;
  if (health.status !== 'up') {
    const detail = health.httpStatus ? `${health.reason} ${health.httpStatus}` : health.reason;
    console.warn(`[health] ${redactUrl(target.url)} is ${health.status} (${detail})`);
  }
  onChange?.(target.id);
}

/** Check all targets, a limited number at a time, and forget services no longer checked. */
export async function runHealthChecks(
  targets: readonly HealthTarget[],
  onChange?: OnChange,
): Promise<void> {
  const wanted = new Set(targets.map((t) => t.id));
  for (const id of [...results.keys()]) {
    if (!wanted.has(id)) {
      results.delete(id);
      onChange?.(id);
    }
  }

  let next = 0;
  const worker = async () => {
    while (next < targets.length) {
      const target = targets[next++]!;
      await checkTarget(target, onChange);
    }
  };
  const workers = Math.min(Math.max(1, Math.floor(config.healthcheckConcurrency)), targets.length);
  await Promise.all(Array.from({ length: workers }, worker));
}

/** Run now and then on the configured interval; a slow run is never overlapped. */
export function startHealthChecks(
  getTargets: () => readonly HealthTarget[] | Promise<readonly HealthTarget[]>,
  onChange: OnChange,
): void {
  stopHealthChecks();
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runHealthChecks(await getTargets(), onChange);
    } catch {
      // A failed run is retried on the next tick; the error may contain addresses.
      console.error('[health] check run failed');
    } finally {
      running = false;
    }
  };
  void tick();
  const seconds = Math.max(config.healthcheckInterval, MIN_INTERVAL_SECONDS);
  timer = setInterval(() => void tick(), seconds * 1000);
  timer.unref?.();
}

export function stopHealthChecks(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
