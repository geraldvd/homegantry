import { useState, useId } from 'react';
import Dialog from './Dialog';
import CategoryCombobox from './CategoryCombobox';
import type { Service } from '../types';
import {
  updateOverride,
  deleteOverride,
  updateManualService,
  deleteManualService,
} from '../api/client';
import { normaliseUrlInput } from '../lib/url';
import { cancelCardRemoval, expectCardRemoval } from '../lib/focus';

const SOURCE_LABEL: Record<Service['source'], string> = {
  docker: 'Docker',
  traefik: 'Traefik',
  manual: 'Manual',
};

interface Props {
  service: Service | null;
  onClose: () => void;
}

/**
 * The override value for a text field: `undefined` when unchanged (nothing is stored), `null` when
 * cleared (back to the auto-detected value, #31), otherwise the new value.
 */
export function overrideField(input: string, current: string): string | null | undefined {
  const value = input.trim();
  if (value === current.trim()) return undefined;
  return value === '' ? null : value;
}

export default function EditServiceModal({ service, onClose }: Props) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [icon, setIcon] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [hidden, setHidden] = useState(false);
  const [healthcheck, setHealthcheck] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Sync form when service changes
  const [prevId, setPrevId] = useState<string | null>(null);
  if (service && service.id !== prevId) {
    setPrevId(service.id);
    setName(service.name);
    setUrl(service.url);
    setIcon(service.icon);
    setCategory(service.category);
    setDescription(service.description);
    setHidden(service.hidden);
    setHealthcheck(!service.healthcheckDisabled);
    setError('');
  }
  if (!service && prevId !== null) setPrevId(null);

  if (!service) return null;

  // Discovered services (Docker, Traefik) are edited through overrides.
  const isDiscovered = service.source !== 'manual';
  // #32: only sent when changed, so a label keeps deciding until the user picks a side.
  const healthcheckChange = healthcheck === !service.healthcheckDisabled ? undefined : healthcheck;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const urlInput = url.trim();
    // #31: an empty URL resets a discovered service to the auto-detected URL (`null`); an
    // unchanged one is not sent, so it does not become an override. "#" means no link.
    let urlField: string | null | undefined;
    if (isDiscovered && urlInput === '') urlField = null;
    else if (urlInput === service.url) urlField = undefined;
    else {
      const checked = normaliseUrlInput(url, { allowNone: isDiscovered });
      if (checked.error !== undefined) {
        setError(checked.error);
        return;
      }
      urlField = checked.url;
    }
    setSaving(true);
    setError('');
    try {
      if (isDiscovered) {
        // Only what changed is sent, so unchanged fields do not become overrides.
        const patch = {
          displayName: overrideField(name, service.name),
          url: urlField,
          icon: overrideField(icon, service.icon),
          category: overrideField(category, service.category),
          description: overrideField(description, service.description),
          hidden: hidden === service.hidden ? undefined : hidden,
          healthcheck: healthcheckChange,
        };
        if (Object.values(patch).some((v) => v !== undefined)) {
          // Hiding removes the card: keep keyboard focus on the page.
          if (patch.hidden === true) expectCardRemoval(service.id);
          try {
            await updateOverride(service.id, patch);
          } catch (err) {
            cancelCardRemoval(service.id);
            throw err;
          }
        }
      } else {
        await updateManualService(service.id, {
          displayName: name.trim(),
          url: urlField ?? undefined,
          // Unchanged stays unsent: with icons off the API hides a stored icon URL as "".
          icon: icon.trim() === service.icon ? undefined : icon.trim(),
          category: category.trim() || 'Uncategorized',
          description: description.trim(),
          healthcheck: healthcheckChange,
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleRevert = async () => {
    setSaving(true);
    try {
      await deleteOverride(service.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revert');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await deleteManualService(service.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog title={`Edit ${SOURCE_LABEL[service.source]} Service`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Name" value={name} onChange={setName} />
        <Field
          label="URL"
          value={url}
          onChange={setUrl}
          hint={
            isDiscovered ? 'Leave empty to use the auto-detected URL; "#" for no link.' : undefined
          }
        />
        <Field label="Icon slug" value={icon} onChange={setIcon} placeholder="e.g. plex" />
        <CategoryCombobox value={category} onChange={setCategory} />
        <Field label="Description" value={description} onChange={setDescription} />

        <div className="space-y-1 pt-1">
          {isDiscovered && <Checkbox label="Hidden" checked={hidden} onChange={setHidden} />}
          <Checkbox label="Health check (HTTP)" checked={healthcheck} onChange={setHealthcheck} />
        </div>

        {error && (
          <p role="alert" className="text-red-400 text-sm">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-2">
          {isDiscovered && (
            <button
              type="button"
              onClick={handleRevert}
              disabled={saving}
              className="min-h-11 text-sm text-gray-400 hover:text-gray-200 transition-colors mr-auto"
            >
              Revert to auto-detected
            </button>
          )}
          {!isDiscovered && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="min-h-11 text-sm text-red-400 hover:text-red-300 transition-colors mr-auto"
            >
              Delete
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 px-4 py-2 text-sm rounded-lg text-gray-400 hover:text-gray-200 hover:bg-surface-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="min-h-11 px-4 py-2 text-sm rounded-lg bg-accent text-surface-900 font-semibold hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 min-h-11 text-sm text-gray-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded bg-surface-700 border-surface-600 text-accent focus:ring-accent/30"
      />
      {label}
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  const hintId = useId();
  return (
    <div>
      <label className="block">
        <span className="text-xs text-gray-400 mb-1 block">{label}</span>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-describedby={hint ? hintId : undefined}
          className="w-full min-h-11 px-3 py-2 rounded-lg bg-surface-700 border border-surface-600/60 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-colors text-base sm:text-sm"
        />
      </label>
      {hint && (
        <p id={hintId} className="text-xs text-gray-500 mt-1">
          {hint}
        </p>
      )}
    </div>
  );
}
