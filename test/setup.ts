import { afterEach } from 'vitest';
import { cleanupTempDirs } from './helpers.js';

// Make every test file start from a clean, deterministic environment:
// no HOMEGANTRY_* (or DOCKER_HOST) variables leak in from the developer's shell or CI.
for (const key of Object.keys(process.env)) {
  if (key.startsWith('HOMEGANTRY_') || key === 'DOCKER_HOST') delete process.env[key];
}

// Remove the temporary data directories created by loadServer().
afterEach(() => {
  cleanupTempDirs();
});
