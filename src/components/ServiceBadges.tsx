import type { ExposureLevel, Service, ServiceHealth } from '../types';

const BADGE = 'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium leading-none';

const EXPOSURE: Record<ExposureLevel, { label: string; className: string; meaning: string }> = {
  public: {
    label: 'Public',
    className: 'bg-amber-500/15 text-amber-300',
    meaning: 'reachable without a login',
  },
  sso: {
    label: 'SSO',
    className: 'bg-sky-500/15 text-sky-300',
    meaning: 'behind a login',
  },
  private: {
    label: 'Private',
    className: 'bg-emerald-500/15 text-emerald-300',
    meaning: 'only reachable from allowed networks (e.g. LAN or VPN)',
  },
  unknown: {
    label: 'Unknown',
    className: 'bg-gray-500/20 text-gray-300',
    meaning: 'could not be determined',
  },
};

function lastChecked(checkedAt: string): string {
  const date = new Date(checkedAt);
  return Number.isNaN(date.getTime()) ? 'unknown' : date.toLocaleString();
}

function healthView(health: ServiceHealth): { label: string; className: string; detail: string } {
  const code = health.httpStatus ? `HTTP ${health.httpStatus}` : '';
  if (health.status === 'up') {
    return { label: 'Up', className: 'bg-emerald-500/15 text-emerald-300', detail: code || 'ok' };
  }
  if (health.status === 'down') {
    const detail =
      health.reason === 'timeout'
        ? 'timed out'
        : health.reason === 'unreachable'
          ? 'not reachable'
          : code || 'failed';
    return { label: 'Down', className: 'bg-red-500/15 text-red-300', detail };
  }
  if (health.reason === 'tls') {
    return {
      label: 'TLS error',
      className: 'bg-amber-500/15 text-amber-300',
      detail: 'the certificate could not be verified',
    };
  }
  return { label: 'Not checked', className: 'bg-gray-500/20 text-gray-300', detail: 'no result' };
}

export default function ServiceBadges({
  service,
  showStatus,
}: {
  service: Service;
  showStatus: boolean;
}) {
  const exposure = service.exposure ? EXPOSURE[service.exposure] : undefined;
  const health = showStatus && service.health ? healthView(service.health) : undefined;
  if (!exposure && !health) return null;

  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      {exposure && (
        <span
          className={`${BADGE} ${exposure.className}`}
          title={`Exposure: ${exposure.meaning}. ${service.exposureSource ?? ''}`.trim()}
        >
          {exposure.label}
        </span>
      )}
      {health && (
        <span
          className={`${BADGE} ${health.className}`}
          title={`Health check: ${health.detail}. Last checked: ${lastChecked(service.health!.checkedAt)}`}
        >
          {health.label}
        </span>
      )}
    </span>
  );
}
