import type { Service } from '../types';
import ServiceBadges from './ServiceBadges';
import ServiceIcon from './ServiceIcon';
import ServiceActions from './ServiceActions';
import { safeHref } from '../lib/url';
import { useAuth } from '../context/AuthContext';

interface Props {
  service: Service;
  showStatus: boolean;
  onEdit: (service: Service) => void;
}

/**
 * The whole card is one link (or one focusable box without a link), so it gets one focus ring and
 * arrow keys can move between cards. The edit buttons sit next to it, not inside the link.
 */
export default function ServiceCard({ service, showStatus, onEdit }: Props) {
  const { canEdit } = useAuth();
  // Only http(s) URLs become links (defence in depth, the server filters them too).
  const href = safeHref(service.url);
  const Root: React.ElementType = href ? 'a' : 'div';
  const linkProps = href ? { href, target: '_blank', rel: 'noopener noreferrer' } : { tabIndex: 0 };

  return (
    <div className="relative group h-full">
      <Root
        {...linkProps}
        data-card=""
        data-id={service.id}
        data-name={service.name}
        className={`glass-card p-4 flex items-start gap-3 h-full min-h-[4.5rem] ${href ? 'cursor-pointer' : ''}`}
      >
        <ServiceIcon slug={service.icon} name={service.name} decorative />

        <div className={`flex-1 min-w-0 ${canEdit ? 'pr-14 touch:pr-24' : ''}`}>
          <span className="block font-medium text-gray-100 truncate">{service.name}</span>
          {service.description && (
            <p className="text-xs text-gray-400 mt-1 line-clamp-2">{service.description}</p>
          )}
          <div className="mt-1.5 empty:hidden">
            <ServiceBadges service={service} showStatus={showStatus} />
          </div>
        </div>
      </Root>

      <ServiceActions service={service} onEdit={onEdit} className="absolute top-2 right-2" />
    </div>
  );
}
