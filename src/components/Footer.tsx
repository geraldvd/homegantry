import { useServices } from '../context/ServiceContext';

export default function Footer({ onShortcutsClick }: { onShortcutsClick: () => void }) {
  const { services, connected } = useServices();
  const dockerCount = services.filter((s) => s.source === 'docker').length;

  return (
    <footer className="border-t border-surface-600/40 bg-surface-900/80 backdrop-blur-sm">
      <div className="max-w-screen-2xl mx-auto px-4 py-1 flex flex-wrap items-center justify-between gap-x-4 text-xs text-gray-400">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}
            />
            {connected ? 'Connected' : 'Disconnected'}
          </span>
          <span>
            {dockerCount} container{dockerCount !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onShortcutsClick}
            aria-keyshortcuts="?"
            className="min-h-11 px-1 flex items-center gap-1.5 hover:text-gray-200 transition-colors"
          >
            Keyboard shortcuts
            <kbd
              aria-hidden="true"
              className="hidden sm:inline px-1 rounded border border-surface-600 font-mono text-[11px]"
            >
              ?
            </kbd>
          </button>
          <span className="hidden sm:inline">Powered by HomeGantry</span>
        </div>
      </div>
    </footer>
  );
}
