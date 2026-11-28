import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => fs.readFileSync(path.resolve(file), 'utf-8');
const readJson = (file: string) => JSON.parse(read(file)) as Record<string, unknown>;

const pkg = readJson('package.json') as { version: string };
const config = readJson('release-please-config.json') as {
  packages: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
};
const manifest = readJson('.release-please-manifest.json') as Record<string, string>;
const root = config.packages['.']!;

/** Mirrors release-please's version-header search (src/updaters/changelog.ts). */
const RELEASE_PLEASE_HEADER = /\n###? v?[0-9[]/s;

describe('release-please', () => {
  it('releases the repository root as a Node package with plain vX.Y.Z tags', () => {
    expect(Object.keys(config.packages)).toEqual(['.']);
    expect(root['release-type']).toBe('node');
    expect(config['include-component-in-tag']).toBe(false);
    expect(config['include-v-in-tag'] ?? true).toBe(true);
  });

  it('stays on 0.x: breaking changes bump the minor version, features the minor', () => {
    expect(config['bump-minor-pre-major']).toBe(true);
    expect(config['bump-patch-for-minor-pre-major'] ?? false).toBe(false);
  });

  it('makes the first release exactly 0.2.0', () => {
    // A manifest version of 0.0.0 means "never released": release-please then uses
    // initial-version instead of bumping, whatever the commit types are.
    expect(manifest).toEqual({ '.': '0.0.0' });
    expect(root['initial-version']).toBe('0.2.0');
    expect(pkg.version).toBe('0.2.0');
  });

  it('starts the first changelog after the last pre-release-engineering commit', () => {
    expect(config['bootstrap-sha']).toMatch(/^[0-9a-f]{40}$/);
  });

  it('keeps the Dockerfile version label in step with package.json', () => {
    expect(root['extra-files']).toContainEqual({ type: 'generic', path: 'Dockerfile' });
    const dockerfile = read('Dockerfile');
    const block = /# x-release-please-start-version\n(.*?)\n# x-release-please-end/s.exec(
      dockerfile,
    );
    expect(block?.[1]).toBe(`ARG VERSION=${pkg.version}`);
    expect(dockerfile).toContain('org.opencontainers.image.version="${VERSION}"');
  });

  it('keeps CHANGELOG.md out of Prettier (release-please writes it)', () => {
    expect(read('.prettierignore').split('\n')).toContain('CHANGELOG.md');
  });
});

describe('CHANGELOG.md', () => {
  const changelog = read('CHANGELOG.md');

  it('starts with the header release-please keeps', () => {
    expect(changelog.startsWith('# Changelog\n')).toBe(true);
  });

  it('summarises milestones M0 to M4 as part of 0.2.0', () => {
    const summary = /\n### 0\.2\.0 [^\n]*\n([\s\S]*)$/.exec(changelog)?.[1] ?? '';
    for (const milestone of ['M0', 'M1', 'M2', 'M3', 'M4']) {
      expect(summary, milestone).toContain(`**${milestone}`);
    }
  });

  it('gives release-please a version header to insert the 0.2.0 entry above', () => {
    // Without one, release-please would demote "# Changelog" and add a second header.
    const index = changelog.search(RELEASE_PLEASE_HEADER);
    expect(index).toBeGreaterThan(0);
    expect(changelog.slice(index)).toMatch(/^\n### 0\.2\.0 /);
  });

  it('has no version section that was not released yet', () => {
    expect(changelog).not.toMatch(/\n## \[?\d/);
  });
});
