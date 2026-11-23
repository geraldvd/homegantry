import { describe, expect, it } from 'vitest';
import { loadServer, type Env } from '../helpers.js';
import type { MatchInput } from '../../server/matcher.js';

function input(overrides: Partial<MatchInput> = {}): MatchInput {
  return {
    id: 'abc123',
    name: 'some-container',
    image: 'example/unknown:latest',
    state: 'running',
    labels: {},
    ports: [],
    ...overrides,
  };
}

async function match(overrides: Partial<MatchInput> = {}, env: Env = {}) {
  const { matchContainer } = await loadServer(env);
  return matchContainer(input(overrides));
}

describe('matchContainer: knowledge base by image', () => {
  it('matches an exact Docker Hub image', async () => {
    const svc = await match({ image: 'jellyfin/jellyfin' });
    expect(svc).toMatchObject({ name: 'Jellyfin', category: 'Media', icon: 'jellyfin' });
    expect(svc.description).toBe('The free software media system');
  });

  it.each([
    ['ghcr.io/linuxserver/sonarr:latest', 'Sonarr'],
    ['lscr.io/linuxserver/sonarr:latest', 'Sonarr'],
    ['docker.io/linuxserver/radarr', 'Radarr'],
    ['ghcr.io/immich-app/immich-server:release', 'Immich'],
    ['ghcr.io/hotio/radarr:release', 'Radarr'],
  ])('matches registry-prefixed image %s', async (image, name) => {
    expect((await match({ image })).name).toBe(name);
  });

  it.each([
    ['jellyfin/jellyfin:10.10.3', 'tag'],
    ['jellyfin/jellyfin@sha256:0123456789abcdef', 'digest'],
    ['jellyfin/jellyfin:10.10.3@sha256:0123456789abcdef', 'tag and digest'],
  ])('ignores the %s (%s)', async (image) => {
    expect((await match({ image })).name).toBe('Jellyfin');
  });

  it('matches image patterns case-insensitively', async () => {
    expect((await match({ image: 'Grafana/Grafana-OSS:11' })).name).toBe('Grafana');
  });

  it('falls back to the container name and category Other for unknown images', async () => {
    const svc = await match({ name: 'my-thing', image: 'example/unknown:1.0' });
    expect(svc).toMatchObject({ name: 'my-thing', category: 'Other', icon: '', description: '' });
  });

  it.each([
    'example/redis-exporter:1',
    'oliver006/redis_exporter:latest',
    'prometheuscommunity/postgres-exporter',
    'example/postgres-db:1',
    'mongo-express:1',
    'traefik/whoami',
    'grafana/grafana-image-renderer',
  ])('does not match the look-alike %s (#13 c)', async (image) => {
    const svc = await match({ image });
    expect(svc).toMatchObject({ name: 'some-container', category: 'Other', hidden: false });
  });

  it('recognises the real repository under another namespace', async () => {
    expect((await match({ image: 'ghcr.io/example/redis:7' })).name).toBe('Redis');
  });

  it('a bouncer image resolves to its own entry, not to Traefik', async () => {
    const svc = await match({ image: 'fbonalair/traefik-crowdsec-bouncer:latest' });
    expect(svc.name).toBe('CrowdSec Bouncer');
  });
});

describe('matchContainer: knowledge base by name', () => {
  it('prefers the compose service name over the image', async () => {
    const svc = await match({ compose_service: 'grafana', image: 'example/unknown' });
    expect(svc.name).toBe('Grafana');
  });

  it('matches aliases ignoring case, dashes, underscores and dots', async () => {
    expect((await match({ compose_service: 'Uptime_Kuma' })).name).toBe('Uptime Kuma');
  });

  it.each([
    ['docker-jellyfin', 'Jellyfin'],
    ['jellyfin-app', 'Jellyfin'],
    ['jellyfin_1', 'Jellyfin'],
    ['compose_grafana-server', 'Grafana'],
  ])('strips common prefixes/suffixes from container name %s', async (name, expected) => {
    expect((await match({ name, image: 'example/unknown' })).name).toBe(expected);
  });

  it('compose service lookup wins over the container name', async () => {
    const svc = await match({ name: 'jellyfin', compose_service: 'grafana' });
    expect(svc.name).toBe('Grafana');
  });
});

describe('matchContainer: infrastructure services', () => {
  it.each(['postgres:16', 'redis:7-alpine', 'mariadb:11', 'tecnativa/docker-socket-proxy'])(
    'auto-hides %s',
    async (image) => {
      expect((await match({ image })).hidden).toBe(true);
    },
  );

  it('does not hide regular services', async () => {
    expect((await match({ image: 'jellyfin/jellyfin' })).hidden).toBe(false);
  });

  it('does not auto-hide when homegantry.name is set', async () => {
    const svc = await match({ image: 'postgres:16', labels: { 'homegantry.name': 'Main DB' } });
    expect(svc.hidden).toBe(false);
    expect(svc.name).toBe('Main DB');
  });
});

