export interface PortMapping {
  private: number;
  public: number;
}

export interface ContainerInfo {
  name: string;
  image: string;
  state: string;
  compose_project?: string;
  compose_service?: string;
  ports: PortMapping[];
}

export type ExposureLevel = 'public' | 'sso' | 'private' | 'unknown';

export interface ServiceHealth {
  status: 'up' | 'down' | 'unknown';
  checkedAt: string;
  reason?: 'timeout' | 'tls' | 'unreachable' | 'http';
  httpStatus?: number;
}

export interface Service {
  id: string;
  source: 'docker' | 'manual' | 'traefik';
  name: string;
  description: string;
  url: string;
  icon: string;
  category: string;
  status: string;
  stack?: string;
  container?: ContainerInfo;
  hidden: boolean;
  sortOrder: number;
  exposure?: ExposureLevel;
  exposureSource?: string;
  health?: ServiceHealth;
  /** Health checks are off for this service (label, override or manual setting). */
  healthcheckDisabled?: boolean;
}

/** Override fields; `null` resets one to the auto-detected value. */
export interface ServiceOverride {
  displayName?: string | null;
  url?: string | null;
  icon?: string | null;
  category?: string | null;
  description?: string | null;
  hidden?: boolean | null;
  sortOrder?: number | null;
  /** `false` turns health checks off for this service. */
  healthcheck?: boolean | null;
}

export interface ManualService {
  id: string;
  displayName: string;
  url: string;
  icon: string;
  category: string;
  description: string;
  sortOrder: number;
  healthcheck?: boolean;
}

export interface StackConfig {
  visible: boolean;
  icon?: string;
  displayName?: string;
}

export interface DashboardSettings {
  dashboardTitle: string;
  columns: number;
  showStatus: boolean;
  layout: 'grid' | 'list';
  showStopped: boolean;
  groupBy: 'category' | 'stack' | 'host';
}

export type SSEEvent =
  | { type: 'initial_state'; data: Service[] }
  | { type: 'service_updated'; data: Service }
  | { type: 'service_removed'; data: { id: string } }
  | { type: 'settings_updated'; data: DashboardSettings }
  | { type: 'stacks_updated'; data: Record<string, StackConfig> }
  | { type: 'heartbeat'; data: Record<string, never> };

/** Where icons come from (`HOMEGANTRY_ICON_SOURCE`). */
export type IconSource = { mode: 'cdn' | 'custom'; baseUrl: string } | { mode: 'off' };

/** `GET /api/ui-config`. */
export interface UiConfig {
  icons: IconSource;
  /** The running HomeGantry version, e.g. `0.2.0`, or `unknown`. */
  version: string;
}

/** `GET /api/kb/coverage` (edit rights). */
export interface KbCoverage {
  total: number;
  recognised: number;
  unrecognised: string[];
}

/** `GET /api/auth`: what the current browser session may do. */
export interface AuthStatus {
  canEdit: boolean;
  method: 'token' | 'header' | null;
  /** HOMEGANTRY_READONLY=true on the server. */
  readonly: boolean;
  /** Which ways to unlock editing the server has enabled. */
  methods: { token: boolean; header: boolean };
}
