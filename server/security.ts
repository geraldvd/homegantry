/**
 * Request hardening: security headers, same-origin check, rate limits and the guard that
 * keeps every mutating `/api` request out unless it is authorised (see auth.ts).
 */
import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { config } from './config.js';
import { authenticate, authMethods, clientIp, ENABLE_HINT, fromTrustedProxy } from './auth.js';
import { imgSrc } from './icons.js';

// ---- security headers ----

/**
 * CSP fitting the built client: scripts and styles from our own origin (inline style attributes
 * are used by React for sizes), images as allowed by the icon source (none external when it is
 * `off`), API calls and SSE to our own origin only, and no framing.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  imgSrc(),
  "connect-src 'self'",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
};

// ---- same-origin check ----

/**
 * Browsers send `Origin` (or at least `Referer`) on every cross-site write. Reject writes whose
 * origin is neither our own host nor an explicitly allowed CORS origin. Requests without either
 * header (curl, scripts) are not cross-site requests from a browser and pass this check; they
 * still need to authenticate.
 */
export function isSameOrigin(req: Request, allowedOrigins: readonly string[]): boolean {
  let origin = req.get('origin');
  if (origin === undefined) {
    const referer = req.get('referer');
    if (!referer) return true;
    try {
      origin = new URL(referer).origin;
    } catch {
      return false;
    }
  }
  if (allowedOrigins.includes(origin)) return true;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false; // includes the opaque origin "null"
  }
  const forwardedHost = fromTrustedProxy(req)
    ? req.get('x-forwarded-host')?.split(',')[0]?.trim()
    : undefined;
  const hosts = [req.get('host'), forwardedHost].filter(Boolean);
  return hosts.includes(originHost);
}

// ---- rate limiting ----

export interface Limit {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Requests (or failures) allowed per key and window. */
  max: number;
}

/** Fixed-window counter per key, in memory (one HomeGantry process, small key space). */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: Limit,
    private readonly now: () => number = Date.now,
  ) {}

  private entry(key: string) {
    const t = this.now();
    let e = this.hits.get(key);
    if (!e || e.resetAt <= t) {
      if (this.hits.size > 10_000) this.sweep(t);
      e = { count: 0, resetAt: t + this.limit.windowMs };
      this.hits.set(key, e);
    }
    return e;
  }

  private sweep(t: number) {
    for (const [k, e] of this.hits) if (e.resetAt <= t) this.hits.delete(k);
  }

  /** Count one hit; true when the key is now over its limit. */
  hit(key: string): boolean {
    const e = this.entry(key);
    e.count++;
    return e.count > this.limit.max;
  }

  /** True when the key has used up its limit (without counting). */
  blocked(key: string): boolean {
    return this.entry(key).count >= this.limit.max;
  }

  /** Seconds until the key's window resets. */
  retryAfter(key: string): number {
    return Math.max(1, Math.ceil((this.entry(key).resetAt - this.now()) / 1000));
  }
}

export interface SecurityOptions {
  /** Mutating requests per client IP. Default: 120 per minute. */
  writeLimit?: Limit;
  /** Failed authentication attempts per client IP. Default: 10 per 15 minutes. */
  failedAuthLimit?: Limit;
}

export const DEFAULT_WRITE_LIMIT: Limit = { windowMs: 60_000, max: 120 };
export const DEFAULT_FAILED_AUTH_LIMIT: Limit = { windowMs: 15 * 60_000, max: 10 };

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function tooMany(res: Response, limiter: RateLimiter, key: string, error: string) {
  res.setHeader('Retry-After', String(limiter.retryAfter(key)));
  res.status(429).json({ error });
}

export function createSecurity(options: SecurityOptions = {}) {
  const writes = new RateLimiter(options.writeLimit ?? DEFAULT_WRITE_LIMIT);
  const failures = new RateLimiter(options.failedAuthLimit ?? DEFAULT_FAILED_AUTH_LIMIT);

  /** Authenticate, counting failed token attempts; sends 401/429 and returns null on failure. */
  function checkAuth(req: Request, res: Response) {
    const ip = clientIp(req);
    if (failures.blocked(ip)) {
      tooMany(res, failures, ip, 'too many failed authentication attempts');
      return null;
    }
    const auth = authenticate(req);
    if (auth.badToken) {
      failures.hit(ip);
      res.status(401).json({ error: 'invalid token' });
      return null;
    }
    return auth;
  }

  /** Mounted on `/api`: every non-GET/HEAD/OPTIONS request must pass all checks. */
  const guardMutations: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const ip = clientIp(req);
    if (writes.hit(ip)) return tooMany(res, writes, ip, 'too many requests');
    if (!isSameOrigin(req, config.corsOrigins)) {
      res.status(403).json({ error: 'cross-origin request rejected' });
      return;
    }
    if (config.readonly) {
      res.status(403).json({ error: 'read-only mode: editing is disabled' });
      return;
    }
    if (!authMethods.token && !authMethods.header) {
      res.status(403).json({ error: 'editing is disabled', hint: ENABLE_HINT });
      return;
    }
    const auth = checkAuth(req, res);
    if (!auth) return;
    if (!auth.canEdit) {
      res.status(401).json({ error: 'authentication required' });
      return;
    }
    next();
  };

  /**
   * For reads that need the same rights as editing (admin token or trusted auth header). Without
   * them the request is refused with the status a write would get (403 when editing is off, 401
   * otherwise). Responses are never cached.
   */
  function requireEditRights(req: Request, res: Response, next: NextFunction, readonly: string) {
    if (config.readonly) {
      res.status(403).json({ error: readonly });
      return;
    }
    if (!authMethods.token && !authMethods.header) {
      res.status(403).json({ error: 'editing is disabled', hint: ENABLE_HINT });
      return;
    }
    const auth = checkAuth(req, res);
    if (!auth) return;
    if (!auth.canEdit) {
      res.status(401).json({ error: 'authentication required' });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    next();
  }

  /** Mounted on `GET /api/services`: `?includeHidden=true` also lists hidden services. */
  const guardHiddenServices: RequestHandler = (req, res, next) => {
    if (req.query.includeHidden === undefined || req.query.includeHidden === 'false') return next();
    requireEditRights(req, res, next, 'read-only mode: hidden services are not listed');
  };

  /** Mounted on `GET /api/kb/coverage`: which images a lab runs is for editors only. */
  const guardCoverage: RequestHandler = (req, res, next) => {
    requireEditRights(req, res, next, 'read-only mode: the coverage report is not available');
  };

  /** `GET /api/auth`: what the current request may do (the UI uses it to unlock editing). */
  const authStatus: RequestHandler = (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const auth = checkAuth(req, res);
    if (!auth) return;
    res.json({
      canEdit: auth.canEdit,
      method: auth.method,
      readonly: config.readonly,
      methods: { ...authMethods },
    });
  };

  return { guardMutations, guardHiddenServices, guardCoverage, authStatus };
}

// ---- errors ----

/** JSON errors without stack traces (Express would otherwise render them as HTML). */
export const jsonErrors: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = (err as { status?: number }).status ?? 500;
  const error =
    status === 413
      ? 'request body too large'
      : status === 400
        ? 'invalid JSON body'
        : status < 500
          ? 'bad request'
          : 'internal error';
  if (status >= 500) console.error('[homegantry] request failed:', (err as Error).message);
  res.status(status).json({ error });
};