describe('matchContainer: label precedence', () => {
  it('homegantry.* labels override the knowledge base and skip it', async () => {
    const svc = await match({
      image: 'jellyfin/jellyfin',
      labels: {
        'homegantry.name': 'Movies',
        'homegantry.icon': 'mdi-movie',
        'homegantry.category': 'Fun',
        'homegantry.description': 'Our films',
      },
    });
    expect(svc).toMatchObject({
      name: 'Movies',
      icon: 'mdi-movie',
      category: 'Fun',
      description: 'Our films',
    });
  });

  it('homegantry.name skips the knowledge base entirely', async () => {
    const svc = await match({
      image: 'jellyfin/jellyfin',
      labels: { 'homegantry.name': 'Movies' },
    });
    expect(svc).toMatchObject({ name: 'Movies', icon: '', category: 'Other', description: '' });
  });

  it('homepage.* labels override the knowledge base', async () => {
    const svc = await match({
      image: 'jellyfin/jellyfin',
      labels: {
        'homepage.name': 'Media Server',
        'homepage.icon': 'jellyfin.png',
        'homepage.group': 'Streaming',
        'homepage.description': 'Watch stuff',
      },
    });
    expect(svc).toMatchObject({
      name: 'Media Server',
      icon: 'jellyfin.png',
      category: 'Streaming',
      description: 'Watch stuff',
    });
  });

  it('homegantry.name wins over homepage.* labels', async () => {
    const svc = await match({
      labels: {
        'homegantry.name': 'HG Name',
        'homegantry.category': 'HG Cat',
        'homepage.name': 'HP Name',
        'homepage.group': 'HP Group',
        'homepage.icon': 'hp-icon',
      },
    });
    expect(svc).toMatchObject({ name: 'HG Name', category: 'HG Cat', icon: '' });
  });

  it('homegantry.icon beats homepage.icon when no name label is set (#13 a)', async () => {
    const svc = await match({
      labels: {
        'homegantry.icon': 'hg-icon',
        'homepage.name': 'HP Name',
        'homepage.icon': 'hp-icon',
      },
    });
    expect(svc).toMatchObject({ name: 'HP Name', icon: 'hg-icon' });
  });

  it('homepage.icon is used when there is no homegantry.icon (#13 a)', async () => {
    const svc = await match({ labels: { 'homepage.icon': 'hp-icon' } });
    expect(svc.icon).toBe('hp-icon');
  });

  it('homegantry.category beats homepage.group', async () => {
    const svc = await match({
      labels: { 'homegantry.category': 'Mine', 'homepage.group': 'Theirs' },
    });
    expect(svc.category).toBe('Mine');
  });

  it('homegantry.category beats the knowledge base (#13 d)', async () => {
    const svc = await match({
      image: 'jellyfin/jellyfin',
      labels: { 'homegantry.icon': 'custom-icon', 'homegantry.category': 'Mine' },
    });
    expect(svc).toMatchObject({ name: 'Jellyfin', icon: 'custom-icon', category: 'Mine' });
  });

  it('an explicit category "Other" still beats the knowledge base (#13 d)', async () => {
    const svc = await match({
      image: 'jellyfin/jellyfin',
      labels: { 'homegantry.category': 'Other' },
    });
    expect(svc).toMatchObject({ name: 'Jellyfin', category: 'Other' });
  });

  it('homepage.group beats the knowledge base without a name label (#13 d)', async () => {
    const svc = await match({
      image: 'jellyfin/jellyfin',
      labels: { 'homepage.group': 'Streaming' },
    });
    expect(svc).toMatchObject({ name: 'Jellyfin', category: 'Streaming' });
  });

  it('ignores homepage.group for the category when compat is off', async () => {
    const svc = await match(
      { image: 'jellyfin/jellyfin', labels: { 'homepage.group': 'Streaming' } },
      { HOMEGANTRY_HOMEPAGE_COMPAT: 'false' },
    );
    expect(svc.category).toBe('Media');
  });

  it('a stored override still beats every label', async () => {
    const server = await loadServer();
    server.overridesStore.set({ abc123: { category: 'Override', icon: 'override-icon' } });
    const svc = server.matchContainer(
      input({ labels: { 'homegantry.category': 'Mine', 'homegantry.icon': 'hg-icon' } }),
    );
    expect(svc).toMatchObject({ category: 'Override', icon: 'override-icon' });
  });

  it('homegantry.description alone is ignored', async () => {
    const svc = await match({ labels: { 'homegantry.description': 'only a description' } });
    expect(svc.description).toBe('');
  });

  it('ignores homepage.* labels when HOMEGANTRY_HOMEPAGE_COMPAT=false', async () => {
    const svc = await match(
      {
        image: 'jellyfin/jellyfin',
        labels: { 'homepage.name': 'HP', 'homepage.href': 'https://hp.example.com' },
      },
      { HOMEGANTRY_HOMEPAGE_COMPAT: 'false' },
    );
    expect(svc.name).toBe('Jellyfin');
    expect(svc.url).toBe('#');
  });
});

