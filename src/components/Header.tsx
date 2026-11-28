import type { RefObject } from 'react';
import { useSettings } from '../context/ServiceContext';
import { readOnlyHint, useAuth } from '../context/AuthContext';

interface Props {
  search: string;
  searchRef: RefObject<HTMLInputElement>;
  onSearchChange: (q: string) => void;
  /** Enter in the search box: open the first result. */
  onSearchSubmit: () => void;
  /** ArrowDown in the search box: move to the first result. */
  onSearchDown: () => void;
  onAddClick: () => void;
  onSettingsClick: () => void;
  onUnlockClick: () => void;
}

/** 44 px touch targets on phones, the usual compact size from `sm` up. */
const BUTTON =
  'min-h-11 sm:min-h-0 px-3 py-2 rounded-lg text-sm transition-colors whitespace-nowrap flex items-center justify-center';

export default function Header({
  search,
  searchRef,
  onSearchChange,
  onSearchSubmit,
  onSearchDown,
  onAddClick,
  onSettingsClick,
  onUnlockClick,
}: Props) {
  const { settings } = useSettings();
  const auth = useAuth();

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onSearchChange('');
      e.currentTarget.blur();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onSearchSubmit();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      onSearchDown();
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-surface-900/90 backdrop-blur-md border-b border-surface-600/40">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:px-3 focus:py-2 focus:rounded-lg focus:bg-surface-700 focus:text-gray-100"
      >
        Skip to services
      </a>
      <div className="max-w-screen-2xl mx-auto px-4 py-2 sm:py-3 flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-2 sm:gap-4">
        <h1 className="text-xl font-bold text-gray-100 truncate min-w-0 flex-1 sm:flex-none sm:max-w-xs">
          {settings.dashboardTitle}
        </h1>

        <div
          role="search"
          className="order-last sm:order-none w-full sm:w-auto sm:flex-1 sm:max-w-md relative"
        >
          <svg
            aria-hidden="true"
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
            ref={searchRef}
            type="search"
            aria-label="Search services"
            aria-keyshortcuts="/"
            placeholder="Search services..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="off"
            spellCheck={false}
            className="w-full min-h-11 sm:min-h-0 pl-10 pr-10 py-2 rounded-lg bg-surface-700 border border-surface-600/60 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-colors text-base sm:text-sm"
          />
          <kbd
            aria-hidden="true"
            className="hidden sm:block absolute right-3 top-1/2 -translate-y-1/2 px-1.5 rounded border border-surface-600 text-[11px] text-gray-500 font-mono pointer-events-none"
          >
            /
          </kbd>
        </div>

        <div className="flex items-center gap-2 sm:ml-auto shrink-0">
          {!auth.canEdit && (
            <>
              <span
                title={readOnlyHint(auth)}
                className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-full border border-surface-600/60 text-xs text-gray-400 whitespace-nowrap"
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
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
                <span className="sr-only sm:not-sr-only">Read-only</span>
              </span>
              {auth.methods.token && (
                <button
                  type="button"
                  onClick={onUnlockClick}
                  className={`${BUTTON} text-gray-300 border border-surface-600/60 hover:bg-surface-700`}
                >
                  Unlock editing
                </button>
              )}
            </>
          )}
          {auth.canEdit && auth.method === 'token' && (
            <button
              type="button"
              onClick={() => void auth.lock()}
              title="Forget the admin token for this tab"
              className={`${BUTTON} text-gray-400 hover:text-gray-200 hover:bg-surface-700`}
            >
              Lock
            </button>
          )}
          {auth.canEdit && (
            <>
              <button
                type="button"
                onClick={onAddClick}
                aria-label="Add service"
                className={`${BUTTON} min-w-11 sm:px-4 bg-accent text-surface-900 font-semibold hover:bg-accent/90`}
              >
                <span aria-hidden="true" className="sm:hidden text-lg leading-none">
                  +
                </span>
                <span className="hidden sm:inline">+ Add Service</span>
              </button>
              <button
                type="button"
                onClick={onSettingsClick}
                className="min-w-11 min-h-11 sm:min-w-0 sm:min-h-0 p-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-surface-700 transition-colors flex items-center justify-center"
                aria-label="Settings"
              >
                <svg
                  aria-hidden="true"
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
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
            </>
          )}
        </div>
      </div>
    </header>
  );
}
