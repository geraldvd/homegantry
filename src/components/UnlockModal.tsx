import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Dialog from './Dialog';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function UnlockModal({ open, onClose }: Props) {
  const { unlock } = useAuth();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const close = () => {
    setToken('');
    setError('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    setBusy(true);
    setError('');
    try {
      await unlock(token.trim());
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unlock');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title="Unlock editing" onClose={close} size="sm">
      <p className="text-sm text-gray-400 mb-4 -mt-2">
        Enter the admin token (<code className="text-gray-300">HOMEGANTRY_ADMIN_TOKEN</code>). It is
        kept only for this browser tab.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block">
          <span className="text-xs text-gray-400 mb-1 block">Admin token</span>
          <input
            type="password"
            autoComplete="current-password"
            autoFocus
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="w-full min-h-11 px-3 py-2 rounded-lg bg-surface-700 border border-surface-600/60 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-colors text-sm"
          />
        </label>
        {error && (
          <p role="alert" className="text-red-400 text-sm">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={close}
            className="min-h-11 px-4 py-2 text-sm rounded-lg text-gray-400 hover:text-gray-200 hover:bg-surface-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !token.trim()}
            className="min-h-11 px-4 py-2 text-sm rounded-lg bg-accent text-surface-900 font-semibold hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            Unlock
          </button>
        </div>
      </form>
    </Dialog>
  );
}
