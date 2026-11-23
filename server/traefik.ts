/**
 * Optional discovery source: the Traefik API (read-only, GET only).
 *
 * Responses are reduced field by field to what the dashboard needs. Middleware configuration
 * (basic-auth users, forward-auth addresses, IP ranges) and backend server URLs are never kept.
 * Credentials stay in this module and are only ever sent to the configured API origin.
 */
import { config } from './config.js';
import {
  EXPOSURE_STRICTNESS,
  flattenMiddlewares,
  parseExposureMap,
  resolveExposure,
  type MiddlewareInfo,
} from './exposure.js';
import { parseRule } from './traefik-rule.js';
import type { ExposureLevel } from './types.js';
import { redactUrl, safeHttpUrl } from './urls.js';
import { createHash } from 'node:crypto';

export interface TraefikRoute {
  /** Stable service id for standalone (non-Docker) routes. */
  id: string;
  routerName: string;
  serviceName: string;
  provider: string;
  /** Absent when no router on the backend has a literal host to link to. */
  url?: string;
  https: boolean;
  exposure: ExposureLevel;
  exposureSource: string;
}

/** The container fields used to find its routers. */
export interface ContainerRef {
  name: string;
  /** `traefik.http.{routers,services}.*` label keys (keys only, values are not needed). */
  traefikLabelKeys?: readonly string[];
  compose_project?: string;
  compose_service?: string;
}

interface RouterInfo {
  name: string;
  provider: string;
  rule: string;
  service: string;
  status?: string;
  tls: boolean;
  entryPoints: string[];
  middlewares: string[];
}

const PAGE_SIZE = 100;
const MAX_PAGES = 50;
const MAX_BODY_BYTES = 10 * 1024 * 1024;
const MIN_REFRESH_MS = 2000;
const MAX_ID_LENGTH = 128;
const CONTAINER_PROVIDERS = new Set(['docker', 'swarm']);
const HTTPS_ENTRYPOINT = /^(websecure|https)$/i;

class TraefikApiError extends Error {}

// ---- parsing ----

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function baseName(name: string): string {
  const at = name.lastIndexOf('@');
  return at > 0 ? name.slice(0, at) : name;
}

function providerOf(name: string): string | undefined {
  const at = name.lastIndexOf('@');
  return at > 0 ? name.slice(at + 1) : undefined;
}

function parseRouter(raw: unknown): RouterInfo | undefined {
  if (!isRecord(raw)) return undefined;
  const { name, rule, service } = raw;
  if (typeof name !== 'string' || typeof rule !== 'string' || typeof service !== 'string') {
    return undefined;
  }
  const provider = typeof raw.provider === 'string' ? raw.provider : providerOf(name);
  if (!provider) return undefined;
  return {
    name,
    provider,
    rule,
    service,
    status: typeof raw.status === 'string' ? raw.status : undefined,
    tls: raw.tls !== undefined && raw.tls !== null,
    entryPoints: stringList(raw.entryPoints),
    middlewares: stringList(raw.middlewares),
  };
}

function parseMiddleware(raw: unknown): MiddlewareInfo | undefined {
  if (!isRecord(raw) || typeof raw.name !== 'string') return undefined;
  const type = typeof raw.type === 'string' ? raw.type.toLowerCase() : '';
  const chain = isRecord(raw.chain) ? stringList(raw.chain.middlewares) : undefined;
  return { name: raw.name, type, ...(chain ? { chain } : {}) };
}

function qualified(name: string, provider: string): string {
  return providerOf(name) ? name : `${name}@${provider}`;
}

function serviceId(service: string, provider: string): string {
  const slug = (value: string) => value.replace(/[^A-Za-z0-9_.-]+/g, '-');
  const id = `traefik-${slug(service)}-${slug(provider)}`;
  if (id.length <= MAX_ID_LENGTH) return id;
  const hash = createHash('sha256').update(id).digest('hex').slice(0, 12);
  return `${id.slice(0, MAX_ID_LENGTH - 13)}-${hash}`;
}

// ---- routes ----

const customRules = parseExposureMap(config.exposureMap);

function isIgnored(
  router: RouterInfo,
  disabledServices: ReadonlySet<string>,
  middlewares: ReadonlyMap<string, MiddlewareInfo>,
): boolean {
  if (router.provider === 'internal' || router.name.endsWith('@internal')) return true;
  if (router.service.endsWith('@internal')) return true;
  if (router.status === 'disabled') return true;
  if (disabledServices.has(qualified(router.service, router.provider))) return true;
  // A scheme redirect sends everything elsewhere. redirectRegex is not treated as redirect-only:
  // real apps use it for a few paths (e.g. .well-known).
  return flattenMiddlewares(router.middlewares, middlewares, router.provider).some(
    (m) => m.info?.type === 'redirectscheme',
  );
}

