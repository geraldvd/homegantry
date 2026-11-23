function envString(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function envNumber(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isNaN(n) ? fallback : n;
}

function envBool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v === undefined) return fallback;
  return v === '1' || v.toLowerCase() === 'true';
}

export const config = {
  port: envNumber('HOMEGANTRY_PORT', 3000),
  host: envString('HOMEGANTRY_HOST', ''),
  title: envString('HOMEGANTRY_TITLE', 'HomeGantry'),
  dockerSocket: envString('HOMEGANTRY_DOCKER_SOCKET', '/var/run/docker.sock'),
  pollInterval: envNumber('HOMEGANTRY_POLL_INTERVAL', 60),
  showStopped: envBool('HOMEGANTRY_SHOW_STOPPED', false),
  homepageCompat: envBool('HOMEGANTRY_HOMEPAGE_COMPAT', true),
  excludeSelf: envBool('HOMEGANTRY_EXCLUDE_SELF', true),
  dataDir: envString('HOMEGANTRY_DATA_DIR', './data'),
  logLevel: envString('HOMEGANTRY_LOG_LEVEL', 'info'),
  composeOnly: envBool('HOMEGANTRY_COMPOSE_ONLY', true),
  // `cdn`, `off` or a self-hosted base URL (see server/icons.ts).
  iconSource: envString('HOMEGANTRY_ICON_SOURCE', 'cdn'),
  // ---- security (see docs/guide/security.md) ----
  adminToken: envString('HOMEGANTRY_ADMIN_TOKEN', '').trim(),
  authHeader: envString('HOMEGANTRY_AUTH_HEADER', '').trim(),
  trustedProxies: envString('HOMEGANTRY_TRUSTED_PROXIES', ''),
  readonly: envBool('HOMEGANTRY_READONLY', false),
  corsOrigins: envString('HOMEGANTRY_CORS_ORIGINS', '')
    .split(/[\s,]+/)
    .filter(Boolean),
  // ---- Traefik discovery (see docs/guide/traefik.md); credentials are never logged or returned ----
  traefikApiUrl: envString('HOMEGANTRY_TRAEFIK_API_URL', ''),
  traefikApiUsername: envString('HOMEGANTRY_TRAEFIK_API_USERNAME', ''),
  traefikApiPassword: envString('HOMEGANTRY_TRAEFIK_API_PASSWORD', ''),
  traefikApiToken: envString('HOMEGANTRY_TRAEFIK_API_TOKEN', '').trim(),
  traefikTimeout: envNumber('HOMEGANTRY_TRAEFIK_TIMEOUT', 5),
  exposureMap: envString('HOMEGANTRY_EXPOSURE_MAP', ''),
  // ---- HTTP health checks (see docs/guide/health-checks.md) ----
  healthcheck: envBool('HOMEGANTRY_HEALTHCHECK', true),
  healthcheckInterval: envNumber('HOMEGANTRY_HEALTHCHECK_INTERVAL', 60),
  healthcheckTimeout: envNumber('HOMEGANTRY_HEALTHCHECK_TIMEOUT', 5),
  healthcheckConcurrency: envNumber('HOMEGANTRY_HEALTHCHECK_CONCURRENCY', 8),
  healthcheckInsecureTls: envBool('HOMEGANTRY_HEALTHCHECK_INSECURE_TLS', false),
} as const;
