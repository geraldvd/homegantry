import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { createApp } from './app.js';
import { securitySummary } from './auth.js';
import { startWatching } from './docker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Serve static files in production
const clientDir = path.resolve(__dirname, '..', 'client');
const app = createApp(clientDir);

const { errors, info } = securitySummary();
for (const line of errors) console.error(`[homegantry] ${line}`);
for (const line of info) console.log(`[homegantry] ${line}`);

app.listen(config.port, () => {
  console.log(`[homegantry] listening on http://localhost:${config.port}`);
  void startWatching();
});
