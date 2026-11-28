import { config } from './config.js';
import { findByAlias, findByImage, findByRouteName } from './knowledge-base.js';
import type { ContainerInfo, KnownService, Service, ServiceOverride } from './types.js';
import { overridesStore, resolveOverride } from './storage.js';
import { parseRule } from './traefik-rule.js';
import type { TraefikRoute } from './traefik.js';

// ---- helpers ----

function stripPrefixSuffix(name: string): string {
  // Remove common prefixes/suffixes like "docker-", "-app", "_1", "-1"
  return name
    .replace(/^(docker[-_]|compose[-_])/, '')
    .replace(/([-_](app|service|container|srv|svc|web|server))$/, '')
    .replace(/[-_]\d+$/, '');
}

/** The knowledge-base entry for a container: compose service, then container name, then image. */
export function findKnownService(
  input: Pick<MatchInput, 'name' | 'image' | 'compose_service'>,
): KnownService | undefined {
  return (
    (input.compose_service ? findByAlias(input.compose_service) : undefined) ??
    findByAlias(stripPrefixSuffix(input.name)) ??
    findByImage(input.image)
  );
}

// ---- labels ----

function getLabel(labels: Record<string, string>, key: string): string | undefined {
  return labels[key];
}

// ---- Traefik URL extraction ----

function extractTraefikUrl(labels: Record<string, string>): string | undefined {
  for (const [key, value] of Object.entries(labels)) {
    if (/^traefik\.http\.routers\..+\.rule$/i.test(key)) {
      const { host } = parseRule(value);
      if (host) return `https://${host}`;
    }
  }
  return undefined;
}

// ---- URL resolution with priority cascade ----

function resolveUrl(input: MatchInput, route?: TraefikRoute): string {
  // 1. homegantry.url label (explicit)
  const hgUrl = getLabel(input.labels, 'homegantry.url');
  if (hgUrl) return hgUrl;

  // 2. homepage.href label (compat)
  if (config.homepageCompat) {
    const hpHref = getLabel(input.labels, 'homepage.href');
    if (hpHref) return hpHref;
  }

  // 3. Traefik API (knows the real TLS setup and path)
  if (route?.url) return route.url;

  // 4. Traefik router rules in labels
  const traefikUrl = extractTraefikUrl(input.labels);
  if (traefikUrl) return traefikUrl;

  // 5. localhost + public port fallback
  const host = config.host || 'localhost';
  if (input.ports.length > 0) {
    const publicPort = input.ports[0]!.public;
    if (publicPort) return `http://${host}:${publicPort}`;
  }

  // 6. No URL available
  return '#';
}

/**
 * True when `url` is the `localhost` link fallback (no HOMEGANTRY_HOST). That link is meant for a
 * browser on the Docker host; from inside the HomeGantry container it points at HomeGantry itself.
 */
export function isLocalhostFallback(input: MatchInput, url: string): boolean {
  const port = input.ports[0]?.public;
  return !config.host && port !== undefined && url === `http://localhost:${port}`;
}

// ---- main matching function ----

export interface MatchInput {
  id: string;
  name: string;
  image: string;
  state: string;
  labels: Record<string, string>;
  traefikLabelKeys?: readonly string[];
  compose_project?: string;
  compose_service?: string;
  ports: ContainerInfo['ports'];
}

/** A service for a Traefik router without a container (file provider and the like). */
export function matchRoute(route: TraefikRoute): Service {
  const candidates = [route.routerName, route.serviceName];
  let matched: KnownService | undefined;
  for (const candidate of candidates) {
    matched ??= findByRouteName(candidate) ?? findByRouteName(stripPrefixSuffix(candidate));
  }

  // By id only: the name fallback is for containers and could hit an unrelated one.
  const override = overridesStore.get()[route.id];
  const hidden = override?.hidden ?? matched?.infrastructure ?? false;

  return {
    id: route.id,
    source: 'traefik',
    name: override?.displayName ?? matched?.name ?? route.routerName,
    description: override?.description ?? matched?.description ?? '',
    url: override?.url ?? route.url ?? '#',
    icon: override?.icon ?? matched?.icon ?? '',
    category: override?.category ?? matched?.category ?? 'Other',
    // Traefik only says the route exists; the health check says whether it answers.
    status: 'unknown',
    hidden,
    sortOrder: override?.sortOrder ?? 0,
    exposure: route.exposure,
    exposureSource: route.exposureSource,
    // #32: Traefik-only services have no labels, so the override is the only opt-out.
    ...(override?.healthcheck === false ? { healthcheckDisabled: true } : {}),
  };
}

