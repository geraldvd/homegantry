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
}

export interface ServiceOverride {
  displayName?: string;
  url?: string;
  icon?: string;
  category?: string;
  description?: string;
  hidden?: boolean;
  sortOrder?: number;
}

export interface ManualService {
  id: string;
  displayName: string;
  url: string;
  icon: string;
  category: string;
  description: string;
  sortOrder: number;
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
  groupBy: 'category' | 'stack';
}

export type SSEEvent =
  | { type: 'initial_state'; data: Service[] }
  | { type: 'service_updated'; data: Service }
  | { type: 'service_removed'; data: { id: string } }
  | { type: 'settings_updated'; data: DashboardSettings }
  | { type: 'stacks_updated'; data: Record<string, StackConfig> }
  | { type: 'heartbeat'; data: Record<string, never> };

/** `GET /api/auth`: what the current browser session may do. */
export interface AuthStatus {
  canEdit: boolean;
  method: 'token' | 'header' | null;
  /** HOMEGANTRY_READONLY=true on the server. */
  readonly: boolean;
  /** Which ways to unlock editing the server has enabled. */
  methods: { token: boolean; header: boolean };
}
