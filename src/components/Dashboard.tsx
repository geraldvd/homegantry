import { useMemo } from 'react';
import type { Service } from '../types';
import { useServices, useSettings } from '../context/ServiceContext';
import CategorySection from './CategorySection';

interface Props {
  search: string;
  onEdit: (service: Service) => void;
}

export default function Dashboard({ search, onEdit }: Props) {
  const { services, connected } = useServices();
  const { settings } = useSettings();

  const filtered = useMemo(() => {
    let list = services.filter((s) => !s.hidden);
    if (!settings.showStopped) {
      list = list.filter((s) => s.source !== 'docker' || s.status === 'running');
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q),
      );
    }
    return list;
  }, [services, settings.showStopped, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, Service[]>();
    for (const s of filtered) {
      const cat = s.category || 'Uncategorized';
      const arr = map.get(cat);
      if (arr) arr.push(s);
      else map.set(cat, [s]);
    }
    const entries = [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
    for (const [, list] of entries) {
      list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    }
    return entries;
  }, [filtered]);

  if (filtered.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-gray-500 py-20">
          <svg
            className="w-16 h-16 mx-auto mb-4 text-surface-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
            />
          </svg>
          {search ? (
            <p>No services match &ldquo;{search}&rdquo;</p>
          ) : (
            <>
              <p className="text-lg font-medium text-gray-400 mb-1">No services found</p>
              <p className="text-sm">
                {connected
                  ? 'Docker is connected but no containers were discovered.'
                  : 'Waiting for Docker connection...'}
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <main className="flex-1 max-w-screen-2xl mx-auto w-full px-4 py-6 space-y-8">
      {grouped.map(([category, list]) => (
        <CategorySection
          key={category}
          category={category}
          services={list}
          showStatus={settings.showStatus}
          columns={settings.columns}
          onEdit={onEdit}
        />
      ))}
    </main>
  );
}
