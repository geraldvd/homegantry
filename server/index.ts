import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { createApp } from './app.js';
import { startWatching } from './docker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Serve static files in production
const clientDir = path.resolve(__dirname, '..', 'client');
const app = createApp(clientDir);

app.listen(config.port, () => {
  console.log(`[homegantry] listening on http://localhost:${config.port}`);
  void startWatching();
});
