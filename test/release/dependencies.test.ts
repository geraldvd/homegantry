import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { checkPrTitle } from '../../scripts/pr-title.js';

interface Update {
  'package-ecosystem': string;
  directory: string;
  schedule: { interval: string };
  'commit-message'?: { prefix: string; 'prefix-development'?: string; include?: string };
  groups?: Record<
    string,
    { 'dependency-type'?: string; patterns?: string[]; 'update-types'?: string[] }
  >;
}

const read = (file: string) => fs.readFileSync(path.resolve(file), 'utf-8');
const dependabot = parse(read('.github/dependabot.yml')) as { version: number; updates: Update[] };
const byEcosystem = (name: string) =>
  dependabot.updates.find((u) => u['package-ecosystem'] === name)!;

describe('Dependabot', () => {
  it('covers npm, the Dockerfile base images and GitHub Actions', () => {
    expect(dependabot.version).toBe(2);
    expect(dependabot.updates.map((u) => u['package-ecosystem']).sort()).toEqual([
      'docker',
      'github-actions',
      'npm',
    ]);
  });

  it.each(['npm', 'docker', 'github-actions'])('checks %s weekly from the root', (name) => {
    const update = byEcosystem(name);
    expect(update.directory).toBe('/');
    expect(update.schedule.interval).toBe('weekly');
  });

  it('groups npm minor and patch updates into one PR for runtime and one for dev dependencies', () => {
    const groups = Object.values(byEcosystem('npm').groups ?? {});
    for (const type of ['production', 'development']) {
      expect(groups).toContainEqual({
        'dependency-type': type,
        'update-types': ['minor', 'patch'],
      });
    }
  });

  it.each(['docker', 'github-actions'])('groups all %s updates into one PR', (name) => {
    expect(Object.values(byEcosystem(name).groups ?? {})).toContainEqual({ patterns: ['*'] });
  });

  it.each(['npm', 'docker', 'github-actions'])(
    'gives %s PRs a Conventional Commit title (they pass the PR-title check)',
    (name) => {
      const message = byEcosystem(name)['commit-message']!;
      expect(message.include).toBe('scope');
      const prefixes = [message.prefix, message['prefix-development']].filter(Boolean);
      for (const prefix of prefixes) {
        for (const scope of ['deps', 'deps-dev']) {
          expect(checkPrTitle(`${prefix}(${scope}): bump example from 1.0.0 to 1.1.0`)).toEqual({
            ok: true,
          });
        }
      }
    },
  );

  it('releases runtime and base-image updates as fixes, not dev tooling', () => {
    expect(byEcosystem('npm')['commit-message']).toMatchObject({
      prefix: 'fix',
      'prefix-development': 'chore',
    });
    expect(byEcosystem('docker')['commit-message']?.prefix).toBe('fix');
    expect(byEcosystem('github-actions')['commit-message']?.prefix).toBe('ci');
  });
});

describe('Dockerfile base images', () => {
  const froms = read('Dockerfile')
    .split('\n')
    .filter((line) => line.startsWith('FROM '));

  it('are pinned by digest so updates arrive as reviewed PRs', () => {
    expect(froms).toHaveLength(2);
    for (const line of froms) expect(line).toMatch(/node:\d+-alpine@sha256:[0-9a-f]{64}/);
  });

  it('use the same Node image in both stages', () => {
    const images = froms.map((line) => /node:\S+/.exec(line)?.[0]);
    expect(new Set(images).size).toBe(1);
  });
});
