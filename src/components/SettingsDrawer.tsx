import { useState, useEffect, useId, useRef } from 'react';
import { useSettings, useStacks } from '../context/ServiceContext';
import { updateSettings, updateStack } from '../api/client';
import type { DashboardSettings, StackConfig } from '../types';
import { useFocusTrap } from '../hooks/useFocusTrap';
import KbCoverageSection from './KbCoverageSection';
import ServiceIcon from './ServiceIcon';

interface Props {
  open: boolean;
  onClose: () => void;
}

const GROUP_BY: Array<{ value: DashboardSettings['groupBy']; label: string }> = [
  { value: 'category', label: 'Category' },
  { value: 'stack', label: 'Stack' },
  { value: 'host', label: 'Host' },
];

const LAYOUTS: Array<{ value: DashboardSettings['layout']; label: string }> = [
  { value: 'grid', label: 'Grid' },
  { value: 'list', label: 'List' },
];

/** Only rendered while open, so its controls are never reachable with Tab when closed. */
export default function SettingsDrawer({ open, onClose }: Props) {
  if (!open) return null;
  return <DrawerPanel onClose={onClose} />;
}

function DrawerPanel({ onClose }: { onClose: () => void }) {
  const { settings, dispatch } = useSettings();
  const { stacks } = useStacks();
  const [local, setLocal] = useState<DashboardSettings>(settings);
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(ref, onClose);

  useEffect(() => {
    setLocal(settings);
  }, [settings]);

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

  const handleStackUpdate = async (name: string, patch: Partial<StackConfig>) => {
    try {
      await updateStack(name, patch);
    } catch {
      // ignore
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="fixed top-0 right-0 z-50 h-full w-full sm:w-80 bg-surface-800 sm:border-l border-surface-600/40 shadow-2xl focus:outline-none"
      >
        <div className="p-5 h-full overflow-y-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 id={titleId} className="text-lg font-semibold text-gray-100">
              Settings
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="w-11 h-11 -mr-2 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-200 hover:bg-surface-700 transition-colors"
              aria-label="Close settings"
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
                  d="M6 18L18 6M6 6l12 12"
                />
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
                    void save({ dashboardTitle: local.dashboardTitle });
                  }
                }}
                className="w-full min-h-11 px-3 py-2 rounded-lg bg-surface-700 border border-surface-600/60 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-colors text-base sm:text-sm"
              />
            </label>

            <label className="block">
              <span className="text-sm text-gray-400 mb-1 block">Columns ({local.columns})</span>
              <input
                type="range"
                min={1}
                max={6}
                value={local.columns}
                onChange={(e) => void save({ columns: Number(e.target.value) })}
                className="w-full accent-accent"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1" aria-hidden="true">
                <span>1</span>
                <span>6</span>
              </div>
            </label>

            <Toggle
              label="Show Status"
              checked={local.showStatus}
              onChange={(v) => void save({ showStatus: v })}
            />

            <Toggle
              label="Show Stopped Containers"
              checked={local.showStopped}
              onChange={(v) => void save({ showStopped: v })}
            />

            <Choice
              label="Layout"
              options={LAYOUTS}
              value={local.layout}
              onChange={(layout) => void save({ layout })}
            />

            <Choice
              label="Group by"
              options={GROUP_BY}
              value={local.groupBy}
              onChange={(groupBy) => void save({ groupBy })}
            />

            <KbCoverageSection open />

            {/* Stacks section */}
            {Object.keys(stacks).length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wider">
                  Stacks
                </h3>
                <div className="space-y-3">
                  {Object.entries(stacks).map(([name, cfg]) => (
                    <StackRow
                      key={name}
                      name={name}
                      config={cfg}
                      onUpdate={(patch) => void handleStackUpdate(name, patch)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/** A set of mutually exclusive buttons (aria-pressed), e.g. the grouping. */
function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  const labelId = useId();
  return (
    <div>
      <span id={labelId} className="text-sm text-gray-400 mb-2 block">
        {label}
      </span>
      <div role="group" aria-labelledby={labelId} className="flex gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={`flex-1 min-h-11 px-3 py-2 text-sm rounded-lg border transition-colors ${
              value === o.value
                ? 'bg-accent/10 border-accent text-accent'
                : 'bg-surface-700 border-surface-600/60 text-gray-400 hover:text-gray-200'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function StackRow({
  name,
  config,
  onUpdate,
}: {
  name: string;
  config: StackConfig;
  onUpdate: (patch: Partial<StackConfig>) => void;
}) {
  const [displayName, setDisplayName] = useState(config.displayName ?? '');
  const [iconSlug, setIconSlug] = useState(config.icon ?? '');

  return (
    <div className="bg-surface-700/50 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {iconSlug && <ServiceIcon slug={iconSlug} name={name} size={18} decorative />}
          <span className="text-sm text-gray-200 font-medium truncate">{name}</span>
        </div>
        <Toggle
          label={`Show stack ${name}`}
          hideLabel
          checked={config.visible}
          onChange={(v) => onUpdate({ visible: v })}
        />
      </div>
      <input
        type="text"
        value={displayName}
        aria-label={`Display name for stack ${name}`}
        onChange={(e) => setDisplayName(e.target.value)}
        onBlur={() => {
          if (displayName !== (config.displayName ?? '')) {
            onUpdate({ displayName: displayName || undefined });
          }
        }}
        placeholder="Display name"
        className="w-full min-h-11 px-2 py-1 rounded bg-surface-700 border border-surface-600/60 text-gray-200 placeholder-gray-500 text-base sm:text-xs focus:outline-none focus:border-accent/50"
      />
      <input
        type="text"
        value={iconSlug}
        aria-label={`Icon slug for stack ${name}`}
        onChange={(e) => setIconSlug(e.target.value)}
        onBlur={() => {
          if (iconSlug !== (config.icon ?? '')) {
            onUpdate({ icon: iconSlug || undefined });
          }
        }}
        placeholder="Icon slug"
        className="w-full min-h-11 px-2 py-1 rounded bg-surface-700 border border-surface-600/60 text-gray-200 placeholder-gray-500 text-base sm:text-xs focus:outline-none focus:border-accent/50"
      />
    </div>
  );
}

function Toggle({
  label,
  hideLabel = false,
  checked,
  onChange,
}: {
  label: string;
  hideLabel?: boolean;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 min-h-11 cursor-pointer">
      <span className={hideLabel ? 'sr-only' : 'text-sm text-gray-400'}>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 w-10 h-5 rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-surface-600'
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-5' : ''
          }`}
        />
      </button>
    </label>
  );
}
