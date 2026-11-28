import Dialog from './Dialog';

const SHORTCUTS: Array<{ keys: string[]; action: string }> = [
  { keys: ['/'], action: 'Search' },
  { keys: ['Esc'], action: 'Clear the search, or close a dialog' },
  { keys: ['Enter'], action: 'Open the first result (in the search box) or the focused service' },
  { keys: ['←', '→', '↑', '↓'], action: 'Move between services' },
  { keys: ['Home', 'End'], action: 'First or last service' },
  { keys: ['e'], action: 'Edit the focused service (when editing is unlocked)' },
  { keys: ['?'], action: 'Show this overview' },
];

const KBD =
  'inline-flex min-w-7 justify-center px-1.5 py-0.5 rounded border border-surface-600 bg-surface-700 text-xs font-mono text-gray-200';

export default function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Keyboard shortcuts" onClose={onClose}>
      <dl className="space-y-2.5 text-sm">
        {SHORTCUTS.map(({ keys, action }) => (
          <div key={action} className="flex items-start gap-3">
            <dt className="flex gap-1 shrink-0 w-24 sm:w-36 flex-wrap">
              {keys.map((k) => (
                <kbd key={k} className={KBD}>
                  {k}
                </kbd>
              ))}
            </dt>
            <dd className="text-gray-300">{action}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-gray-500 mt-4">Shortcuts are ignored while you type in a field.</p>
    </Dialog>
  );
}
