import { describe, expect, it } from 'vitest';
import { groupServices, otherGroupKey } from '../../src/lib/grouping';
import { matchesQuery, normalise, searchServices, urlHost } from '../../src/lib/search';
import { serviceStatus } from '../../src/lib/status';
import type { Service } from '../../src/types';

function svc(name: string, extra: Partial<Service> = {}): Service {
  return {
    id: `id-${name.toLowerCase().replace(/\W+/g, '-')}`,
    source: 'docker',
    name,
    description: '',
    url: '#',
    icon: '',
    category: 'Other',
    status: 'running',
    hidden: false,
    sortOrder: 0,
    ...extra,
  };
}

describe('search', () => {
  it('normalises case and accents', () => {
    expect(normalise('Médiathèque ÉCOLE')).toBe('mediatheque ecole');
  });

  it('extracts the URL host only for http(s) links', () => {
    expect(urlHost('https://Jellyfin.Example.com:8443/web')).toBe('jellyfin.example.com');
    expect(urlHost('#')).toBe('');
    expect(urlHost('javascript:alert(1)')).toBe('');
  });

  it.each([
    ['name', 'jelly', svc('Jellyfin')],
    ['description', 'media system', svc('X', { description: 'The free software media system' })],
    ['category', 'downloads', svc('X', { category: 'Downloads' })],
    ['stack', 'arr', svc('X', { stack: 'arr' })],
    ['URL host', 'nas.example', svc('X', { url: 'https://nas.example.com' })],
    ['accents in the data', 'mediatheque', svc('Médiathèque')],
    ['accents in the query', 'café', svc('Cafe')],
    ['any case', 'JELLYFIN', svc('jellyfin')],
  ])('matches on %s', (_field, query, service) => {
    expect(matchesQuery(service, query)).toBe(true);
  });

  it('does not match the URL scheme or path', () => {
    const s = svc('X', { url: 'https://x.example.com/admin' });
    expect(matchesQuery(s, 'https')).toBe(false);
    expect(matchesQuery(s, 'admin')).toBe(false);
  });

  it('needs every word of the query to match somewhere', () => {
    const s = svc('Jellyfin', { category: 'Media' });
    expect(matchesQuery(s, 'jelly media')).toBe(true);
    expect(matchesQuery(s, 'jelly books')).toBe(false);
  });

  it('ranks name matches first: prefix, then contains, then other fields', () => {
    const list = [
      svc('Plex', { category: 'Media' }),
      svc('Home Media Server'),
      svc('Mediathek'),
      svc('Zeta', { description: 'media library' }),
    ];
    expect(searchServices(list, 'media').map((s) => s.name)).toEqual([
      'Mediathek',
      'Home Media Server',
      'Plex',
      'Zeta',
    ]);
  });

  it('breaks ties by sort order, then name', () => {
    const list = [svc('Beta', { sortOrder: 0 }), svc('Alpha', { sortOrder: 1 }), svc('Aaron')];
    expect(searchServices(list, 'a').map((s) => s.name)).toEqual(['Aaron', 'Alpha', 'Beta']);
  });

  it('an empty query returns nothing to rank', () => {
    expect(searchServices([svc('A')], '   ')).toEqual([]);
  });
});

