import React, { createContext, useContext, useReducer, useEffect, useRef, useCallback, useState } from 'react';
import type { Service, DashboardSettings, StackConfig, SSEEvent } from '../types';
import { getStacks } from '../api/client';

interface State {
  services: Service[];
  settings: DashboardSettings;
  stacks: Record<string, StackConfig>;
}

type Action =
  | { type: 'SET_SERVICES'; payload: Service[] }
  | { type: 'UPDATE_SERVICE'; payload: Service }
  | { type: 'REMOVE_SERVICE'; payload: string }
  | { type: 'SET_SETTINGS'; payload: DashboardSettings }
  | { type: 'SET_STACKS'; payload: Record<string, StackConfig> };

const defaultSettings: DashboardSettings = {
  dashboardTitle: 'HomeGantry',
  columns: 4,
  showStatus: true,
  layout: 'grid',
  showStopped: true,
  groupBy: 'category',
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_SERVICES':
      return { ...state, services: action.payload };
    case 'UPDATE_SERVICE': {
      const idx = state.services.findIndex((s) => s.id === action.payload.id);
      if (idx === -1) {
        return { ...state, services: [...state.services, action.payload] };
      }
      const next = [...state.services];
      next[idx] = action.payload;
      return { ...state, services: next };
    }
    case 'REMOVE_SERVICE':
      return {
        ...state,
        services: state.services.filter((s) => s.id !== action.payload),
      };
    case 'SET_SETTINGS':
      return { ...state, settings: action.payload };
    case 'SET_STACKS':
      return { ...state, stacks: action.payload };
    default:
      return state;
  }
}

interface ServiceContextValue {
  services: Service[];
  settings: DashboardSettings;
  stacks: Record<string, StackConfig>;
  connected: boolean;
  dispatch: React.Dispatch<Action>;
}

const ServiceContext = createContext<ServiceContextValue | null>(null);

export function ServiceProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    services: [],
    settings: defaultSettings,
    stacks: {},
  });
  const [connected, setConnected] = useState(false);
  const retryDelay = useRef(1000);

  // Fetch stacks on mount
  useEffect(() => {
    getStacks()
      .then((data) => dispatch({ type: 'SET_STACKS', payload: data }))
      .catch(() => { /* ignore */ });
  }, []);

  const connect = useCallback(() => {
    const es = new EventSource('/api/events');

    es.onopen = () => {
      setConnected(true);
      retryDelay.current = 1000;
    };

    es.onerror = () => {
      es.close();
      setConnected(false);
      const delay = retryDelay.current;
      retryDelay.current = Math.min(delay * 2, 30000);
      setTimeout(connect, delay);
    };

    es.onmessage = (ev) => {
      try {
        const event = JSON.parse(ev.data) as SSEEvent;
        switch (event.type) {
          case 'initial_state':
            dispatch({ type: 'SET_SERVICES', payload: event.data });
            break;
          case 'service_updated':
            dispatch({ type: 'UPDATE_SERVICE', payload: event.data });
            break;
          case 'service_removed':
            dispatch({ type: 'REMOVE_SERVICE', payload: event.data.id });
            break;
          case 'settings_updated':
            dispatch({ type: 'SET_SETTINGS', payload: event.data });
            break;
          case 'stacks_updated':
            dispatch({ type: 'SET_STACKS', payload: event.data });
            break;
          case 'heartbeat':
            break;
        }
      } catch {
        // ignore malformed messages
      }
    };

    return es;
  }, []);

  useEffect(() => {
    const es = connect();
    return () => es.close();
  }, [connect]);

  return (
    <ServiceContext.Provider value={{ ...state, connected, dispatch }}>
      {children}
    </ServiceContext.Provider>
  );
}

export function useServices() {
  const ctx = useContext(ServiceContext);
  if (!ctx) throw new Error('useServices must be used within ServiceProvider');
  return { services: ctx.services, connected: ctx.connected, dispatch: ctx.dispatch };
}

export function useSettings() {
  const ctx = useContext(ServiceContext);
  if (!ctx) throw new Error('useSettings must be used within ServiceProvider');
  return { settings: ctx.settings, dispatch: ctx.dispatch };
}

export function useStacks() {
  const ctx = useContext(ServiceContext);
  if (!ctx) throw new Error('useStacks must be used within ServiceProvider');
  return { stacks: ctx.stacks, dispatch: ctx.dispatch };
}
