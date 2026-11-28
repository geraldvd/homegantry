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

/** How a service is reachable, derived from its reverse-proxy middlewares. */
export type ExposureLevel = 'public' | 'sso' | 'private' | 'unknown';

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
  /** Why the service has this exposure (badge tooltip); middleware names only. */
  exposureSource?: string;
  health?: ServiceHealth;
  /** Health checks are off for this service (label, override or manual setting). */
  healthcheckDisabled?: boolean;
}

export interface ServiceHealth {
  status: 'up' | 'down' | 'unknown';
  /** ISO timestamp of the last check. */
  checkedAt: string;
  reason?: 'timeout' | 'tls' | 'unreachable' | 'http';
  httpStatus?: number;
}

export interface ServiceOverride {
  displayName?: string;
  url?: string;
  icon?: string;
  category?: string;
  description?: string;
  hidden?: boolean;
  sortOrder?: number;
  /** `false` turns health checks off; `true` turns them back on despite a label. */
  healthcheck?: boolean;
}

/** `PUT /api/services/:id/override`: `null` resets a field to the auto-detected value. */
export type ServiceOverridePatch = { [K in keyof ServiceOverride]?: ServiceOverride[K] | null };

export interface ManualService {
  id: string;
  displayName: string;
  url: string;
  icon: string;
  category: string;
  description: string;
  sortOrder: number;
  /** `false` turns health checks off. */
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

export interface KnownService {
  name: string;
  description: string;
  icon: string;
  category: string;
  defaultPort?: number;
  patterns: string[];
  aliases: string[];
  /** Traefik router/service names, for services that do not run in Docker. */
  traefik?: string[];
  infrastructure?: boolean;
}

/** `GET /api/kb/coverage` (edit rights): image names only, never labels or other details. */
export interface KbCoverage {
  total: number;
  recognised: number;
  unrecognised: string[];
}

export type SSEEvent =
  | { type: 'initial_state'; data: Service[] }
  | { type: 'service_updated'; data: Service }
  | { type: 'service_removed'; data: { id: string } }
  | { type: 'settings_updated'; data: DashboardSettings }
  | { type: 'stacks_updated'; data: Record<string, StackConfig> }
  | { type: 'heartbeat'; data: Record<string, never> };
