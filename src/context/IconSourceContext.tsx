import React, { createContext, useContext, useEffect, useState } from 'react';
import { getUiConfig } from '../api/client';
import type { IconSource } from '../types';

// Off until the server has answered: with HOMEGANTRY_ICON_SOURCE=off no request may ever leave.
const IconSourceContext = createContext<IconSource>({ mode: 'off' });

export function IconSourceProvider({ children }: { children: React.ReactNode }) {
  const [source, setSource] = useState<IconSource>({ mode: 'off' });

  useEffect(() => {
    let active = true;
    getUiConfig()
      .then((config) => {
        if (active) setSource(config.icons);
      })
      .catch(() => {
        // Stay on letter avatars.
      });
    return () => {
      active = false;
    };
  }, []);

  return <IconSourceContext.Provider value={source}>{children}</IconSourceContext.Provider>;
}

export function useIconSource(): IconSource {
  return useContext(IconSourceContext);
}
