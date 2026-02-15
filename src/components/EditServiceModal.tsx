import { useState } from 'react';
import type { Service } from '../types';
import {
  updateOverride,
  deleteOverride,
  updateManualService,
  deleteManualService,
} from '../api/client';

interface Props {
  service: Service | null;
  onClose: () => void;
}

export default function EditServiceModal({ service, onClose }: Props) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [icon, setIcon] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [hidden, setHidden] = useState(false);
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
    setError('');
  }

  if (!service) return null;

  const isDocker = service.source === 'docker';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (isDocker) {
        await updateOverride(service.id, {
          displayName: name.trim() || undefined,
          url: url.trim() || undefined,
          icon: icon.trim() || undefined,
          category: category.trim() || undefined,
          description: description.trim() || undefined,
          hidden,
        });
      } else {
        await updateManualService(service.id, {
          displayName: name.trim(),
          url: url.trim(),
          icon: icon.trim(),
          category: category.trim() || 'Uncategorized',
          description: description.trim(),
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

  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdrop}
    >
      <div className="bg-surface-800 border border-surface-600/60 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-100 mb-4">
          Edit {isDocker ? 'Docker' : 'Manual'} Service
        </h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Name" value={name} onChange={setName} />
          <Field label="URL" value={url} onChange={setUrl} />
          <Field label="Icon slug" value={icon} onChange={setIcon} placeholder="e.g. plex" />
          <Field label="Category" value={category} onChange={setCategory} />
          <Field label="Description" value={description} onChange={setDescription} />

          <label className="flex items-center gap-2 text-sm text-gray-300 pt-1">
            <input
              type="checkbox"
              checked={hidden}
              onChange={(e) => setHidden(e.target.checked)}
              className="rounded bg-surface-700 border-surface-600 text-accent focus:ring-accent/30"
            />
            Hidden
          </label>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex items-center gap-2 pt-2">
            {isDocker && (
              <button
                type="button"
                onClick={handleRevert}
                disabled={saving}
                className="text-sm text-gray-500 hover:text-gray-300 transition-colors mr-auto"
              >
                Revert to auto-detected
              </button>
            )}
            {!isDocker && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="text-sm text-red-400 hover:text-red-300 transition-colors mr-auto"
              >
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg text-gray-400 hover:text-gray-200 hover:bg-surface-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm rounded-lg bg-accent text-surface-900 font-semibold hover:bg-accent/90 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-gray-400 mb-1 block">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg bg-surface-700 border border-surface-600/60 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-colors text-sm"
      />
    </label>
  );
}
