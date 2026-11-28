import { useCallback, useState } from 'react';

/** Collapsed groups live only in this browser (localStorage), never in the server settings. */
export const COLLAPSED_KEY = 'homegantry.collapsedGroups';

function load(): Set<string> {
  try {
    const raw = window.localStorage.getItem(COLLAPSED_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((k) => typeof k === 'string') : []);
  } catch {
    return new Set();
  }
}

function save(keys: Set<string>): void {
  try {
    window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...keys]));
  } catch {
    // storage unavailable (private mode, blocked): collapsing still works until reload
  }
}

export function useCollapsedGroups() {
  const [collapsed, setCollapsed] = useState(load);
  const toggle = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      save(next);
      return next;
    });
  }, []);
  return { collapsed, toggle };
}
