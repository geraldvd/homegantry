import path from 'node:path';
import express, { type Express } from 'express';
import cors from 'cors';
import { router } from './routes.js';

/**
 * Build the Express application (API routes, static client, SPA fallback).
 * Kept separate from `index.ts` so tests can mount it without listening on a port.
 */
export function createApp(clientDir: string): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(router);

  // Serve static files in production
  app.use(express.static(clientDir));

  // SPA fallback: serve index.html for non-API routes
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDir, 'index.html'));
  });

  return app;
}
