import { useMemo } from 'react';
import type { Service } from '../types';
import { useServices, useSettings, useStacks } from '../context/ServiceContext';
import { groupServices, type ServiceGroup } from '../lib/grouping';
import { searchServices } from '../lib/search';
import { useCollapsedGroups } from '../hooks/useCollapsedGroups';
import CategorySection from './CategorySection';

const CATEGORY_ICONS: Record<string, string> = {
  Media: 'plex',
  Monitoring: 'grafana',
  Networking: 'nginx',
  Storage: 'nextcloud',
  Development: 'gitea',
  Security: 'authelia',
  Automation: 'home-assistant',
  Downloads: 'qbittorrent',
  Productivity: 'bookstack',
  Communication: 'matrix',
  Gaming: 'steam',
  Analytics: 'plausible',
  Database: 'postgresql',
};

export interface DashboardView {
  query: string;
  /** Ranked matches while a query is active (one flat list, best first). */
  results: Service[];
  groups: ServiceGroup[];
  /** Services shown at all (not hidden, and running unless stopped ones are shown). */
  shownCount: number;
  /** Stopped containers that match the query but are not shown. */
  stoppedMatches: number;
}

function isShown(s: Service, showStopped: boolean): boolean {
  return !s.hidden && (showStopped || s.source !== 'docker' || s.status === 'running');
}

/** What the dashboard shows for a query; also used for "Enter opens the first result". */
export function useDashboardView(query: string): DashboardView {
  const { services } = useServices();
  const { settings } = useSettings();
  const { stacks } = useStacks();

  return useMemo(() => {
    const shown = services.filter((s) => isShown(s, settings.showStopped));
    const searching = query.trim() !== '';
    const results = searching ? searchServices(shown, query) : [];
    const stoppedMatches =
      searching && !settings.showStopped
        ? searchServices(
            services.filter((s) => !s.hidden && !isShown(s, false)),
            query,
          ).length
        : 0;
    return {
      query,
      results,
      groups: searching ? [] : groupServices(shown, settings.groupBy, stacks),
      shownCount: shown.length,
      stoppedMatches,
    };
  }, [services, settings.showStopped, settings.groupBy, stacks, query]);
}

interface Props {
  view: DashboardView;
  onEdit: (service: Service) => void;
}

function EmptyIcon() {
  return (
    <svg
      aria-hidden="true"
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
  );
}

export default function Dashboard({ view, onEdit }: Props) {
  const { connected } = useServices();
  const { settings } = useSettings();
  const { stacks } = useStacks();
  const { collapsed, toggle } = useCollapsedGroups();
  const searching = view.query.trim() !== '';

  const common = {
    showStatus: settings.showStatus,
    columns: settings.columns,
    layout: settings.layout,
    onEdit,
  };

  let content: React.ReactNode;
  if (searching && view.results.length === 0) {
    const stopped = view.stoppedMatches;
    content = (
      <div role="status" className="text-center text-gray-400 py-16 max-w-md mx-auto">
        <EmptyIcon />
        <p className="text-gray-300 font-medium mb-2 break-words">
          No services match &ldquo;{view.query.trim()}&rdquo;.
        </p>
        <p className="text-sm">
          Search looks at names, descriptions, categories, stacks and URL hosts. Hidden services are
          not searched.
        </p>
        {stopped > 0 && (
          <p className="text-sm mt-2">
            {stopped} stopped container{stopped === 1 ? ' matches' : 's match'}: turn on{' '}
            <em>Show Stopped Containers</em> in the settings to include stopped containers.
          </p>
        )}
      </div>
    );
  } else if (searching) {
    const n = view.results.length;
    content = (
      <>
        <CategorySection
          {...common}
          label={`Results for “${view.query.trim()}”`}
          plainLabel
          services={view.results}
        />
        <p role="status" className="sr-only">
          {n} result{n === 1 ? '' : 's'}
        </p>
      </>
    );
  } else if (view.shownCount === 0) {
    content = (
      <div className="text-center text-gray-400 py-20">
        <EmptyIcon />
        <p className="text-lg font-medium text-gray-300 mb-1">No services found</p>
        <p className="text-sm">
          {connected
            ? 'Docker is connected but no containers were discovered.'
            : 'Waiting for Docker connection...'}
        </p>
      </div>
    );
  } else {
    content = view.groups.map((group) => {
      const icon =
        settings.groupBy === 'stack'
          ? stacks[group.services[0]?.stack ?? '']?.icon
          : settings.groupBy === 'category'
            ? CATEGORY_ICONS[group.label]
            : undefined;
      const key = group.key;
      return (
        <CategorySection
          {...common}
          key={key}
          label={group.label}
          services={group.services}
          icon={icon}
          plainLabel={settings.groupBy === 'host'}
          collapsed={collapsed.has(key)}
          onToggle={() => toggle(key)}
        />
      );
    });
  }

  return (
    <main
      id="main"
      className="flex-1 max-w-screen-2xl mx-auto w-full px-4 py-4 sm:py-6 space-y-6 sm:space-y-8"
    >
      {content}
    </main>
  );
}