describe('matchContainer: URL resolution', () => {
  const traefik = (rule: string) => ({ 'traefik.http.routers.app.rule': rule });

  it('parses a single Traefik Host() rule into an https URL', async () => {
    expect((await match({ labels: traefik('Host(`app.example.com`)') })).url).toBe(
      'https://app.example.com',
    );
  });

  it('uses the first host of Host() || Host()', async () => {
    const svc = await match({ labels: traefik('Host(`a.example.com`) || Host(`b.example.com`)') });
    expect(svc.url).toBe('https://a.example.com');
  });

  it('drops PathPrefix from Host() && PathPrefix()', async () => {
    const svc = await match({ labels: traefik('Host(`app.example.com`) && PathPrefix(`/admin`)') });
    expect(svc.url).toBe('https://app.example.com');
  });

  it('uses the first host of a multi-argument Host(`a`, `b`) (#13)', async () => {
    const svc = await match({ labels: traefik('Host(`a.example.com`, `b.example.com`)') });
    expect(svc.url).toBe('https://a.example.com');
  });

  it('matches the router label key case-insensitively', async () => {
    const svc = await match({
      labels: { 'Traefik.HTTP.Routers.App.Rule': 'host(`app.example.com`)' },
    });
    expect(svc.url).toBe('https://app.example.com');
  });

  it('ignores non-router Traefik labels', async () => {
    const svc = await match({
      labels: { 'traefik.http.services.app.loadbalancer.server.port': '80' },
    });
    expect(svc.url).toBe('#');
  });

  it('homegantry.url beats homepage.href beats Traefik', async () => {
    const labels = {
      ...traefik('Host(`traefik.example.com`)'),
      'homepage.href': 'https://homepage.example.com',
      'homegantry.url': 'https://homegantry.example.com',
    };
    expect((await match({ labels })).url).toBe('https://homegantry.example.com');
    const { 'homegantry.url': _drop, ...withoutHg } = labels;
    expect((await match({ labels: withoutHg })).url).toBe('https://homepage.example.com');
  });

  it('Traefik beats the published port', async () => {
    const svc = await match({
      labels: traefik('Host(`app.example.com`)'),
      ports: [{ private: 80, public: 8080 }],
    });
    expect(svc.url).toBe('https://app.example.com');
  });

  it('builds http://localhost:<port> from the first published port without HOMEGANTRY_HOST', async () => {
    const svc = await match({
      ports: [
        { private: 80, public: 8080 },
        { private: 443, public: 8443 },
      ],
    });
    expect(svc.url).toBe('http://localhost:8080');
  });

  it('uses HOMEGANTRY_HOST for the published-port URL', async () => {
    const svc = await match(
      { ports: [{ private: 80, public: 8080 }] },
      { HOMEGANTRY_HOST: '192.168.1.100' },
    );
    expect(svc.url).toBe('http://192.168.1.100:8080');
  });

  it('returns # when there is nothing to build a URL from', async () => {
    expect((await match({}, { HOMEGANTRY_HOST: '192.168.1.100' })).url).toBe('#');
  });
});

describe('matchContainer: output shape and overrides', () => {
  it('maps container metadata, stack and status', async () => {
    const svc = await match({
      id: 'cid',
      name: 'jf',
      image: 'jellyfin/jellyfin',
      state: 'exited',
      compose_project: 'media',
      compose_service: 'jf',
      ports: [{ private: 8096, public: 8096 }],
    });
    expect(svc).toEqual({
      id: 'cid',
      source: 'docker',
      name: 'Jellyfin',
      description: 'The free software media system',
      url: 'http://localhost:8096',
      icon: 'jellyfin',
      category: 'Media',
      status: 'stopped',
      stack: 'media',
      container: {
        name: 'jf',
        image: 'jellyfin/jellyfin',
        state: 'exited',
        compose_project: 'media',
        compose_service: 'jf',
        ports: [{ private: 8096, public: 8096 }],
      },
      hidden: false,
      sortOrder: 0,
    });
  });

  it('applies stored overrides by container id, then by name', async () => {
    const server = await loadServer();
    server.overridesStore.set({
      cid: { displayName: 'By Id', sortOrder: 3 },
      other: { displayName: 'By Name', url: 'https://x.example.com', hidden: true },
    });
    expect(server.matchContainer(input({ id: 'cid', name: 'other' }))).toMatchObject({
      name: 'By Id',
      sortOrder: 3,
    });
    expect(server.matchContainer(input({ id: 'nope', name: 'other' }))).toMatchObject({
      name: 'By Name',
      url: 'https://x.example.com',
      hidden: true,
    });
  });

  it('an explicit hidden=false override un-hides an infrastructure service', async () => {
    const server = await loadServer();
    server.overridesStore.set({ abc123: { hidden: false } });
    expect(server.matchContainer(input({ image: 'postgres:16' })).hidden).toBe(false);
  });
});
