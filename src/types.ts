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

export interface Service {
  id: string;
  source: 'docker' | 'manual';
  name: string;
  description: string;
  url: string;
  icon: string;
  category: string;
  status: string;
  container?: ContainerInfo;
  hidden: boolean;
  sortOrder: number;
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

export interface DashboardSettings {
  dashboardTitle: string;
  columns: number;
  showStatus: boolean;
  layout: 'grid' | 'list';
  showStopped: boolean;
}

export type SSEEvent =
  | { type: 'initial_state'; data: Service[] }
  | { type: 'service_updated'; data: Service }
  | { type: 'service_removed'; data: { id: string } }
  | { type: 'settings_updated'; data: DashboardSettings }
  | { type: 'heartbeat'; data: Record<string, never> };
