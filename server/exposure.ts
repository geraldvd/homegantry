/**
 * How a service is exposed, derived from its Traefik middlewares. Names are matched against
 * HOMEGANTRY_EXPOSURE_MAP first, then generic defaults; the middleware type is the fallback.
 */
import type { ExposureLevel } from './types.js';

export interface ExposureRule {
  pattern: string;
  level: ExposureLevel;
}

/** Only the middleware fields HomeGantry needs; their configuration is never kept. */
export interface MiddlewareInfo {
  name: string;
  type: string;
  chain?: string[];
  /** Target scheme of a `redirectScheme` middleware. */
  redirectScheme?: string;
}

export interface ExposureResult {
  level: ExposureLevel;
  /** Short explanation for the badge tooltip. */
  source: string;
}

const LEVELS: readonly ExposureLevel[] = ['public', 'sso', 'private', 'unknown'];

/** Higher wins when a router has several middlewares. */
export const EXPOSURE_STRICTNESS: Record<ExposureLevel, number> = {
  public: 0,
  unknown: 1,
  sso: 2,
  private: 3,
};

export const DEFAULT_EXPOSURE_RULES: readonly ExposureRule[] = [
  { pattern: '*forwardauth*', level: 'sso' },
  { pattern: '*authentik*', level: 'sso' },
  { pattern: '*authelia*', level: 'sso' },
  { pattern: '*ipallowlist*', level: 'private' },
  { pattern: '*ipwhitelist*', level: 'private' },
];

const TYPE_LEVELS: Record<string, ExposureLevel> = {
  forwardauth: 'sso',
  basicauth: 'sso',
  digestauth: 'sso',
  ipallowlist: 'private',
  ipwhitelist: 'private',
};

/** Built-in Traefik middlewares that change traffic but do not restrict who gets in. */
const NEUTRAL_TYPES = new Set([
  'addprefix',
  'buffering',
  'circuitbreaker',
  'compress',
  'contenttype',
  'errors',
  'grpcweb',
  'headers',
  'inflightreq',
  'passtlsclientcert',
  'ratelimit',
  'redirectregex',
  'redirectscheme',
  'replacepath',
  'replacepathregex',
  'retry',
  'stripprefix',
  'stripprefixregex',
]);

const MAX_SOURCE_NAMES = 3;

/** Parse `pattern=level,pattern=level`; invalid entries are skipped with one warning. */
export function parseExposureMap(raw: string): ExposureRule[] {
  const rules: ExposureRule[] = [];
  let invalid = 0;
  for (const entry of raw.split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const idx = trimmed.lastIndexOf('=');
    const pattern = idx > 0 ? trimmed.slice(0, idx).trim() : '';
    const level = trimmed.slice(idx + 1).trim() as ExposureLevel;
    // 'vpn-only' was the level's name before 2026-11-23; keep accepting it.
    const lvl = (level as string) === 'vpn-only' ? 'private' : level;
    if (pattern && LEVELS.includes(lvl)) rules.push({ pattern, level: lvl });
    else invalid++;
  }
  if (invalid > 0) {
    console.warn(`[exposure] ignored ${invalid} invalid HOMEGANTRY_EXPOSURE_MAP entries`);
  }
  return rules;
}

function globMatches(pattern: string, value: string): boolean {
  const source = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*+/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${source}$`, 'i').test(value);
}

function baseName(name: string): string {
  const at = name.lastIndexOf('@');
  return at > 0 ? name.slice(0, at) : name;
}

function providerOf(name: string): string | undefined {
  const at = name.lastIndexOf('@');
  return at > 0 ? name.slice(at + 1) : undefined;
}

function ruleLevel(rules: readonly ExposureRule[], name: string): ExposureLevel | undefined {
  const base = baseName(name);
  return rules.find((r) => globMatches(r.pattern, base) || globMatches(r.pattern, name))?.level;
}

/** Router middlewares with chains expanded; a name may lack its `@provider`. */
export function flattenMiddlewares(
  names: readonly string[],
  middlewares: ReadonlyMap<string, MiddlewareInfo>,
  provider: string | undefined,
  seen: Set<string> = new Set(),
): Array<{ name: string; info?: MiddlewareInfo }> {
  const out: Array<{ name: string; info?: MiddlewareInfo }> = [];
  for (const raw of names) {
    const full = providerOf(raw) || !provider ? raw : `${raw}@${provider}`;
    if (seen.has(full)) continue;
    seen.add(full);
    const info = middlewares.get(full);
    out.push({ name: full, info });
    if (info?.chain) {
      out.push(...flattenMiddlewares(info.chain, middlewares, providerOf(full), seen));
    }
  }
  return out;
}

/** The exposure of a router with these middlewares (the strictest one wins). */
export function resolveExposure(
  names: readonly string[],
  middlewares: ReadonlyMap<string, MiddlewareInfo>,
  customRules: readonly ExposureRule[],
  routerProvider?: string,
): ExposureResult {
  if (names.length === 0) return { level: 'public', source: 'No access middleware on the router' };

  const flat = flattenMiddlewares(names, middlewares, routerProvider);

  let level: ExposureLevel = 'public';
  const reasons: string[] = [];
  const consider = (candidate: ExposureLevel, reason: string) => {
    if (EXPOSURE_STRICTNESS[candidate] > EXPOSURE_STRICTNESS[level]) {
      level = candidate;
      reasons.length = 0;
    }
    if (candidate === level && candidate !== 'public') reasons.push(reason);
  };

  for (const { name, info } of flat) {
    const label = baseName(name);
    const type = info?.type.toLowerCase();
    const custom = ruleLevel(customRules, name);
    const byName = custom ?? ruleLevel(DEFAULT_EXPOSURE_RULES, name);
    if (byName) consider(byName, type ? `${label} (${type})` : label);
    else if (type === 'chain') continue;
    else if (type && TYPE_LEVELS[type]) consider(TYPE_LEVELS[type]!, `${label} (${type})`);
    else if (!type || !NEUTRAL_TYPES.has(type)) consider('unknown', label);
  }

  if (level === 'public') return { level, source: 'No access middleware on the router' };
  const shown = reasons.slice(0, MAX_SOURCE_NAMES).join(', ');
  const prefix = level === 'unknown' ? 'Unrecognised middleware' : 'Middleware';
  return { level, source: `${prefix}: ${shown}` };
}
