import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { router } from './routes.js';
import { startWatching } from './docker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json());
app.use(router);

// Serve static files in production
const clientDir = path.resolve(__dirname, '..', 'client');
app.use(express.static(clientDir));

// SPA fallback: serve index.html for non-API routes
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDir, 'index.html'));
});

app.listen(config.port, () => {
  console.log(`[homegantry] listening on http://localhost:${config.port}`);
  void startWatching();
});
