import { useState } from 'react';
import type { Service } from '../types';
import ServiceCard from './ServiceCard';

interface Props {
  category: string;
  services: Service[];
  showStatus: boolean;
  columns: number;
  onEdit: (service: Service) => void;
}

export default function CategorySection({ category, services, showStatus, columns, onEdit }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const gridCols: Record<number, string> = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
    5: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
    6: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6',
  };

  return (
    <section>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 mb-3 group w-full text-left"
      >
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${collapsed ? '-rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
          {category}
        </h2>
        <span className="text-xs text-gray-500 bg-surface-700 px-2 py-0.5 rounded-full">
          {services.length}
        </span>
      </button>

      <div
        className={`overflow-hidden transition-all duration-300 ${collapsed ? 'max-h-0 opacity-0' : 'max-h-[2000px] opacity-100'}`}
      >
        <div className={`grid gap-3 ${gridCols[columns] ?? gridCols[4]}`}>
          {services.map((s) => (
            <ServiceCard key={s.id} service={s} showStatus={showStatus} onEdit={onEdit} />
          ))}
        </div>
      </div>
    </section>
  );
}
