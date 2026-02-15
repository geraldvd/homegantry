import { useState } from 'react';
import { addManualService } from '../api/client';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function AddServiceModal({ open, onClose }: Props) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [icon, setIcon] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const reset = () => {
    setName('');
    setUrl('');
    setIcon('');
    setCategory('');
    setDescription('');
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) {
      setError('Name and URL are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await addManualService({
        displayName: name.trim(),
        url: url.trim(),
        icon: icon.trim(),
        category: category.trim() || 'Uncategorized',
        description: description.trim(),
        sortOrder: 0,
      });
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add service');
    } finally {
      setSaving(false);
    }
  };

  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      reset();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdrop}
    >
      <div className="bg-surface-800 border border-surface-600/60 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-100 mb-4">Add Service</h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Name" value={name} onChange={setName} placeholder="My Service" required />
          <Field label="URL" value={url} onChange={setUrl} placeholder="https://..." required />
          <Field label="Icon slug" value={icon} onChange={setIcon} placeholder="e.g. plex, grafana" />
          <Field label="Category" value={category} onChange={setCategory} placeholder="Media, Monitoring..." />
          <Field label="Description" value={description} onChange={setDescription} placeholder="Optional description" />

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => { reset(); onClose(); }}
              className="px-4 py-2 text-sm rounded-lg text-gray-400 hover:text-gray-200 hover:bg-surface-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm rounded-lg bg-accent text-surface-900 font-semibold hover:bg-accent/90 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Adding...' : 'Add Service'}
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
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs text-gray-400 mb-1 block">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full px-3 py-2 rounded-lg bg-surface-700 border border-surface-600/60 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-colors text-sm"
      />
    </label>
  );
}
