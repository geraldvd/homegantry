import type { ExposureLevel, Service } from '../types';
import { serviceStatus, type StatusTone } from '../lib/status';

const BADGE =
  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium leading-none whitespace-nowrap';

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

const TONE: Record<StatusTone, { badge: string; dot: string }> = {
  up: { badge: 'bg-emerald-500/15 text-emerald-300', dot: 'bg-emerald-400' },
  running: { badge: 'bg-surface-600/60 text-gray-300', dot: 'bg-emerald-400' },
  down: { badge: 'bg-red-500/15 text-red-300', dot: 'bg-red-400' },
  warning: { badge: 'bg-amber-500/15 text-amber-300', dot: 'bg-amber-400' },
  neutral: { badge: 'bg-gray-500/20 text-gray-300', dot: 'bg-gray-400' },
};

/** The card's one status (#33) and the exposure badge. */
export default function ServiceBadges({
  service,
  showStatus,
}: {
  service: Service;
  showStatus: boolean;
}) {
  const exposure = service.exposure ? EXPOSURE[service.exposure] : undefined;
  const status = showStatus ? serviceStatus(service) : undefined;
  if (!exposure && !status) return null;

  return (
    <span className="inline-flex flex-wrap items-center gap-1 min-w-0">
      {status && (
        <span className={`${BADGE} ${TONE[status.tone].badge}`} title={status.detail}>
          <span
            aria-hidden="true"
            className={`w-1.5 h-1.5 rounded-full ${TONE[status.tone].dot}`}
          />
          {status.label}
        </span>
      )}
      {exposure && (
        <span
          className={`${BADGE} ${exposure.className}`}
          title={`Exposure: ${exposure.meaning}. ${service.exposureSource ?? ''}`.trim()}
        >
          {exposure.label}
        </span>
      )}
    </span>
  );
}
