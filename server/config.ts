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
} as const;
