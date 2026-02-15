import { useState, useEffect } from 'react';
import { useSettings } from '../context/ServiceContext';
import { updateSettings } from '../api/client';
import type { DashboardSettings } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SettingsDrawer({ open, onClose }: Props) {
  const { settings, dispatch } = useSettings();
  const [local, setLocal] = useState<DashboardSettings>(settings);

  useEffect(() => {
    if (open) setLocal(settings);
  }, [open, settings]);

  const save = async (patch: Partial<DashboardSettings>) => {
    const next = { ...local, ...patch };
    setLocal(next);
    try {
      const updated = await updateSettings(patch);
      dispatch({ type: 'SET_SETTINGS', payload: updated });
    } catch {
      // revert on error
      setLocal(settings);
    }
  };

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      )}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-80 bg-surface-800 border-l border-surface-600/40 shadow-2xl transform transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="p-5 h-full overflow-y-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-100">Settings</h2>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-surface-700 transition-colors"
              aria-label="Close settings"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-5">
            <label className="block">
              <span className="text-sm text-gray-400 mb-1 block">Dashboard Title</span>
              <input
                type="text"
                value={local.dashboardTitle}
                onChange={(e) => setLocal({ ...local, dashboardTitle: e.target.value })}
                onBlur={() => {
                  if (local.dashboardTitle !== settings.dashboardTitle) {
                    save({ dashboardTitle: local.dashboardTitle });
                  }
                }}
                className="w-full px-3 py-2 rounded-lg bg-surface-700 border border-surface-600/60 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-colors text-sm"
              />
            </label>

            <label className="block">
              <span className="text-sm text-gray-400 mb-1 block">Columns ({local.columns})</span>
              <input
                type="range"
                min={1}
                max={6}
                value={local.columns}
                onChange={(e) => save({ columns: Number(e.target.value) })}
                className="w-full accent-accent"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>1</span>
                <span>6</span>
              </div>
            </label>

            <Toggle
              label="Show Status"
              checked={local.showStatus}
              onChange={(v) => save({ showStatus: v })}
            />

            <Toggle
              label="Show Stopped Containers"
              checked={local.showStopped}
              onChange={(v) => save({ showStopped: v })}
            />

            <div>
              <span className="text-sm text-gray-400 mb-2 block">Layout</span>
              <div className="flex gap-2">
                {(['grid', 'list'] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => save({ layout: l })}
                    className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors capitalize ${
                      local.layout === l
                        ? 'bg-accent/10 border-accent text-accent'
                        : 'bg-surface-700 border-surface-600/60 text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-sm text-gray-400">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-surface-600'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-5' : ''
          }`}
        />
      </button>
    </label>
  );
}
