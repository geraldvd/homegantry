import type { Service, ServiceHealth } from '../types';

export type StatusTone = 'up' | 'running' | 'down' | 'warning' | 'neutral';

export interface StatusView {
  label: string;
  tone: StatusTone;
  /** Tooltip text. */
  detail: string;
}

function lastChecked(checkedAt: string): string {
  const date = new Date(checkedAt);
  return Number.isNaN(date.getTime()) ? 'unknown' : date.toLocaleString();
}

function failure(health: ServiceHealth): string {
  if (health.reason === 'timeout') return 'timed out';
  if (health.reason === 'unreachable') return 'not reachable';
  return health.httpStatus ? `HTTP ${health.httpStatus}` : 'failed';
}

/**
 * #33: one status per card instead of a container dot next to a health badge.
 *
 * 1. A container that is not running is "Stopped" (it is not checked).
 * 2. Otherwise a health result decides: Up, Down, TLS error or Not checked. "Down" on a running
 *    container says so in the tooltip.
 * 3. A running container without a result (checks off or not yet run) is "Running".
 * 4. Traefik and manual services without a result show no status.
 */
export function serviceStatus(s: Service): StatusView | undefined {
  const container = s.source === 'docker';
  if (container && s.status !== 'running') {
    return { label: 'Stopped', tone: 'neutral', detail: 'The container is not running.' };
  }
  const h = s.health;
  if (h) {
    const when = `Last checked: ${lastChecked(h.checkedAt)}`;
    if (h.status === 'up') {
      const code = h.httpStatus ? `HTTP ${h.httpStatus}` : 'ok';
      return { label: 'Up', tone: 'up', detail: `Health check: ${code}. ${when}` };
    }
    if (h.status === 'down') {
      const lead = container
        ? 'The container is running, but the health check failed'
        : 'Health check failed';
      return { label: 'Down', tone: 'down', detail: `${lead}: ${failure(h)}. ${when}` };
    }
    if (h.reason === 'tls') {
      return {
        label: 'TLS error',
        tone: 'warning',
        detail: `Health check: the certificate could not be verified. ${when}`,
      };
    }
    return { label: 'Not checked', tone: 'neutral', detail: `Health check: no result. ${when}` };
  }
  if (container) {
    return {
      label: 'Running',
      tone: 'running',
      detail: s.healthcheckDisabled
        ? 'The container is running. Health checks are off for this service.'
        : 'The container is running. No health check result yet.',
    };
  }
  return undefined;
}
