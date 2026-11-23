/**
 * URL safety shared by the API, discovery and health checks. Service URLs come from container
 * labels, Traefik, stored overrides and manual entries; only http(s) URLs without credentials
 * may leave the server, and logs never contain userinfo or query strings.
 */

const MAX_URL_LENGTH = 2048;
const ICON_SLUG = /^[a-z0-9][a-z0-9._-]{0,99}$/i;

function parseHttpUrl(value: unknown): URL | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return undefined;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : undefined;
  } catch {
    return undefined;
  }
}

/** The normalised http(s) URL without userinfo, or `undefined` for anything else. */
export function safeHttpUrl(value: unknown): string | undefined {
  const url = parseHttpUrl(value);
  if (!url) return undefined;
  url.username = '';
  url.password = '';
  const href = url.href;
  // The URL parser adds a "/" to bare origins; keep the value as the user wrote it.
  const bareOrigin = url.pathname === '/' && !url.search && !url.hash;
  return bareOrigin && !(value as string).trim().endsWith('/') ? href.slice(0, -1) : href;
}

/** A service link: a safe http(s) URL, or "#" for "no link". */
export function safeServiceUrl(value: unknown): string {
  return safeHttpUrl(value) ?? '#';
}

/** A dashboard-icons slug or safe http(s) image URL; empty (letter fallback) for anything else. */
export function safeIcon(value: unknown): string {
  if (typeof value === 'string' && ICON_SLUG.test(value)) return value;
  return safeHttpUrl(value) ?? '';
}

/** Form of a URL that is safe to log: no userinfo, query string or fragment. */
export function redactUrl(value: unknown): string {
  const url = parseHttpUrl(value);
  if (!url) return '[invalid url]';
  return `${url.origin}${url.pathname === '/' ? '' : url.pathname}`;
}