describe('grouping', () => {
  const list = [
    svc('Sonarr', { category: 'Media', stack: 'arr', url: 'http://192.168.1.100:8989' }),
    svc('Radarr', { category: 'Media', stack: 'arr', url: 'http://192.168.1.100:7878' }),
    svc('Jellyfin', { category: 'Media', stack: 'media', url: 'https://jellyfin.example.com' }),
    svc('Grafana', { category: 'Monitoring', url: 'http://192.168.1.20:3000' }),
    svc('Mystery', { category: '' }),
    svc('Router', { source: 'manual', category: 'Uncategorized', url: 'http://192.168.1.1' }),
    svc('Thing', { category: 'Other', stack: 'misc' }),
  ];
  const names = (groups: ReturnType<typeof groupServices>) =>
    groups.map((g) => [g.label, g.services.map((s) => s.name)]);

  it('groups by category with "Other" (empty, Other, Uncategorized) last', () => {
    expect(names(groupServices(list, 'category', {}))).toEqual([
      ['Media', ['Jellyfin', 'Radarr', 'Sonarr']],
      ['Monitoring', ['Grafana']],
      ['Other', ['Mystery', 'Router', 'Thing']],
    ]);
  });

  it('groups by stack, using the stack display name, services without a stack in "Other"', () => {
    expect(
      names(groupServices(list, 'stack', { arr: { visible: true, displayName: 'Arr suite' } })),
    ).toEqual([
      ['Arr suite', ['Radarr', 'Sonarr']],
      ['media', ['Jellyfin']],
      ['misc', ['Thing']],
      ['Other', ['Grafana', 'Mystery', 'Router']],
    ]);
  });

  it('groups by URL host (port ignored, numeric order), services without a link in "Other"', () => {
    expect(names(groupServices(list, 'host', {}))).toEqual([
      ['192.168.1.1', ['Router']],
      ['192.168.1.20', ['Grafana']],
      ['192.168.1.100', ['Radarr', 'Sonarr']],
      ['jellyfin.example.com', ['Jellyfin']],
      ['Other', ['Mystery', 'Thing']],
    ]);
  });

  it('orders within a group by sort order, then name', () => {
    const groups = groupServices(
      [
        svc('B', { category: 'X', sortOrder: 0 }),
        svc('A', { category: 'X', sortOrder: 5 }),
        svc('C', { category: 'X', sortOrder: -1 }),
        svc('a2', { category: 'X', sortOrder: 0 }),
      ],
      'category',
      {},
    );
    expect(groups[0]!.services.map((s) => s.name)).toEqual(['C', 'a2', 'B', 'A']);
  });

  it('keeps the fallback group key distinct from a host or stack called "other"', () => {
    const groups = groupServices([svc('A', { stack: 'other' }), svc('B')], 'stack', {});
    expect(groups.map((g) => g.key)).toEqual(['stack:other', otherGroupKey('stack')]);
    expect(otherGroupKey('stack')).not.toBe(otherGroupKey('category'));
  });
});

describe('#33 one status per card', () => {
  const checkedAt = '2026-01-01T12:00:00.000Z';

  it('a stopped container is "Stopped", whatever the last health result was', () => {
    const view = serviceStatus(
      svc('A', { status: 'stopped', health: { status: 'up', checkedAt } }),
    );
    expect(view?.label).toBe('Stopped');
  });

  it('a running container with a failed check is "Down" and says the container runs', () => {
    const view = serviceStatus(
      svc('A', { health: { status: 'down', checkedAt, reason: 'timeout' } }),
    );
    expect(view?.label).toBe('Down');
    expect(view?.detail).toMatch(/container is running/i);
    expect(view?.detail).toMatch(/timed out/);
  });

  it('a running container without a result is "Running"', () => {
    expect(serviceStatus(svc('A'))?.label).toBe('Running');
    expect(serviceStatus(svc('A', { healthcheckDisabled: true }))?.detail).toMatch(/off/);
  });

  it('a health result decides for Traefik and manual services; without one there is no status', () => {
    expect(
      serviceStatus(svc('A', { source: 'traefik', health: { status: 'up', checkedAt } }))?.label,
    ).toBe('Up');
    expect(serviceStatus(svc('A', { source: 'traefik', status: 'unknown' }))).toBeUndefined();
    expect(serviceStatus(svc('A', { source: 'manual' }))).toBeUndefined();
  });

  it.each([
    [{ status: 'up', checkedAt, httpStatus: 200 }, 'Up'],
    [{ status: 'down', checkedAt, reason: 'http', httpStatus: 503 }, 'Down'],
    [{ status: 'unknown', checkedAt, reason: 'tls' }, 'TLS error'],
    [{ status: 'unknown', checkedAt }, 'Not checked'],
  ] as const)('%j is "%s"', (health, label) => {
    expect(serviceStatus(svc('A', { health }))?.label).toBe(label);
  });
});
