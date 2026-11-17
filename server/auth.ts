/**
 * Who may edit? HomeGantry is read-only unless one of two optional methods authorises a request:
 *
 * - an admin token (`HOMEGANTRY_ADMIN_TOKEN`) sent as `Authorization: Bearer <token>`, or
 * - a forward-auth header (`HOMEGANTRY_AUTH_HEADER`) set by a reverse proxy whose IP is listed in
 *   `HOMEGANTRY_TRUSTED_PROXIES`. From any other IP the header is ignored.
 *
 * `HOMEGANTRY_READONLY=true` switches editing off completely. See docs/guide/security.md.
 */
import crypto from 'node:crypto';
import net from 'node:net';
import type { Request } from 'express';
import { config } from './config.js';

export const MIN_TOKEN_LENGTH = 24;

// ---- trusted proxies ----

/** `::ffff:192.168.1.10` → `192.168.1.10`; strips IPv6 zone ids. */
export function normaliseIp(ip: string | undefined): string {
  if (!ip) return '';
  const noZone = ip.split('%')[0]!;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(noZone);
  return mapped ? mapped[1]! : noZone;
}

export interface TrustedProxies {
  list: net.BlockList;
  size: number;
  invalid: string[];
  has(ip: string | undefined): boolean;
}

/** Parse a comma/space separated list of IPs and CIDRs (`10.0.0.0/8, 192.168.1.2, fd00::/8`). */
export function parseTrustedProxies(value: string): TrustedProxies {
  const list = new net.BlockList();
  const invalid: string[] = [];
  let size = 0;
  for (const entry of value.split(/[\s,]+/).filter(Boolean)) {
    const [addr, prefixStr] = entry.split('/');
    const family = net.isIP(addr ?? '');
    const max = family === 6 ? 128 : 32;
    const prefix = prefixStr === undefined ? max : Number(prefixStr);
    if (
      !family ||
      !Number.isInteger(prefix) ||
      prefix < 0 ||
      prefix > max ||
      (prefixStr !== undefined && !/^\d+$/.test(prefixStr))
    ) {
      invalid.push(entry);
      continue;
    }
    list.addSubnet(addr!, prefix, family === 6 ? 'ipv6' : 'ipv4');
    size++;
  }
  return {
    list,
    size,
    invalid,
    has(ip) {
      const n = normaliseIp(ip);
      const family = net.isIP(n);
      if (!family || size === 0) return false;
      return list.check(n, family === 6 ? 'ipv6' : 'ipv4');
    },
  };
}

export const trustedProxies = parseTrustedProxies(config.trustedProxies);

/**
 * The client's IP, for rate limiting. Requests from a trusted proxy are attributed to the
 * right-most untrusted address in `X-Forwarded-For`; anything else to the socket address
 * (so a client cannot pick its own key by sending the header directly).
 */
export function clientIp(req: Request, proxies: TrustedProxies = trustedProxies): string {
  const remote = normaliseIp(req.socket.remoteAddress);
  if (!proxies.has(remote)) return remote;
  const forwarded = req.get('x-forwarded-for');
  if (!forwarded) return remote;
  const hops = forwarded
    .split(',')
    .map((h) => normaliseIp(h.trim()))
    .filter((h) => net.isIP(h));
  for (let i = hops.length - 1; i >= 0; i--) {
    if (!proxies.has(hops[i])) return hops[i]!;
  }
  return hops[0] ?? remote;
}

/** True when the request arrived directly from a trusted proxy. */
export function fromTrustedProxy(req: Request): boolean {
  return trustedProxies.has(req.socket.remoteAddress);
}

// ---- token ----

/** Constant-time comparison (hashing first makes both sides the same length). */
export function tokensEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const tokenEnabled = config.adminToken.length >= MIN_TOKEN_LENGTH;
const headerEnabled = config.authHeader !== '' && trustedProxies.size > 0;

/** Which methods are usable (both are off in READONLY mode). */
export const authMethods = {
  token: !config.readonly && tokenEnabled,
  header: !config.readonly && headerEnabled,
};

export interface AuthResult {
  canEdit: boolean;
  method: 'token' | 'header' | null;
  /** A bearer token was sent but not accepted (counts as a failed attempt). */
  badToken: boolean;
}

export function authenticate(req: Request): AuthResult {
  const bearer = /^Bearer\s+(.+)$/i.exec(req.get('authorization') ?? '')?.[1]?.trim();
  if (config.readonly) return { canEdit: false, method: null, badToken: false };

  if (authMethods.header && fromTrustedProxy(req)) {
    const user = req.get(config.authHeader)?.trim();
    if (user) return { canEdit: true, method: 'header', badToken: false };
  }
  if (bearer !== undefined) {
    if (authMethods.token && tokensEqual(bearer, config.adminToken)) {
      return { canEdit: true, method: 'token', badToken: false };
    }
    return { canEdit: false, method: null, badToken: true };
  }
  return { canEdit: false, method: null, badToken: false };
}

export const ENABLE_HINT =
  'set HOMEGANTRY_ADMIN_TOKEN (at least 24 characters) or HOMEGANTRY_AUTH_HEADER + HOMEGANTRY_TRUSTED_PROXIES to enable editing';

/** Startup log lines describing the security configuration (errors first). */
export function securitySummary(): { errors: string[]; info: string[] } {
  const errors: string[] = [];
  const info: string[] = [];
  if (config.adminToken && !tokenEnabled) {
    errors.push(
      `HOMEGANTRY_ADMIN_TOKEN is shorter than ${MIN_TOKEN_LENGTH} characters and is ignored (token login disabled)`,
    );
  }
  if (config.authHeader && trustedProxies.size === 0) {
    errors.push(
      'HOMEGANTRY_AUTH_HEADER is set but HOMEGANTRY_TRUSTED_PROXIES is empty: the header is ignored',
    );
  }
  for (const entry of trustedProxies.invalid) {
    errors.push(`HOMEGANTRY_TRUSTED_PROXIES: ignoring invalid entry "${entry}"`);
  }
  if (config.readonly) {
    info.push('read-only mode (HOMEGANTRY_READONLY=true): editing is disabled');
  } else if (!authMethods.token && !authMethods.header) {
    info.push(`editing is disabled: ${ENABLE_HINT}`);
  } else {
    const methods = [
      authMethods.token && 'admin token',
      authMethods.header && `${config.authHeader} header from trusted proxies`,
    ].filter(Boolean);
    info.push(`editing enabled via ${methods.join(' or ')}`);
  }
  return { errors, info };
}
