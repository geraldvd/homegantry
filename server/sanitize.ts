/**
 * Explicit allow-lists for everything the API returns (REST and SSE).
 *
 * Mission principle 2: never leak secrets. Docker happily hands out env vars, mounts and full
 * label sets; none of that may reach a client. Every response object is rebuilt field by field
 * here instead of being passed through, so new internal fields stay private by default.
 */
import type {
  ContainerInfo,
  DashboardSettings,
  ManualService,
  Service,
  ServiceHealth,
  StackConfig,
} from './types.js';
import { iconSource, type IconSource } from './icons.js';
import { safeIcon, safeServiceUrl } from './urls.js';

const SECRET_LABEL = /password|passwd|secret|token|key|credential/i;

/** True for label keys that look like they hold a secret (`*password*`, `*secret*`, `*token*`, `*key*`). */
export function isSecretLabel(key: string): boolean {
  return SECRET_LABEL.test(key);
}

/** Copy of `labels` without secret-looking keys. */
export function stripSecretLabels(labels: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(labels)) {
    if (!isSecretLabel(key)) out[key] = value;
  }
  return out;
}

/** Drop keys whose value is `undefined`, so optional fields are absent rather than present-but-empty. */
function compact<T extends object>(obj: T): T {
  for (const key of Object.keys(obj) as Array<keyof T>) {
    if (obj[key] === undefined) delete obj[key];
  }
  return obj;
}

function publicContainer(c: ContainerInfo): ContainerInfo {
  return compact({
    name: c.name,
    image: c.image,
    state: c.state,
    compose_project: c.compose_project,
    compose_service: c.compose_service,
    ports: (c.ports ?? []).map((p) => ({ private: p.private, public: p.public })),
  });
}

/** A safe icon value; with the icon source `off`, explicit URLs are dropped too. */
function publicIcon(value: unknown): string {
  const icon = safeIcon(value);
  return iconSource.mode === 'off' && /^https?:/i.test(icon) ? '' : icon;
}

/** What the client needs to build icon URLs (`GET /api/ui-config`). */
export function publicUiConfig(source: IconSource = iconSource): { icons: IconSource } {
  return {
    icons: source.mode === 'off' ? { mode: 'off' } : { mode: source.mode, baseUrl: source.baseUrl },
  };
}

/** The public shape of a service. */
export function publicService(s: Service): Service {
  return compact({
    id: s.id,
    source: s.source,
    name: s.name,
    description: s.description,
    // Re-validated here: labels and values stored before M1 never passed request validation.
    url: (s.url === undefined ? undefined : safeServiceUrl(s.url)) as string,
    icon: (s.icon === undefined ? undefined : publicIcon(s.icon)) as string,
    category: s.category,
    status: s.status,
    stack: s.stack,
    container: s.container ? publicContainer(s.container) : undefined,
    hidden: s.hidden,
    sortOrder: s.sortOrder,
    exposure: s.exposure,
    exposureSource: s.exposureSource,
    health: s.health ? publicHealth(s.health) : undefined,
    healthcheckDisabled: s.healthcheckDisabled === true ? true : undefined,
  });
}

function publicHealth(h: ServiceHealth): ServiceHealth {
  return compact({
    status: h.status,
    checkedAt: h.checkedAt,
    reason: h.reason,
    httpStatus: h.httpStatus,
  });
}

/** The public shape of a stored manual service (write responses). */
export function publicManualService(m: ManualService): ManualService {
  return compact({
    id: m.id,
    displayName: m.displayName,
    url: safeServiceUrl(m.url),
    icon: publicIcon(m.icon),
    category: m.category,
    description: m.description,
    sortOrder: m.sortOrder,
    healthcheck: typeof m.healthcheck === 'boolean' ? m.healthcheck : undefined,
  });
}

export function publicStack(c: StackConfig): StackConfig {
  return compact({
    visible: c.visible,
    icon: c.icon === undefined ? undefined : publicIcon(c.icon),
    displayName: c.displayName,
  });
}

export function publicStacks(stacks: Record<string, StackConfig>): Record<string, StackConfig> {
  const out: Record<string, StackConfig> = {};
  for (const [name, cfg] of Object.entries(stacks)) out[name] = publicStack(cfg);
  return out;
}

export function publicSettings(s: DashboardSettings): DashboardSettings {
  return compact({
    dashboardTitle: s.dashboardTitle,
    columns: s.columns,
    showStatus: s.showStatus,
    layout: s.layout,
    showStopped: s.showStopped,
    groupBy: s.groupBy,
  });
}
