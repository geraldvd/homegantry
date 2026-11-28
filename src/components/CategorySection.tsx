import { useId } from 'react';
import type { Service } from '../types';
import ServiceCard from './ServiceCard';
import ServiceListItem from './ServiceListItem';
import ServiceIcon from './ServiceIcon';

interface Props {
  /** Group name shown in the heading. */
  label: string;
  services: Service[];
  showStatus: boolean;
  columns: number;
  layout?: 'grid' | 'list';
  icon?: string;
  onEdit: (service: Service) => void;
  /** Collapsible groups only; search results are always open. */
  collapsed?: boolean;
  onToggle?: () => void;
}

const GRID_COLS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  5: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
  6: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6',
};

/** One group of services: a labelled region with a heading (a toggle when collapsible) and a list. */
export default function CategorySection({
  label,
  services,
  showStatus,
  columns,
  layout = 'grid',
  icon,
  onEdit,
  collapsed = false,
  onToggle,
}: Props) {
  const headingId = useId();
  const listId = useId();

  const title = (
    <>
      {icon && <ServiceIcon slug={icon} name={label} size={20} decorative />}
      <span className="text-sm font-semibold text-gray-300 uppercase tracking-wider truncate">
        {label}
      </span>{' '}
      <span
        className="text-xs text-gray-400 bg-surface-700 px-2 py-0.5 rounded-full"
        title={`${services.length} service${services.length === 1 ? '' : 's'}`}
      >
        {services.length}
      </span>
    </>
  );

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="mb-3">
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!collapsed}
            aria-controls={collapsed ? undefined : listId}
            className="flex items-center gap-2 w-full min-h-11 text-left rounded-lg -mx-1 px-1"
          >
            <svg
              aria-hidden="true"
              className={`w-4 h-4 shrink-0 text-gray-500 transition-transform ${collapsed ? '-rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
            {title}
          </button>
        ) : (
          <span className="flex items-center gap-2 min-h-11">{title}</span>
        )}
      </h2>

      {/* Not rendered while collapsed, so Tab and the arrow keys skip it. */}
      {!collapsed && (
        <ul
          id={listId}
          role="list"
          className={
            layout === 'list'
              ? 'flex flex-col gap-1.5'
              : `grid gap-3 ${GRID_COLS[columns] ?? GRID_COLS[4]}`
          }
        >
          {services.map((s) => (
            <li key={s.id} className="min-w-0">
              {layout === 'list' ? (
                <ServiceListItem service={s} showStatus={showStatus} onEdit={onEdit} />
              ) : (
                <ServiceCard service={s} showStatus={showStatus} onEdit={onEdit} />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
