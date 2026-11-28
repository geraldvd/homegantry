import type { Service } from '../types';
import { updateOverride } from '../api/client';
import { useAuth } from '../context/AuthContext';

const BUTTON =
  'flex items-center justify-center w-7 h-7 touch:w-11 touch:h-11 rounded-md bg-surface-700/80 text-gray-400 hover:text-gray-200 transition-colors';

/**
 * Edit and hide buttons of a card (edit rights only). Shown on hover or keyboard focus, and always
 * on touch screens, which have no hover.
 */
export default function ServiceActions({
  service,
  onEdit,
  className = '',
}: {
  service: Service;
  onEdit: (service: Service) => void;
  className?: string;
}) {
  const { canEdit } = useAuth();
  if (!canEdit) return null;

  return (
    <div
      className={`flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 touch:opacity-100 transition-opacity ${className}`}
    >
      <button
        type="button"
        onClick={() => onEdit(service)}
        className={BUTTON}
        aria-label={`Edit ${service.name}`}
        title="Edit service"
      >
        <svg
          aria-hidden="true"
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.06.56l-3.535.884.884-3.535a2 2 0 01.56-1.06z"
          />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => void updateOverride(service.id, { hidden: true })}
        className={BUTTON}
        aria-label={`Hide ${service.name}`}
        title="Hide service"
      >
        <svg
          aria-hidden="true"
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9.27-3.11-11-7.5a11.72 11.72 0 013.168-4.477M6.343 6.343A9.97 9.97 0 0112 5c5 0 9.27 3.11 11 7.5a11.7 11.7 0 01-4.168 4.477M6.343 6.343L3 3m3.343 3.343l2.829 2.829M17.657 17.657L21 21m-3.343-3.343l-2.829-2.829M9.878 9.879a3 3 0 104.243 4.242"
          />
        </svg>
      </button>
    </div>
  );
}
