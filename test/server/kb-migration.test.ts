import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findByAlias, findByImage } from '../../server/knowledge-base.js';
import type { KnownService } from '../../server/types.js';

const legacy = JSON.parse(
  fs.readFileSync(path.resolve('test/fixtures/kb/known-services.legacy.json'), 'utf-8'),
) as KnownService[];

/** The matching of the old `known-services.json`: first entry with a substring hit. */
function legacyMatch(image: string): string | undefined {
  const repo = image.split(':')[0]!.split('@')[0]!.toLowerCase();
  return legacy.find((ks) => ks.patterns.some((p) => repo.includes(p.toLowerCase())))?.name;
}

/**
 * Images of old entries whose result changes on purpose (#13 c): the old substring rule gave them
 * to an earlier entry whose pattern was merely contained in the name.
 */
const INTENDED_CHANGES: Record<string, { before: string; after: string }> = {
  'fbonalair/traefik-crowdsec-bouncer': { before: 'Traefik', after: 'CrowdSec Bouncer' },
  'ghcr.io/crowdsecurity/traefik-bouncer': { before: 'Traefik', after: 'CrowdSec Bouncer' },
  // M3 gate: the Nginx Proxy Manager image by jlesage was Nginx by substring; it is NPM now.
  'jlesage/nginx-proxy-manager': { before: 'Nginx', after: 'Nginx Proxy Manager' },
};

/** Real images the old rule matched by accident and that are now unrecognised (#13 c). */
const LOOK_ALIKES: Array<[image: string, before: string]> = [
  ['oliver006/redis_exporter', 'Redis'],
  ['prometheuscommunity/postgres-exporter', 'PostgreSQL'],
  ['percona/mongodb_exporter', 'MongoDB'],
  ['mongo-express', 'MongoDB'],
  ['redis/redisinsight', 'Redis'],
  ['rediscommander/redis-commander', 'Redis'],
  ['nginx/nginx-prometheus-exporter', 'Nginx'],
  ['traefik/whoami', 'Traefik'],
  ['grafana/grafana-image-renderer', 'Grafana'],
  ['linuxserver/plex-meta-manager', 'Plex'],
];

/** Real variants the old rule found by substring; they keep working through explicit patterns. */
const KEPT_VARIANTS: Array<[image: string, name: string]> = [
  ['ghcr.io/moghtech/komodo-core:latest', 'Komodo'],
  ['ghcr.io/moghtech/komodo-periphery:latest', 'Komodo'],
  ['ghcr.io/mbecker20/komodo-core:latest', 'Komodo'],
  ['mysql/mysql-server:8', 'MySQL'],
  ['nginxinc/nginx-unprivileged:stable', 'Nginx'],
  ['haproxytech/haproxy-debian:3', 'HAProxy'],
  ['nextcloud/all-in-one:latest', 'Nextcloud'],
  // M3 gate follow-ups (review of #43): real variants that had lost their match.
  ['redis/redis-stack:latest', 'Redis'],
  ['redis/redis-stack-server:7.4.0-v0', 'Redis'],
  ['nginxproxy/nginx-proxy:1.6', 'Nginx'],
  ['jwilder/nginx-proxy:latest', 'Nginx'],
];

function variants(pattern: string): string[] {
  const hasRegistry = pattern.split('/')[0]!.includes('.');
  return [
    pattern,
    `${pattern}:1.2.3`,
    `${pattern}:latest`,
    `${pattern}@sha256:0123456789abcdef`,
    ...(hasRegistry ? [] : [`docker.io/${pattern}:1`, `ghcr.io/${pattern}:1`]),
  ];
}

describe('knowledge-base migration from known-services.json', () => {
  it('starts from the 121 old entries', () => {
    expect(legacy).toHaveLength(121);
  });

  describe.each(legacy.map((e) => [e.name, e] as const))('%s', (_name, entry) => {
    it('still matches the same images', () => {
      for (const pattern of entry.patterns) {
        for (const image of variants(pattern)) {
          const before = legacyMatch(image);
          const change = INTENDED_CHANGES[pattern];
          const expected = change ? change.after : before;
          expect(findByImage(image)?.name, image).toBe(expected);
        }
      }
    });

    it('still matches the same aliases', () => {
      for (const alias of entry.aliases) {
        const first = legacy.find((ks) => ks.aliases.includes(alias));
        expect(findByAlias(alias)?.name, alias).toBe(first?.name);
      }
    });

    it('keeps its category, port and infrastructure flag', () => {
      const current = findByAlias(entry.aliases[0]!)!;
      expect(current).toMatchObject({
        category: entry.category,
        description: entry.description,
      });
      expect(current.defaultPort).toBe(entry.defaultPort);
      expect(Boolean(current.infrastructure)).toBe(Boolean(entry.infrastructure));
    });
  });

  it.each(LOOK_ALIKES)('%s (was %s) is no longer recognised', (image, before) => {
    expect(legacyMatch(image)).toBe(before);
    expect(findByImage(image)).toBeUndefined();
  });

  it.each(KEPT_VARIANTS)('%s is still %s', (image, name) => {
    expect(legacyMatch(image)).toBe(name);
    expect(findByImage(image)?.name).toBe(name);
  });

  it('lists every intended change with its old result', () => {
    for (const [image, { before, after }] of Object.entries(INTENDED_CHANGES)) {
      expect(legacyMatch(image), image).toBe(before);
      expect(findByImage(image)?.name, image).toBe(after);
    }
  });
});