function toRoute(
  router: RouterInfo,
  middlewares: ReadonlyMap<string, MiddlewareInfo>,
): TraefikRoute {
  const { host, path } = parseRule(router.rule);
  const https = router.tls || router.entryPoints.some((ep) => HTTPS_ENTRYPOINT.test(ep));
  const url = host ? safeHttpUrl(`${https ? 'https' : 'http'}://${host}${path ?? ''}`) : undefined;
  const { level, source } = resolveExposure(
    router.middlewares,
    middlewares,
    customRules,
    router.provider,
  );
  const serviceProvider = providerOf(router.service) ?? router.provider;
  const serviceName = baseName(router.service);
  return {
    id: serviceId(serviceName, serviceProvider),
    routerName: baseName(router.name),
    serviceName,
    provider: router.provider,
    url,
    https,
    exposure: level,
    exposureSource: source,
  };
}

/**
 * One route for a set of routers on the same backend: linkable first, then HTTPS, then by name,
 * for a stable URL. The badge shows the loosest exposure of all of them, including routers that
 * cannot produce a link: a service with one public router is public.
 */
function pickRoute(routes: readonly TraefikRoute[]): TraefikRoute | undefined {
  const sorted = [...routes].sort(
    (a, b) =>
      Number(Boolean(b.url)) - Number(Boolean(a.url)) ||
      Number(b.https) - Number(a.https) ||
      a.routerName.localeCompare(b.routerName),
  );
  const primary = sorted[0];
  if (!primary) return undefined;
  const loosest = sorted.reduce((best, route) =>
    EXPOSURE_STRICTNESS[route.exposure] < EXPOSURE_STRICTNESS[best.exposure] ? route : best,
  );
  return { ...primary, exposure: loosest.exposure, exposureSource: loosest.exposureSource };
}

interface Routes {
  container: TraefikRoute[];
  standalone: TraefikRoute[];
}

function buildRoutes(rawRouters: unknown[], rawServices: unknown[], rawMw: unknown[]): Routes {
  const middlewares = new Map<string, MiddlewareInfo>();
  for (const raw of rawMw) {
    const parsed = parseMiddleware(raw);
    if (parsed) middlewares.set(parsed.name, parsed);
  }

  const disabledServices = new Set<string>();
  for (const raw of rawServices) {
    if (isRecord(raw) && typeof raw.name === 'string' && raw.status === 'disabled') {
      disabledServices.add(raw.name);
    }
  }

  const container: TraefikRoute[] = [];
  const byBackend = new Map<string, TraefikRoute[]>();
  for (const raw of rawRouters) {
    const router = parseRouter(raw);
    if (!router || isIgnored(router, disabledServices, middlewares)) continue;
    const route = toRoute(router, middlewares);
    if (CONTAINER_PROVIDERS.has(router.provider)) {
      container.push(route);
    } else {
      byBackend.set(route.id, [...(byBackend.get(route.id) ?? []), route]);
    }
  }

  const standalone = [...byBackend.values()]
    .map(pickRoute)
    // A card needs a link; a backend with only unlinkable routers gets none.
    .filter((r): r is TraefikRoute => r?.url !== undefined);
  return { container, standalone };
}

// ---- API client ----

interface Endpoint {
  base: string;
  headers: Record<string, string>;
}

