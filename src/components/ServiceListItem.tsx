import type { Service } from '../types';
import ServiceBadges from './ServiceBadges';
import ServiceIcon from './ServiceIcon';
import ServiceActions from './ServiceActions';
import { safeHref } from '../lib/url';

interface Props {
  service: Service;
  showStatus: boolean;
  onEdit: (service: Service) => void;
}

export default function ServiceListItem({ service, showStatus, onEdit }: Props) {
  // Only http(s) URLs become links (defence in depth, the server filters them too).
  const href = safeHref(service.url);
  const Root: React.ElementType = href ? 'a' : 'div';
  const linkProps = href ? { href, target: '_blank', rel: 'noopener noreferrer' } : { tabIndex: 0 };

  return (
    <div className="relative group flex items-center gap-1">
      <Root
        {...linkProps}
        data-card=""
        data-id={service.id}
        data-name={service.name}
        className={`glass-card flex-1 min-w-0 px-4 py-2.5 min-h-11 flex items-center gap-3 ${href ? 'cursor-pointer' : ''}`}
      >
        <ServiceIcon slug={service.icon} name={service.name} size={24} decorative />

        <span className="font-medium text-gray-100 truncate min-w-0">{service.name}</span>

        <ServiceBadges service={service} showStatus={showStatus} />

        <span className="hidden sm:inline text-xs text-gray-500 bg-surface-700 px-2 py-0.5 rounded-full ml-auto shrink-0">
          {service.category}
        </span>

        {href && (
          <svg
            aria-hidden="true"
            className="w-3.5 h-3.5 text-gray-500 shrink-0 ml-auto sm:ml-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        )}
      </Root>

      <ServiceActions service={service} onEdit={onEdit} className="shrink-0" />
    </div>
  );
}
