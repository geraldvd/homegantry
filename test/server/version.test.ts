import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { readVersion } from '../../server/version.js';
import { loadApp, makeTempDir } from '../helpers.js';

const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf-8')) as {
  version: string;
};

function writePackage(dir: string, content: unknown): void {
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(content));
}

describe('readVersion', () => {
  it('reads the version from the repository package.json', () => {
    expect(readVersion(path.resolve('server'))).toBe(pkg.version);
  });

  it('is a semantic version', () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('walks up from a nested build directory (dist/server in the image)', () => {
    const root = makeTempDir();
    const nested = path.join(root, 'dist', 'server');
    fs.mkdirSync(nested, { recursive: true });
    writePackage(root, { name: 'homegantry', version: '1.2.3' });
    expect(readVersion(nested)).toBe('1.2.3');
  });

  it("skips another project's package.json on the way up", () => {
    const root = makeTempDir();
    const nested = path.join(root, 'inner');
    fs.mkdirSync(nested);
    writePackage(nested, { name: 'something-else', version: '9.9.9' });
    writePackage(root, { name: 'homegantry', version: '0.4.0' });
    expect(readVersion(nested)).toBe('0.4.0');
  });

  it('ignores a package.json that is not valid JSON', () => {
    const root = makeTempDir();
    const nested = path.join(root, 'inner');
    fs.mkdirSync(nested);
    fs.writeFileSync(path.join(nested, 'package.json'), '{ not json');
    writePackage(root, { name: 'homegantry', version: '0.5.1' });
    expect(readVersion(nested)).toBe('0.5.1');
  });

  it('says "unknown" for a version that is not semver', () => {
    const root = makeTempDir();
    writePackage(root, { name: 'homegantry', version: 'latest<script>' });
    expect(readVersion(root)).toBe('unknown');
  });

  it('says "unknown" when no package.json is found', () => {
    expect(readVersion(path.parse(process.cwd()).root)).toBe('unknown');
  });
});

describe('the version over HTTP', () => {
  it('is part of GET /api/health', async () => {
    const { app } = await loadApp([]);
    const res = await request(app).get('/api/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', docker: 'connected', version: pkg.version });
  });

  it('is part of GET /api/ui-config', async () => {
    const { app } = await loadApp([]);
    const res = await request(app).get('/api/ui-config').expect(200);
    expect(res.body.version).toBe(pkg.version);
  });

  it('needs no edit rights (it is not sensitive)', async () => {
    const { app } = await loadApp([], {
      HOMEGANTRY_ADMIN_TOKEN: 'change-me-admin-token-0123456789',
    });
    const res = await request(app).get('/api/health').expect(200);
    expect(res.body.version).toBe(pkg.version);
  });
});
