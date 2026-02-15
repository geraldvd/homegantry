import { useState } from 'react';
import type { Service } from '../types';
import ServiceIcon from './ServiceIcon';
import { updateOverride } from '../api/client';

function statusClass(status: string): string {
  switch (status) {
    case 'running':
      return 'status-dot-running';
    case 'stopped':
    case 'exited':
      return 'status-dot-stopped';
    default:
      return 'status-dot-other';
  }
}

interface Props {
  service: Service;
  showStatus: boolean;
  onEdit: (service: Service) => void;
}

export default function ServiceCard({ service, showStatus, onEdit }: Props) {
  const [hovering, setHovering] = useState(false);

  const handleHide = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    await updateOverride(service.id, { hidden: true });
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onEdit(service);
  };

  return (
    <a
      href={service.url}
      target="_blank"
      rel="noopener noreferrer"
      className="glass-card p-4 flex items-start gap-3 relative group cursor-pointer"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <ServiceIcon slug={service.icon} name={service.name} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-100 truncate">{service.name}</span>
          {showStatus && <span className={`status-dot ${statusClass(service.status)}`} />}
        </div>
        {service.description && (
          <p className="text-xs text-gray-400 mt-1 line-clamp-2">{service.description}</p>
        )}
      </div>

      {hovering && (
        <div className="absolute top-2 right-2 flex items-center gap-1">
          <button
            onClick={handleEdit}
            className="p-1.5 rounded-md bg-surface-700/80 text-gray-400 hover:text-gray-200 transition-colors"
            aria-label="Edit service"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.06.56l-3.535.884.884-3.535a2 2 0 01.56-1.06z"
              />
            </svg>
          </button>
          <button
            onClick={handleHide}
            className="p-1.5 rounded-md bg-surface-700/80 text-gray-400 hover:text-gray-200 transition-colors"
            aria-label="Hide service"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9.27-3.11-11-7.5a11.72 11.72 0 013.168-4.477M6.343 6.343A9.97 9.97 0 0112 5c5 0 9.27 3.11 11 7.5a11.7 11.7 0 01-4.168 4.477M6.343 6.343L3 3m3.343 3.343l2.829 2.829M17.657 17.657L21 21m-3.343-3.343l-2.829-2.829M9.878 9.879a3 3 0 104.243 4.242"
              />
            </svg>
          </button>
        </div>
      )}
    </a>
  );
}