/** True when the `homegantry.healthcheck=false` label turns the health check off. */
export function labelDisablesHealthcheck(labels: Readonly<Record<string, string>>): boolean {
  return labels['homegantry.healthcheck']?.trim().toLowerCase() === 'false';
}

/** Health checks are off by label (`homegantry.healthcheck=false`) unless an override says otherwise. */
function healthcheckDisabled(labels: Record<string, string>, override?: ServiceOverride): boolean {
  if (override?.healthcheck !== undefined) return !override.healthcheck;
  return labelDisablesHealthcheck(labels);
}

export function matchContainer(input: MatchInput, route?: TraefikRoute): Service {
  const container: ContainerInfo = {
    name: input.name,
    image: input.image,
    state: input.state,
    compose_project: input.compose_project,
    compose_service: input.compose_service,
    ports: input.ports,
  };

  let name = input.name;
  let icon = '';
  let category = 'Other';
  let description = '';

  // Resolve URL via priority cascade
  let url = resolveUrl(input, route);

  // Priority 1: HomeGantry labels (name, icon, category, description — URL handled by resolveUrl)
  const hgName = getLabel(input.labels, 'homegantry.name');
  const hgIcon = getLabel(input.labels, 'homegantry.icon');
  const hgCategory = getLabel(input.labels, 'homegantry.category');
  const hgDesc = getLabel(input.labels, 'homegantry.description');

  if (hgName || hgIcon || hgCategory) {
    if (hgName) name = hgName;
    if (hgIcon) icon = hgIcon;
    if (hgCategory) category = hgCategory;
    if (hgDesc) description = hgDesc;
  }

  // Priority 2: Homepage labels (compat mode)
  if (!hgName && config.homepageCompat) {
    const hpName = getLabel(input.labels, 'homepage.name');
    const hpIcon = getLabel(input.labels, 'homepage.icon');
    const hpGroup = getLabel(input.labels, 'homepage.group');
    const hpDesc = getLabel(input.labels, 'homepage.description');

    if (hpName || hpIcon || hpGroup) {
      if (hpName) name = hpName;
      // #13 (a): a homegantry.* label always beats its homepage.* counterpart.
      if (hpIcon && !icon) icon = hpIcon;
      if (hpGroup && !hgCategory) category = hpGroup;
      if (hpDesc && !description) description = hpDesc;
    }
  }

  // #13 (d): a category from a label (even "Other") beats the knowledge base.
  const hasLabelCategory = !!(
    hgCategory ||
    (!hgName && config.homepageCompat && getLabel(input.labels, 'homepage.group'))
  );

  // Only attempt knowledge-base matching if labels didn't resolve
  const resolvedByLabels = !!(
    hgName ||
    (config.homepageCompat && getLabel(input.labels, 'homepage.name'))
  );

  let matched: KnownService | undefined;

  if (!resolvedByLabels) {
    // Priority 3-5: compose service name, container name, Docker image
    matched = findKnownService(input);

    if (matched) {
      name = matched.name;
      icon = icon || matched.icon;
      if (!hasLabelCategory) category = matched.category;
      description = description || matched.description;
    }
  }

  // Don't expand icon slugs to full URLs — store the slug,
  // let the frontend handle CDN URL construction (fixes double-CDN bug)

  // Apply overrides
  const override = resolveOverride(input.id, input.name);
  if (override) {
    if (override.displayName !== undefined) name = override.displayName;
    if (override.url !== undefined) url = override.url;
    if (override.icon !== undefined) icon = override.icon;
    if (override.category !== undefined) category = override.category;
    if (override.description !== undefined) description = override.description;
  }

  // Auto-hide infrastructure services (unless user has explicitly set hidden)
  let hidden = override?.hidden ?? false;
  if (matched?.infrastructure && !hgName && override?.hidden === undefined) {
    hidden = true;
  }

  const status = input.state === 'running' ? 'running' : 'stopped';

  return {
    id: input.id,
    source: 'docker',
    name,
    description,
    url,
    icon,
    category,
    status,
    stack: input.compose_project,
    container,
    hidden,
    sortOrder: override?.sortOrder ?? 0,
    ...(route ? { exposure: route.exposure, exposureSource: route.exposureSource } : {}),
    ...(healthcheckDisabled(input.labels, override) ? { healthcheckDisabled: true } : {}),
  };
}
