import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import type { ContainerInfo, KnownService, Service } from './types.js';
import { resolveOverride } from './storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let knownServices: KnownService[] = [];
try {
  const raw = fs.readFileSync(
    path.join(__dirname, 'known-services.json'),
    'utf-8',
  );
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
  return knownServices.find((ks) =>
    ks.aliases.some((a) => normalise(a) === norm),
  );
}

function findByPattern(image: string): KnownService | undefined {
  const lower = image.toLowerCase();
  return knownServices.find((ks) =>
    ks.patterns.some((p) => lower.includes(p.toLowerCase())),
  );
}

function findByPort(port: number): KnownService | undefined {
  return knownServices.find((ks) => ks.defaultPort === port);
}

function buildUrl(container: ContainerInfo): string {
  const host = config.host || 'localhost';
  if (container.ports.length === 0) return '';
  const publicPort = container.ports[0]!.public;
  if (!publicPort) return '';
  return `http://${host}:${publicPort}`;
}

// ---- labels ----

function getLabel(
  labels: Record<string, string>,
  key: string,
): string | undefined {
  return labels[key];
}

// ---- main matching function ----

export interface MatchInput {
  id: string;
  name: string;
  image: string;
  state: string;
  labels: Record<string, string>;
  compose_project?: string;
  compose_service?: string;
  ports: ContainerInfo['ports'];
}

export function matchContainer(input: MatchInput): Service {
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
  let url = buildUrl(container);
  let category = 'Other';
  let description = '';

  // Priority 1: HomeGantry labels
  const hgName = getLabel(input.labels, 'homegantry.name');
  const hgIcon = getLabel(input.labels, 'homegantry.icon');
  const hgUrl = getLabel(input.labels, 'homegantry.url');
  const hgCategory = getLabel(input.labels, 'homegantry.category');
  const hgDesc = getLabel(input.labels, 'homegantry.description');

  if (hgName || hgIcon || hgUrl || hgCategory) {
    if (hgName) name = hgName;
    if (hgIcon) icon = hgIcon;
    if (hgUrl) url = hgUrl;
    if (hgCategory) category = hgCategory;
    if (hgDesc) description = hgDesc;
  }

  // Priority 2: Homepage labels (compat mode)
  if (!hgName && config.homepageCompat) {
    const hpName = getLabel(input.labels, 'homepage.name');
    const hpIcon = getLabel(input.labels, 'homepage.icon');
    const hpHref = getLabel(input.labels, 'homepage.href');
    const hpGroup = getLabel(input.labels, 'homepage.group');
    const hpDesc = getLabel(input.labels, 'homepage.description');

    if (hpName || hpIcon || hpHref || hpGroup) {
      if (hpName) name = hpName;
      if (hpIcon) icon = hpIcon;
      if (hpHref) url = hpHref;
      if (hpGroup) category = hpGroup;
      if (hpDesc) description = hpDesc;
    }
  }

  // Only attempt knowledge-base matching if labels didn't resolve
  const resolvedByLabels = !!(hgName || (config.homepageCompat && getLabel(input.labels, 'homepage.name')));

  if (!resolvedByLabels) {
    let matched: KnownService | undefined;

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

    // Priority 6: Port heuristics
    if (!matched && input.ports.length > 0) {
      const privatePort = input.ports[0]!.private;
      matched = findByPort(privatePort);
    }

    if (matched) {
      name = matched.name;
      icon = icon || matched.icon;
      category = matched.category;
      description = description || matched.description;
    }
  }

  // Build icon URL if it's a simple slug (no protocol)
  if (icon && !icon.includes('://') && !icon.startsWith('/')) {
    icon = `https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/${icon}.png`;
  }

  // Apply overrides
  const override = resolveOverride(input.id, input.name);
  if (override) {
    if (override.displayName !== undefined) name = override.displayName;
    if (override.url !== undefined) url = override.url;
    if (override.icon !== undefined) icon = override.icon;
    if (override.category !== undefined) category = override.category;
    if (override.description !== undefined) description = override.description;
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
    container,
    hidden: override?.hidden ?? false,
    sortOrder: override?.sortOrder ?? 0,
  };
}
