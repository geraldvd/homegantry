import { describe, expect, it } from 'vitest';
import {
  isSecretLabel,
  publicService,
  publicSettings,
  publicStacks,
  stripSecretLabels,
} from '../../server/sanitize.js';
import type { Service } from '../../server/types.js';

describe('isSecretLabel', () => {
  it.each([
    'homepage.widget.password',
    'homepage.widget.key',
    'app.API_KEY',
    'SECRET',
    'my.client-secret',
    'auth.token',
    'db.passwd',
    'service.credentials',
  ])('flags %s', (key) => {
    expect(isSecretLabel(key)).toBe(true);
  });

  it.each([
    'traefik.http.routers.app.rule',
    'homegantry.url',
    'com.docker.compose.project',
    'homepage.name',
  ])('keeps %s', (key) => {
    expect(isSecretLabel(key)).toBe(false);
  });
});

describe('stripSecretLabels', () => {
  it('drops secret-looking labels and keeps the rest', () => {
    expect(
      stripSecretLabels({
        'homepage.widget.key': 'change-me-widget-key',
        'homegantry.url': 'https://app.example.com',
        DB_PASSWORD: 'change-me-password',
      }),
    ).toEqual({ 'homegantry.url': 'https://app.example.com' });
  });
});

describe('publicService', () => {
  it('returns only allow-listed fields, also for nested container info', () => {
    const svc = {
      id: 'c1',
      source: 'docker',
      name: 'App',
      description: 'An app',
      url: 'https://app.example.com',
      icon: 'app',
      category: 'Other',
      status: 'running',
      stack: 'tools',
      hidden: false,
      sortOrder: 0,
      labels: { 'app.token': 'change-me-token' },
      Env: ['PASSWORD=change-me-password'],
      container: {
        name: 'app',
        image: 'example/app:1',
        state: 'running',
        compose_project: 'tools',
        compose_service: 'app',
        ports: [{ private: 80, public: 8080, ip: '0.0.0.0' }],
        Env: ['TOKEN=change-me-token'],
        Mounts: [{ Source: '/srv/secrets' }],
        Labels: { 'app.secret': 'change-me-secret' },
      },
    } as unknown as Service;

    expect(publicService(svc)).toEqual({
      id: 'c1',
      source: 'docker',
      name: 'App',
      description: 'An app',
      url: 'https://app.example.com',
      icon: 'app',
      category: 'Other',
      status: 'running',
      stack: 'tools',
      hidden: false,
      sortOrder: 0,
      container: {
        name: 'app',
        image: 'example/app:1',
        state: 'running',
        compose_project: 'tools',
        compose_service: 'app',
        ports: [{ private: 80, public: 8080 }],
      },
    });
  });

  it('omits the container block for manual services', () => {
    const out = publicService({
      id: 'm1',
      source: 'manual',
      name: 'Router',
      description: '',
      url: 'http://192.168.1.1',
      icon: 'router',
      category: 'Network',
      status: 'running',
      hidden: false,
      sortOrder: 0,
    });
    expect(out).not.toHaveProperty('container');
    expect(out).not.toHaveProperty('stack');
  });
});

describe('publicStacks / publicSettings', () => {
  it('keeps only known stack fields', () => {
    expect(
      publicStacks({
        media: { visible: false, icon: 'plex', displayName: 'Media', extra: 'x' } as never,
      }),
    ).toEqual({ media: { visible: false, icon: 'plex', displayName: 'Media' } });
  });

  it('keeps only known settings fields', () => {
    const settings = {
      dashboardTitle: 'Lab',
      columns: 4,
      showStatus: true,
      layout: 'grid',
      showStopped: false,
      groupBy: 'category',
      injected: '<script>',
    } as never;
    expect(publicSettings(settings)).toEqual({
      dashboardTitle: 'Lab',
      columns: 4,
      showStatus: true,
      layout: 'grid',
      showStopped: false,
      groupBy: 'category',
    });
  });
});
