import path from 'node:path';
import express, { type Express } from 'express';
import cors from 'cors';
import { config } from './config.js';
import { router } from './routes.js';
import { createSecurity, jsonErrors, securityHeaders, type SecurityOptions } from './security.js';

/** Maximum JSON body size for API requests. */
export const BODY_LIMIT = '16kb';

/**
 * Build the Express application (API routes, static client, SPA fallback).
 * Kept separate from `index.ts` so tests can mount it without listening on a port.
 */
export function createApp(clientDir: string, options: SecurityOptions = {}): Express {
  const app = express();
  const security = createSecurity(options);

  app.disable('x-powered-by');
  app.use(securityHeaders);
  // Cross-origin access only when explicitly configured.
  if (config.corsOrigins.length > 0) {
    app.use(
      '/api',
      cors({
        origin: [...config.corsOrigins],
        methods: ['GET', 'PUT', 'POST', 'PATCH', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization'],
      }),
    );
  }
  // Authorisation runs before the body is parsed.
  app.use('/api', security.guardMutations);
  app.use('/api', express.json({ limit: BODY_LIMIT }));
  app.get('/api/auth', security.authStatus);
  app.use(router);

  // Serve static files in production
  app.use(express.static(clientDir));

  // SPA fallback: serve index.html for non-API routes
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDir, 'index.html'));
  });

  app.use(jsonErrors);
  return app;
}
