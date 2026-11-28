import React, { createContext, useContext, useEffect, useState } from 'react';
import { getUiConfig } from '../api/client';
import type { IconSource } from '../types';

interface UiConfigState {
  icons: IconSource;
  /** `null` until the server has answered. */
  version: string | null;
}

// Off until the server has answered: with HOMEGANTRY_ICON_SOURCE=off no request may ever leave.
const INITIAL: UiConfigState = { icons: { mode: 'off' }, version: null };

/** Holds `GET /api/ui-config`: the icon source and the server version. */
const UiConfigContext = createContext<UiConfigState>(INITIAL);

export function IconSourceProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<UiConfigState>(INITIAL);

  useEffect(() => {
    let active = true;
    getUiConfig()
      .then((c) => {
        if (active) {
          setConfig({ icons: c.icons, version: typeof c.version === 'string' ? c.version : null });
        }
      })
      .catch(() => {
        // Stay on letter avatars.
      });
    return () => {
      active = false;
    };
  }, []);

  return <UiConfigContext.Provider value={config}>{children}</UiConfigContext.Provider>;
}

export function useIconSource(): IconSource {
  return useContext(UiConfigContext).icons;
}

/** The server version, or `null` until known. */
export function useServerVersion(): string | null {
  return useContext(UiConfigContext).version;
}
