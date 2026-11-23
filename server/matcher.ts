import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import type { ContainerInfo, KnownService, Service } from './types.js';
import { overridesStore, resolveOverride } from './storage.js';
import { parseRule } from './traefik-rule.js';
import type { TraefikRoute } from './traefik.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let knownServices: KnownService[] = [];
try {
  const raw = fs.readFileSync(path.join(__dirname, 'known-services.json'), 'utf-8');
  knownServices = JSON.parse(raw) as KnownService[];
} catch {
  // known-services.json may not exist yet
}

// ---- helpers ----

function stripPrefixSuffix(name: string): string {
  // Remove common prefixes/suffixes like "docker-", "-app", "_1", "-1"
  return name
    .replace(/^(docker[-_]|compose[-_])/, '')
    .replace(/([-_](app|service|container|srv|svc|web|server))$/, '')
    .replace(/[-_]\d+$/, '');
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[-_.\s]/g, '');
}

function parseImage(image: string): { repo: string; name: string } {
  // Strip tag/digest
  const withoutTag = image.split(':')[0]!.split('@')[0]!;
  const parts = withoutTag.split('/');
  const name = parts[parts.length - 1]!;
  return { repo: withoutTag, name };
}

function findByAlias(alias: string): KnownService | undefined {
  const norm = normalise(alias);
  return knownServices.find((ks) => ks.aliases.some((a) => normalise(a) === norm));
}

function findByPattern(image: string): KnownService | undefined {
  const lower = image.toLowerCase();
  return knownServices.find((ks) => ks.patterns.some((p) => lower.includes(p.toLowerCase())));
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
  if (route) return route.url;

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
    matched ??= findByAlias(candidate) ?? findByAlias(stripPrefixSuffix(candidate));
  }

  // By id only: the name fallback is for containers and could hit an unrelated one.
  const override = overridesStore.get()[route.id];
  const hidden = override?.hidden ?? matched?.infrastructure ?? false;

  return {
    id: route.id,
    source: 'traefik',
    name: override?.displayName ?? matched?.name ?? route.routerName,
    description: override?.description ?? matched?.description ?? '',
    url: override?.url ?? route.url,
    icon: override?.icon ?? matched?.icon ?? '',
    category: override?.category ?? matched?.category ?? 'Other',
    // Traefik only says the route exists; the health check says whether it answers.
    status: 'unknown',
    hidden,
    sortOrder: override?.sortOrder ?? 0,
    exposure: route.exposure,
    exposureSource: route.exposureSource,
  };
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
      if (hpIcon) icon = hpIcon;
      if (hpGroup) category = hpGroup;
      if (hpDesc) description = hpDesc;
    }
  }

  // Only attempt knowledge-base matching if labels didn't resolve
  const resolvedByLabels = !!(
    hgName ||
    (config.homepageCompat && getLabel(input.labels, 'homepage.name'))
  );

  let matched: KnownService | undefined;

  if (!resolvedByLabels) {
    // Priority 3: Compose service name lookup
    if (!matched && input.compose_service) {
      matched = findByAlias(input.compose_service);
    }

    // Priority 4: Container name lookup
    if (!matched) {
      const stripped = stripPrefixSuffix(input.name);
      matched = findByAlias(stripped);
    }

    // Priority 5: Docker image pattern matching
    if (!matched) {
      const { repo } = parseImage(input.image);
      matched = findByPattern(repo);
    }

    if (matched) {
      name = matched.name;
      icon = icon || matched.icon;
      category = matched.category;
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
  };
}
