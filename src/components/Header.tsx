import { useSettings } from '../context/ServiceContext';

interface Props {
  search: string;
  onSearchChange: (q: string) => void;
  onAddClick: () => void;
  onSettingsClick: () => void;
}

export default function Header({ search, onSearchChange, onAddClick, onSettingsClick }: Props) {
  const { settings } = useSettings();

  return (
    <header className="sticky top-0 z-30 bg-surface-900/90 backdrop-blur-md border-b border-surface-600/40">
      <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center gap-4">
        <h1 className="text-xl font-bold text-gray-100 whitespace-nowrap">
          {settings.dashboardTitle}
        </h1>

        <div className="flex-1 max-w-md relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search services..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-surface-700 border border-surface-600/60 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-colors text-sm"
          />
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={onAddClick}
            className="px-4 py-2 rounded-lg bg-accent text-surface-900 font-semibold text-sm hover:bg-accent/90 transition-colors"
          >
            + Add Service
          </button>
          <button
            onClick={onSettingsClick}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-surface-700 transition-colors"
            aria-label="Settings"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
