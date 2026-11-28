import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * The HomeGantry version from the nearest `package.json` named `homegantry`, walking up from
 * `start`: `server/` in development, `dist/server/` in the image (package.json sits in /app).
 * Anything that is not a semantic version becomes `unknown`.
 */
export function readVersion(start = path.dirname(fileURLToPath(import.meta.url))): string {
  let dir = path.resolve(start);
  for (;;) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        name?: unknown;
        version?: unknown;
      };
      if (pkg.name === 'homegantry') {
        return typeof pkg.version === 'string' && SEMVER.test(pkg.version)
          ? pkg.version
          : 'unknown';
      }
    } catch {
      // No (readable) package.json here: keep looking.
    }
    const parent = path.dirname(dir);
    if (parent === dir) return 'unknown';
    dir = parent;
  }
}

/** The running version (`/api/health`, `/api/ui-config`, the UI footer). Not sensitive. */
export const version = readVersion();
