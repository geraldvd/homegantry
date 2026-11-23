import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildKnowledgeBase,
  checkDirectory,
  KB_DIR,
  loadIconSlugs,
  readEntries,
  TEMPLATE_FILE,
} from '../../scripts/kb-lib.js';
import { makeTempDir } from '../helpers.js';

const SLUGS = new Set(['docker', 'jellyfin']);

const valid = (name: string, image: string, alias: string, icon = 'docker') =>
  `name: ${name}\ndescription: An example\nicon: ${icon}\ncategory: Media\npatterns:\n  - ${image}\naliases:\n  - ${alias}\n`;

function kbDir(files: Record<string, string>): string {
  const dir = makeTempDir();
  for (const [file, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, file), content);
  }
  return dir;
}

const messages = (dir: string) => checkDirectory(dir, SLUGS).map((i) => i.message);

describe('the shipped knowledge base', () => {
  it('passes every check', () => {
    expect(checkDirectory(KB_DIR, loadIconSlugs())).toEqual([]);
  });

  it('has an entry for every service the milestone names', () => {
    const names = readEntries(KB_DIR).entries.map((e) => e.name);
    expect(names).toEqual(
      expect.arrayContaining(['Dawarich', 'AirTrail', 'Komodo', 'Beszel', 'Karakeep', 'Proxmox VE']),
    );
  });

  it('pins the icon metadata to one upstream commit', () => {
    const meta = JSON.parse(
      fs.readFileSync(path.join(KB_DIR, '_meta/dashboard-icons.json'), 'utf-8'),
    ) as { repository: string; commit: string };
    expect(meta.repository).toBe('homarr-labs/dashboard-icons');
    expect(meta.commit).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe('kb:check', () => {
  it('accepts a valid entry', () => {
    expect(messages(kbDir({ 'one.yaml': valid('One', 'example/one', 'one') }))).toEqual([]);
  });

  it('fails on an unknown icon slug', () => {
    const dir = kbDir({ 'one.yaml': valid('One', 'example/one', 'one', 'no-such-icon') });
    expect(messages(dir)).toEqual([expect.stringContaining('unknown icon slug "no-such-icon"')]);
  });

  it('allows an entry without an icon', () => {
    const dir = kbDir({
      'one.yaml': 'name: One\ndescription: An example\ncategory: Media\naliases: [one]\n',
    });
    expect(messages(dir)).toEqual([]);
  });

  it.each([
    ['a missing field', 'name: One\ncategory: Media\naliases: [one]\n'],
    ['an unknown field', `${valid('One', 'example/one', 'one')}secret: nope\n`],
    ['a wrong type', 'name: One\ndescription: x\ncategory: Media\ndefaultPort: web\naliases: [a]\n'],
    ['a port out of range', 'name: One\ndescription: x\ncategory: M\ndefaultPort: 70000\naliases: [a]\n'],
    ['no way to match', 'name: One\ndescription: An example\ncategory: Media\n'],
    ['a tag in a pattern', valid('One', 'example/one:latest', 'one')],
    ['broken YAML', 'name: [unclosed\n'],
  ])('fails on %s', (_case, content) => {
    expect(messages(kbDir({ 'one.yaml': content })).length).toBeGreaterThan(0);
  });

  it('fails on a bad file name', () => {
    const dir = kbDir({ 'Not_Valid.yaml': valid('One', 'example/one', 'one') });
    expect(messages(dir)).toEqual([expect.stringContaining('file name')]);
  });

  it('fails on a duplicate pattern across entries', () => {
    const dir = kbDir({
      'one.yaml': valid('One', 'example/same', 'one'),
      'two.yaml': valid('Two', 'Example/Same', 'two'),
    });
    expect(messages(dir)).toEqual([expect.stringContaining('duplicate pattern')]);
  });

  it('treats Docker Hub spellings of a pattern as duplicates', () => {
    const dir = kbDir({
      'one.yaml': valid('One', 'redis', 'one'),
      'two.yaml': valid('Two', 'docker.io/library/redis', 'two'),
    });
    expect(messages(dir)).toEqual([expect.stringContaining('duplicate pattern')]);
  });

  it('fails on a duplicate alias, ignoring case and separators', () => {
    const dir = kbDir({
      'one.yaml': valid('One', 'example/one', 'my-app'),
      'two.yaml': valid('Two', 'example/two', 'My_App'),
    });
    expect(messages(dir)).toEqual([expect.stringContaining('duplicate alias')]);
  });

  it('fails on a value listed twice in one entry', () => {
    const dir = kbDir({
      'one.yaml':
        'name: One\ndescription: An example\ncategory: Media\naliases:\n  - one\n  - one\n',
    });
    expect(messages(dir)).toEqual([expect.stringContaining('listed twice')]);
  });

  it('does not treat the template as a service', () => {
    const template = fs.readFileSync(path.join(KB_DIR, TEMPLATE_FILE), 'utf-8');
    const dir = kbDir({ [TEMPLATE_FILE]: template });
    expect(readEntries(dir).entries).toEqual([]);
  });
});

describe('contribution template', () => {
  it('passes kb:check when copied to a new service file', () => {
    const template = fs.readFileSync(path.join(KB_DIR, TEMPLATE_FILE), 'utf-8');
    const dir = kbDir({ 'my-service.yaml': template });
    expect(checkDirectory(dir, loadIconSlugs())).toEqual([]);
    expect(readEntries(dir).entries).toHaveLength(1);
  });

  it('uses only example data', () => {
    const template = fs.readFileSync(path.join(KB_DIR, TEMPLATE_FILE), 'utf-8');
    expect(template).toContain('example/my-service');
  });
});

describe('kb:build', () => {
  it('writes the entries as JSON', () => {
    const dir = kbDir({ 'one.yaml': valid('One', 'example/one', 'one') });
    const out = path.join(makeTempDir(), 'nested/kb.json');
    expect(buildKnowledgeBase(out, dir)).toBe(1);
    expect(JSON.parse(fs.readFileSync(out, 'utf-8'))).toEqual([
      expect.objectContaining({ id: 'one', name: 'One', patterns: ['example/one'] }),
    ]);
  });

  it('refuses to build from an invalid entry', () => {
    const dir = kbDir({ 'one.yaml': 'name: One\n' });
    expect(() => buildKnowledgeBase(path.join(makeTempDir(), 'kb.json'), dir)).toThrow('one.yaml');
  });
});
