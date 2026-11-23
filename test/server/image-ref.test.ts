import { describe, expect, it } from 'vitest';
import { imageMatches, parseImageRef, repositoryName } from '../../server/image-ref.js';

describe('parseImageRef', () => {
  it.each([
    ['nginx', undefined, 'nginx'],
    ['nginx:1.27', undefined, 'nginx'],
    ['library/nginx:1.27', undefined, 'nginx'],
    ['docker.io/library/nginx', undefined, 'nginx'],
    ['index.docker.io/library/nginx', undefined, 'nginx'],
    ['docker.io/jellyfin/jellyfin:10', undefined, 'jellyfin/jellyfin'],
    ['ghcr.io/home-assistant/home-assistant:stable', 'ghcr.io', 'home-assistant/home-assistant'],
    ['registry.example.com:5000/team/app:1.2', 'registry.example.com:5000', 'team/app'],
    ['localhost:5000/app', 'localhost:5000', 'app'],
    ['localhost/app', 'localhost', 'app'],
    ['Grafana/Grafana-OSS:11', undefined, 'grafana/grafana-oss'],
    ['jellyfin/jellyfin@sha256:0123456789abcdef', undefined, 'jellyfin/jellyfin'],
    ['jellyfin/jellyfin:10.10@sha256:0123456789abcdef', undefined, 'jellyfin/jellyfin'],
  ])('parses %s', (image, registry, path) => {
    expect(parseImageRef(image)).toEqual({ registry, path });
  });
});

describe('repositoryName', () => {
  it('drops the tag and digest and keeps the registry', () => {
    expect(repositoryName('ghcr.io/example/app:1.0@sha256:abc')).toBe('ghcr.io/example/app');
  });

  it('normalises Docker Hub references', () => {
    expect(repositoryName('docker.io/library/nginx:1')).toBe('nginx');
  });

  it('does not present a bare image id as a repository', () => {
    expect(repositoryName('sha256:0123456789abcdef')).toBe('(untagged image)');
    expect(repositoryName('')).toBe('(untagged image)');
  });
});

describe('imageMatches', () => {
  it.each([
    ['redis', 'redis'],
    ['redis', 'redis:7-alpine'],
    ['redis', 'library/redis:7'],
    ['redis', 'docker.io/library/redis:7'],
    ['redis', 'bitnami/redis:7'],
    ['redis', 'ghcr.io/example/redis:7'],
    ['linuxserver/sonarr', 'lscr.io/linuxserver/sonarr:latest'],
    ['linuxserver/sonarr', 'ghcr.io/linuxserver/sonarr'],
    ['linuxserver/sonarr', 'registry.example.com:5000/mirror/linuxserver/sonarr:4'],
    ['linuxserver/sonarr', 'linuxserver/sonarr@sha256:0123456789abcdef'],
    ['ghcr.io/example/app', 'ghcr.io/example/app:1'],
    ['GHCR.io/Example/App', 'ghcr.io/example/app'],
    ['docker.io/example/app', 'example/app'],
  ])('pattern %s matches %s', (pattern, image) => {
    expect(imageMatches(pattern, image)).toBe(true);
  });

  it.each([
    ['redis', 'oliver006/redis_exporter'],
    ['redis', 'example/redis-exporter:1'],
    ['redis', 'redis-commander'],
    ['postgres', 'prometheuscommunity/postgres-exporter'],
    ['postgres', 'example/postgres-db'],
    ['mongo', 'mongo-express'],
    ['nginx', 'nginx-exporter'],
    ['traefik', 'traefik/whoami'],
    ['linuxserver/plex', 'linuxserver/plex-meta-manager'],
    ['grafana/grafana', 'grafana/grafana-image-renderer'],
    ['ghcr.io/example/app', 'quay.io/example/app'],
    ['ghcr.io/example/app', 'example/app'],
    ['docker.io/example/app', 'ghcr.io/example/app'],
    ['example/app', 'other/app'],
  ])('pattern %s does not match look-alike %s', (pattern, image) => {
    expect(imageMatches(pattern, image)).toBe(false);
  });

  it('a registry port is not mistaken for a tag', () => {
    expect(imageMatches('team/app', 'registry.example.com:5000/team/app')).toBe(true);
    expect(imageMatches('registry', 'registry.example.com:5000/team/app')).toBe(false);
  });

  describe('explicit globs', () => {
    it.each([
      ['ghcr.io/moghtech/komodo-*', 'ghcr.io/moghtech/komodo-core:latest'],
      ['example/app-*', 'ghcr.io/example/app-worker:1'],
      ['*/app', 'example/app'],
    ])('%s matches %s', (pattern, image) => {
      expect(imageMatches(pattern, image)).toBe(true);
    });

    it.each([
      ['example/app-*', 'example/app'],
      ['example/app-*', 'example/other'],
      // `*` stays inside one path segment.
      ['example/*', 'example/nested/app'],
      ['ghcr.io/example/*', 'quay.io/example/app'],
    ])('%s does not match %s', (pattern, image) => {
      expect(imageMatches(pattern, image)).toBe(false);
    });

    it('treats regular-expression characters in a pattern literally', () => {
      expect(imageMatches('example/app.io-*', 'example/app.io-web')).toBe(true);
      expect(imageMatches('example/app.io-*', 'example/appxio-web')).toBe(false);
    });
  });
});