/** Percent-decode URL userinfo; a stray "%" is taken literally instead of crashing startup. */
function decodeCredential(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseEndpoint(): Endpoint | undefined {
  const raw = config.traefikApiUrl.trim();
  if (!raw) return undefined;
  const url = URL.canParse(raw) ? new URL(raw) : undefined;
  if (url?.protocol !== 'http:' && url?.protocol !== 'https:') {
    console.error('[traefik] HOMEGANTRY_TRAEFIK_API_URL is not an http(s) URL; ignoring it');
    return undefined;
  }

  const username = config.traefikApiUsername || decodeCredential(url.username);
  const password = config.traefikApiPassword || decodeCredential(url.password);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (config.traefikApiToken) {
    headers.Authorization = `Bearer ${config.traefikApiToken}`;
  } else if (username || password) {
    const encoded = Buffer.from(`${username}:${password}`).toString('base64');
    headers.Authorization = `Basic ${encoded}`;
  }
  return { base: `${url.origin}${url.pathname.replace(/\/+$/, '')}`, headers };
}

const endpoint = parseEndpoint();

async function readBody(res: Response): Promise<string> {
  if (Number(res.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    throw new TraefikApiError('response too large');
  }
  if (!res.body) return '';
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.byteLength;
    if (size > MAX_BODY_BYTES) throw new TraefikApiError('response too large');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function fetchList(api: Endpoint, kind: string): Promise<unknown[]> {
  const items: unknown[] = [];
  let page = 1;
  for (let i = 0; i < MAX_PAGES; i++) {
    const res = await fetch(`${api.base}/api/http/${kind}?per_page=${PAGE_SIZE}&page=${page}`, {
      headers: api.headers,
      // Never carry credentials to wherever a redirect points.
      redirect: 'error',
      signal: AbortSignal.timeout(Math.max(config.traefikTimeout, 0.01) * 1000),
    });
    if (!res.ok) {
      await res.body?.cancel();
      throw new TraefikApiError(`HTTP ${res.status}`);
    }
    let data: unknown;
    try {
      data = JSON.parse(await readBody(res));
    } catch (err) {
      if (err instanceof SyntaxError) throw new TraefikApiError('invalid response');
      throw err;
    }
    if (!Array.isArray(data)) throw new TraefikApiError('invalid response');
    items.push(...(data as unknown[]));
    // Traefik answers X-Next-Page: 1 on the last page.
    const next = Number(res.headers.get('x-next-page'));
    if (!Number.isInteger(next) || next <= page) break;
    page = next;
  }
  return items;
}

function failureReason(err: unknown): string {
  if (err instanceof TraefikApiError) return err.message;
  if (err instanceof Error && err.name === 'TimeoutError') return 'timeout';
  // Other messages can contain addresses, so they are not logged.
  return 'unreachable';
}

// ---- state ----

const EMPTY: Routes = { container: [], standalone: [] };

let routes: Routes = EMPTY;
let available: boolean | null = null;
let inflight: Promise<boolean> | null = null;
let lastRefresh = 0;

async function load(api: Endpoint): Promise<boolean> {
  lastRefresh = Date.now();
  const before = JSON.stringify(routes);
  try {
    const [routers, services, middlewares] = await Promise.all([
      fetchList(api, 'routers'),
      fetchList(api, 'services'),
      fetchList(api, 'middlewares'),
    ]);
    routes = buildRoutes(routers, services, middlewares);
    if (available !== true) {
      const count = routes.container.length + routes.standalone.length;
      console.log(`[traefik] connected to ${redactUrl(api.base)}: ${count} routes`);
    }
    available = true;
  } catch (err) {
    routes = EMPTY;
    if (available !== false) {
      console.error(
        `[traefik] API at ${redactUrl(api.base)} unavailable (${failureReason(err)}); ` +
          'using Docker-only discovery',
      );
    }
    available = false;
  }
  return JSON.stringify(routes) !== before;
}

/**
 * Re-read the Traefik API; resolves to true when the routes changed. Never rejects. Bursts of
 * Docker events share one request.
 */
export function refreshTraefik({ force = false } = {}): Promise<boolean> {
  if (!endpoint) return Promise.resolve(false);
  if (inflight) return inflight;
  if (!force && Date.now() - lastRefresh < MIN_REFRESH_MS) return Promise.resolve(false);
  inflight = load(endpoint).finally(() => {
    inflight = null;
  });
  return inflight;
}

export function isTraefikEnabled(): boolean {
  return endpoint !== undefined;
}

/** False after a failed refresh, null before the first one. */
export function traefikAvailable(): boolean | null {
  return available;
}

export function standaloneRoutes(): readonly TraefikRoute[] {
  return routes.standalone;
}

export function standaloneRoute(id: string): TraefikRoute | undefined {
  return routes.standalone.find((route) => route.id === id);
}

/** Traefik's default name for a container: `<service>-<project>`, or the container name. */
function defaultNames(ref: ContainerRef): string[] {
  const normalise = (value: string) => value.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
  if (ref.compose_project && ref.compose_service) {
    return [normalise(`${ref.compose_service}-${ref.compose_project}`)];
  }
  return ref.name ? [normalise(ref.name)] : [];
}

/** The route of a container, matched by its Traefik labels or Traefik's default names. */
export function routeForContainer(ref: ContainerRef): TraefikRoute | undefined {
  if (routes.container.length === 0) return undefined;
  const routers = new Set<string>();
  const services = new Set<string>();
  for (const key of ref.traefikLabelKeys ?? []) {
    const match = /^traefik\.http\.(routers|services)\.([^.]+)\./i.exec(key);
    if (!match) continue;
    (match[1]!.toLowerCase() === 'routers' ? routers : services).add(match[2]!.toLowerCase());
  }
  for (const name of defaultNames(ref)) {
    routers.add(name);
    services.add(name);
  }
  return pickRoute(
    routes.container.filter(
      (route) =>
        routers.has(route.routerName.toLowerCase()) ||
        services.has(route.serviceName.toLowerCase()),
    ),
  );
}
