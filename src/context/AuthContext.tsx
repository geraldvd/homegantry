import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { AuthStatus } from '../types';
import { AUTH_EXPIRED_EVENT, getAuth, getStoredToken, setStoredToken } from '../api/client';

const READ_ONLY: AuthStatus = {
  canEdit: false,
  method: null,
  readonly: false,
  methods: { token: false, header: false },
};

interface AuthContextValue extends AuthStatus {
  /** Check `token` with the server; on success remember it for this browser session. */
  unlock: (token: string) => Promise<void>;
  /** Forget the token and go back to read-only. */
  lock: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(READ_ONLY);

  const refresh = useCallback(async () => {
    try {
      setStatus(await getAuth());
    } catch {
      // The stored token was rejected (or the server is unreachable): fall back to anonymous.
      if (getStoredToken()) setStoredToken(null);
      try {
        setStatus(await getAuth(null));
      } catch {
        setStatus(READ_ONLY);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onExpired = () => void refresh();
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, [refresh]);

  const unlock = useCallback(async (token: string) => {
    const next = await getAuth(token);
    if (!next.canEdit) throw new Error('This token does not allow editing.');
    setStoredToken(token);
    setStatus(next);
  }, []);

  const lock = useCallback(async () => {
    setStoredToken(null);
    await refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ ...status, unlock, lock }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** One-line explanation for the read-only badge. */
export function readOnlyHint(status: AuthStatus): string {
  if (status.readonly)
    return 'Read-only mode: editing is disabled on the server (HOMEGANTRY_READONLY).';
  if (status.methods.token) return 'Unlock editing with the admin token.';
  if (status.methods.header) return 'Editing is available when you sign in through your proxy.';
  return 'Editing is disabled. Set HOMEGANTRY_ADMIN_TOKEN or HOMEGANTRY_AUTH_HEADER on the server to enable it.';
}
