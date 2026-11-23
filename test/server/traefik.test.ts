import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseRule } from '../../server/traefik-rule.js';
import type { Service } from '../../server/types.js';
import { container, exampleLab } from '../fixtures/containers.js';
import {
  exampleTraefik,
  startFakeTraefik,
  type FakeTraefikOptions,
  type TraefikFixture,
} from '../fixtures/traefik.js';
import { loadApp, openSse, type Env } from '../helpers.js';

const fakes: Array<Awaited<ReturnType<typeof startFakeTraefik>>> = [];

afterEach(async () => {
  for (const fake of fakes.splice(0)) await fake.close();
});

async function setup(
  containers = exampleLab,
  fixture: TraefikFixture = exampleTraefik,
  options: FakeTraefikOptions = {},
  env: Env = {},
) {
  const traefik = await startFakeTraefik(fixture, options);
  fakes.push(traefik);
  if (!vi.isMockFunction(console.log)) vi.spyOn(console, 'log').mockImplementation(() => {});
  const s = await loadApp(containers, { HOMEGANTRY_TRAEFIK_API_URL: traefik.url, ...env });
  return { ...s, traefik };
}

const byId = (services: Service[], id: string) => services.find((x) => x.id === id);

describe('parseRule (#13: multi-host rules)', () => {
  it.each([
    ['Host(`a.example.com`)', 'a.example.com', undefined],
    ['host(`a.example.com`)', 'a.example.com', undefined],
    ['Host(`a.example.com`, `b.example.com`)', 'a.example.com', undefined],
    ['Host("a.example.com")', 'a.example.com', undefined],
    ['Host(`a.example.com`) || Host(`b.example.com`)', 'a.example.com', undefined],
    ['Host(`a.example.com`) && PathPrefix(`/admin`)', 'a.example.com', '/admin'],
    ['PathPrefix(`/admin`) && Host(`a.example.com`)', 'a.example.com', '/admin'],
    ['Host(`a.example.com`) && Path(`/app`)', 'a.example.com', '/app'],
    ['Host(`a.example.com`) && PathPrefix(`/`)', 'a.example.com', undefined],
    ['!Host(`x.example.com`) && Host(`a.example.com`)', 'a.example.com', undefined],
    ['!(Host(`x.example.com`)) && Host(`a.example.com`)', 'a.example.com', undefined],
    ['Host(`*.example.com`) || Host(`a.example.com`)', 'a.example.com', undefined],
  ])('%s', (rule, host, path) => {
    expect(parseRule(rule)).toEqual({ host, path });
  });

  it.each([
    'HostRegexp(`.+`)',
    'PathPrefix(`/api`)',
    'HostSNI(`*`)',
    '!Host(`a.example.com`)',
    'Host(`bad host`)',
    'Host(`javascript:alert(1)`)',
    '',
  ])('finds no host in %s', (rule) => {
    expect(parseRule(rule).host).toBeUndefined();
  });

  it('ignores paths it cannot represent', () => {
    expect(parseRule('Host(`a.example.com`) && PathPrefix(`/{id:[0-9]+}`)').path).toBeUndefined();
    expect(
      parseRule('Host(`a.example.com`) && PathPrefix(`/a`) || Host(`b.example.com`)').path,
    ).toBeUndefined();
  });
});

describe('Traefik discovery', () => {
  it('merges Docker-provider routers with their container (no duplicates)', async () => {
    const s = await setup();
    const services = s.getServices();
    expect(services.filter((x) => x.source === 'docker')).toHaveLength(exampleLab.length);
    expect(services.filter((x) => x.url === 'https://jellyfin.example.com')).toHaveLength(1);
    expect(byId(services, 'id-sonarr')).toMatchObject({
      source: 'docker',
      url: 'https://sonarr.example.com',
      exposure: 'sso',
    });
  });

  it('Traefik supplies the URL when labels do not', async () => {
    const app = container({ id: 'c1', name: 'app', image: 'example/app:1', project: 'tools' });
    const fixture: TraefikFixture = {
      routers: [
        {
          name: 'app-tools@docker',
          provider: 'docker',
          rule: 'Host(`app.example.com`) && PathPrefix(`/ui`)',
          service: 'app-tools',
          status: 'enabled',
          tls: {},
        },
      ],
      services: [],
      middlewares: [],
    };
    const s = await setup([app], fixture);
    expect(byId(s.getServices(), 'c1')?.url).toBe('https://app.example.com/ui');
  });

  it('explicit URL labels beat Traefik', async () => {
    const app = container({
      id: 'c1',
      name: 'jellyfin',
      image: 'jellyfin/jellyfin',
      labels: {
        'traefik.http.routers.jellyfin.rule': 'Host(`jellyfin.example.com`)',
        'homegantry.url': 'https://movies.example.com',
      },
    });
    const s = await setup([app]);
    expect(byId(s.getServices(), 'c1')).toMatchObject({
      url: 'https://movies.example.com',
      exposure: 'public',
    });
  });

  it('matches a router through the Traefik service label', async () => {
    const app = container({
      id: 'c1',
      name: 'something',
      image: 'example/app:1',
      labels: { 'traefik.http.services.vaultwarden.loadbalancer.server.port': '80' },
    });
    const s = await setup([app]);
    expect(byId(s.getServices(), 'c1')?.url).toBe('https://vault.example.com');
  });

  it('matches routers whose name looks secret to the label filter (keycloak)', async () => {
    const app = container({
      id: 'c1',
      name: 'idp',
      image: 'example/app:1',
      project: 'tools',
      labels: { 'traefik.http.routers.keycloak.rule': 'Host(`auth.example.com`)' },
    });
    const fixture: TraefikFixture = {
      routers: [
        {
          name: 'keycloak@docker',
          provider: 'docker',
          rule: 'Host(`auth.example.com`)',
          service: 'identity',
          status: 'enabled',
          tls: {},
        },
      ],
      services: [],
      middlewares: [],
    };
    const s = await setup([app], fixture);
    expect(byId(s.getServices(), 'c1')).toMatchObject({
      url: 'https://auth.example.com',
      exposure: 'public',
    });
  });

  it('does not apply a container-name override to a standalone router', async () => {
    const traefik = await startFakeTraefik();
    fakes.push(traefik);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const s = await loadApp([], { HOMEGANTRY_TRAEFIK_API_URL: traefik.url });
    s.overridesStore.set({ proxmox: { displayName: 'A container override', hidden: true } });
    await s.refreshTraefik({ force: true });
    await s.fullScan();
    expect(byId(s.getServices(), 'traefik-proxmox-file')).toMatchObject({
      name: 'proxmox',
      hidden: false,
    });
  });

  it('turns file-provider routers into standalone services', async () => {
    const s = await setup();
    const proxmox = byId(s.getServices(), 'traefik-proxmox-file');
    expect(proxmox).toMatchObject({
      source: 'traefik',
      name: 'proxmox',
      url: 'https://proxmox.example.com',
      exposure: 'private',
      hidden: false,
    });
    expect(proxmox?.container).toBeUndefined();
    expect(proxmox?.stack).toBeUndefined();
  });

  it('takes name, icon and category of standalone services from the knowledge base', async () => {
    const fixture: TraefikFixture = {
      routers: [
        {
          name: 'homeassistant@file',
          provider: 'file',
          rule: 'Host(`ha.example.com`)',
          service: 'homeassistant',
          status: 'enabled',
          tls: {},
        },
      ],
      services: [],
      middlewares: [],
    };
    const s = await setup([], fixture);
    const [svc] = s.getServices();
    expect(svc).toMatchObject({ source: 'traefik', name: 'Home Assistant' });
    expect(svc?.icon).toBeTruthy();
    expect(svc?.category).not.toBe('Other');
  });

  it('builds http URLs with a path for non-TLS routers', async () => {
    const s = await setup();
    expect(byId(s.getServices(), 'traefik-nas-file')).toMatchObject({
      name: 'nas',
      url: 'http://nas.example.com/ui',
      category: 'Other',
    });
  });

  it('ignores internal and redirect-only routers', async () => {
    const s = await setup();
    const standalone = s.getServices().filter((x) => x.source === 'traefik');
    expect(standalone.map((x) => x.id).sort()).toEqual([
      'traefik-nas-file',
      'traefik-proxmox-file',
    ]);
    // The redirect router of jellyfin must not win over the TLS router.
    expect(byId(s.getServices(), 'id-jellyfin')).toMatchObject({
      url: 'https://jellyfin.example.com',
      exposure: 'public',
    });
  });

  it('ignores a Docker router without a running container', async () => {
    const s = await setup([]);
    expect(s.getServices().filter((x) => x.source === 'docker')).toEqual([]);
    expect(s.getServices().map((x) => x.id)).not.toContain('traefik-jellyfin-docker');
  });

  it('skips disabled routers and routers of disabled services', async () => {
    const fixture: TraefikFixture = {
      routers: [
        {
          name: 'off@file',
          provider: 'file',
          rule: 'Host(`off.example.com`)',
          service: 'off',
          status: 'disabled',
        },
        {
          name: 'broken@file',
          provider: 'file',
          rule: 'Host(`broken.example.com`)',
          service: 'broken',
          status: 'enabled',
        },
      ],
      services: [{ name: 'broken@file', provider: 'file', status: 'disabled' }],
      middlewares: [],
    };
    const s = await setup([], fixture);
    expect(s.getServices()).toEqual([]);
  });

  it('shows one service per backend and the loosest exposure of its routers', async () => {
    const route = (name: string, host: string, middlewares: string[]) => ({
      name: `${name}@file`,
      provider: 'file',
      rule: `Host(\`${host}\`)`,
      service: 'wiki',
      status: 'enabled',
      tls: {},
      middlewares,
    });
    const fixture: TraefikFixture = {
      routers: [
        route('wiki-internal', 'wiki.lan.example.com', ['login']),
        route('wiki-public', 'wiki.example.com', []),
      ],
      services: [{ name: 'wiki@file', provider: 'file', status: 'enabled' }],
      middlewares: [{ name: 'login@file', provider: 'file', type: 'forwardauth' }],
    };
    const s = await setup([], fixture);
    expect(s.getServices()).toHaveLength(1);
    expect(s.getServices()[0]).toMatchObject({ id: 'traefik-wiki-file', exposure: 'public' });
  });

  describe('routers that cannot produce a link still count for exposure', () => {
    const backend = (provider: string, service: string) => {
      const route = (name: string, rule: string, middlewares: string[]) => ({
        name: `${name}@${provider}`,
        provider,
        rule,
        service,
        status: 'enabled',
        tls: {},
        middlewares,
      });
      return { route };
    };
    const login = [
      { name: 'login@file', provider: 'file', type: 'forwardauth' },
    ] as TraefikFixture['middlewares'];
    const unlinkable = ['PathPrefix(`/app`)', 'HostRegexp(`.+`)', 'Host(`*.example.com`)'];

    it.each(unlinkable)('standalone service with an open %s router is public', async (rule) => {
      const { route } = backend('file', 'app');
      const s = await setup([], {
        routers: [
          route('app-login', 'Host(`app.example.com`)', ['login@file']),
          route('app-open', rule, []),
        ],
        services: [],
        middlewares: login,
      });
      expect(s.getServices()).toHaveLength(1);
      expect(s.getServices()[0]).toMatchObject({
        url: 'https://app.example.com',
        exposure: 'public',
      });
    });

    it.each(unlinkable)('container with an open %s router is public', async (rule) => {
      const { route } = backend('docker', 'app-tools');
      const app = container({ id: 'c1', name: 'app', image: 'example/app:1', project: 'tools' });
      const s = await setup([app], {
        routers: [
          route('app-tools', 'Host(`app.example.com`)', ['login@file']),
          route('app-open', rule, []),
        ],
        services: [],
        middlewares: login,
      });
      expect(byId(s.getServices(), 'c1')).toMatchObject({
        url: 'https://app.example.com',
        exposure: 'public',
      });
    });

    it('keeps SSO when every router on the backend is protected', async () => {
      const { route } = backend('file', 'app');
      const s = await setup([], {
        routers: [
          route('app-login', 'Host(`app.example.com`)', ['login@file']),
          route('app-path', 'PathPrefix(`/app`)', ['login@file']),
        ],
        services: [],
        middlewares: login,
      });
      expect(s.getServices()[0]).toMatchObject({ exposure: 'sso' });
    });

    it('gives a container with only unlinkable routers a badge and keeps its own URL', async () => {
      const { route } = backend('docker', 'app-tools');
      const app = container({
        id: 'c1',
        name: 'app',
        image: 'example/app:1',
        project: 'tools',
        ports: [{ PrivatePort: 80, PublicPort: 8080 }],
      });
      const s = await setup([app], {
        routers: [route('app-tools', 'PathPrefix(`/app`)', ['login@file'])],
        services: [],
        middlewares: login,
      });
      expect(byId(s.getServices(), 'c1')).toMatchObject({
        url: 'http://192.168.1.100:8080',
        exposure: 'sso',
      });
    });

    it('creates no standalone card for a backend without a linkable router', async () => {
      const { route } = backend('file', 'app');
      const s = await setup([], {
        routers: [route('app-open', 'PathPrefix(`/app`)', [])],
        services: [],
        middlewares: [],
      });
      expect(s.getServices()).toEqual([]);
    });
  });

  describe('exposure across providers', () => {
    const route = (
      name: string,
      rule: string,
      service: string,
      middlewares: string[] = [],
    ): Record<string, unknown> => ({
      name,
      provider: name.split('@')[1],
      rule,
      service,
      status: 'enabled',
      tls: {},
      middlewares,
    });
    const login = [{ name: 'login@file', provider: 'file', type: 'forwardauth' }];
    const app = container({ id: 'c1', name: 'app', image: 'example/app:1', project: 'tools' });

    it.each(['PathPrefix(`/app`)', 'Host(`open.example.com`)'])(
      'an open file router %s on a Docker service makes the container public',
      async (rule) => {
        const s = await setup([app], {
          routers: [
            route('app-tools@docker', 'Host(`app.example.com`)', 'app-tools', ['login@file']),
            route('app-open@file', rule, 'app-tools@docker'),
          ],
          services: [],
          middlewares: login,
        });
        expect(byId(s.getServices(), 'c1')).toMatchObject({
          url: 'https://app.example.com',
          exposure: 'public',
        });
      },
    );

    it('an open Docker router on a file service makes the standalone service public', async () => {
      const s = await setup([], {
        routers: [
          route('nas@file', 'Host(`nas.example.com`)', 'nas', ['login@file']),
          route('nas-open@docker', 'PathPrefix(`/nas`)', 'nas@file'),
        ],
        services: [],
        middlewares: login,
      });
      expect(byId(s.getServices(), 'traefik-nas-file')).toMatchObject({
        url: 'https://nas.example.com',
        exposure: 'public',
      });
    });

    it('keeps SSO when the routers of every provider are protected', async () => {
      const s = await setup([app], {
        routers: [
          route('app-tools@docker', 'Host(`app.example.com`)', 'app-tools', ['login@file']),
          route('app-path@file', 'PathPrefix(`/app`)', 'app-tools@docker', ['login@file']),
        ],
        services: [],
        middlewares: login,
      });
      expect(byId(s.getServices(), 'c1')?.exposure).toBe('sso');
    });

    it('does not mix up equally named services of different providers', async () => {
      const s = await setup([], {
        routers: [
          route('nas@file', 'Host(`nas.example.com`)', 'nas', ['login@file']),
          route('nas-open@docker', 'PathPrefix(`/nas`)', 'nas'),
        ],
        services: [],
        middlewares: login,
      });
      expect(byId(s.getServices(), 'traefik-nas-file')?.exposure).toBe('sso');
    });
  });

  describe('redirectScheme', () => {
    const redirect = (scheme: string) => ({
      name: 'force-https@file',
      provider: 'file',
      type: 'redirectscheme',
      redirectScheme: { scheme, permanent: true },
    });
    const route = (
      name: string,
      rule: string,
      opts: { tls: boolean; entryPoints: string[]; middlewares: string[] },
    ) => ({
      name: `${name}@file`,
      provider: 'file',
      rule,
      service: 'app',
      status: 'enabled',
      entryPoints: opts.entryPoints,
      middlewares: opts.middlewares,
      ...(opts.tls ? { tls: {} } : {}),
    });
    const login = { name: 'login@file', provider: 'file', type: 'forwardauth' };

    it('keeps ignoring an HTTP-only router that redirects to https', async () => {
      const s = await setup([], {
        routers: [
          route('app-login', 'Host(`app.example.com`)', {
            tls: true,
            entryPoints: ['websecure'],
            middlewares: ['login@file'],
          }),
          route('app-http', 'Host(`app.example.com`)', {
            tls: false,
            entryPoints: ['web'],
            middlewares: ['force-https@file'],
          }),
        ],
        services: [],
        middlewares: [login, redirect('https')],
      });
      expect(s.getServices()[0]?.exposure).toBe('sso');
    });

    it('gives no card to a service whose only router is HTTP with a redirect', async () => {
      const s = await setup([], {
        routers: [
          route('app-http', 'Host(`app.example.com`)', {
            tls: false,
            entryPoints: ['web'],
            middlewares: ['force-https@file'],
          }),
        ],
        services: [],
        middlewares: [redirect('https')],
      });
      expect(s.getServices()).toEqual([]);
    });

    it('counts a TLS router with redirectScheme https (no false SSO)', async () => {
      const s = await setup([], {
        routers: [
          route('app-login', 'Host(`app.example.com`)', {
            tls: true,
            entryPoints: ['websecure'],
            middlewares: ['login@file'],
          }),
          route('app-forced', 'Host(`app.example.com`)', {
            tls: true,
            entryPoints: ['web', 'websecure'],
            middlewares: ['force-https@file'],
          }),
        ],
        services: [],
        middlewares: [login, redirect('https')],
      });
      expect(s.getServices()[0]?.exposure).toBe('public');
    });

    it('gives a card to a file service whose only router is such a TLS router', async () => {
      const s = await setup([], {
        routers: [
          route('app-forced', 'Host(`app.example.com`)', {
            tls: true,
            entryPoints: ['web', 'websecure'],
            middlewares: ['force-https@file'],
          }),
        ],
        services: [],
        middlewares: [redirect('https')],
      });
      expect(s.getServices()).toHaveLength(1);
      expect(s.getServices()[0]).toMatchObject({
        id: 'traefik-app-file',
        url: 'https://app.example.com',
        exposure: 'public',
      });
    });

    it('ignores a TLS router that redirects to http', async () => {
      const s = await setup([], {
        routers: [
          route('app-down', 'Host(`app.example.com`)', {
            tls: true,
            entryPoints: ['websecure'],
            middlewares: ['force-https@file'],
          }),
        ],
        services: [],
        middlewares: [redirect('http')],
      });
      expect(s.getServices()).toEqual([]);
    });

    it('follows a redirect inside a chain', async () => {
      const s = await setup([], {
        routers: [
          route('app-forced', 'Host(`app.example.com`)', {
            tls: true,
            entryPoints: ['websecure'],
            middlewares: ['secure-chain@file'],
          }),
        ],
        services: [],
        middlewares: [
          redirect('https'),
          {
            name: 'secure-chain@file',
            provider: 'file',
            type: 'chain',
            chain: { middlewares: ['force-https'] },
          },
        ],
      });
      expect(s.getServices()).toHaveLength(1);
    });
  });

  it('applies a custom HOMEGANTRY_EXPOSURE_MAP', async () => {
    const s = await setup(
      exampleLab,
      exampleTraefik,
      {},
      {
        HOMEGANTRY_EXPOSURE_MAP: 'custom-*=private',
      },
    );
    expect(byId(s.getServices(), 'id-nextcloud')?.exposure).toBe('private');
  });

  it('follows middleware chains', async () => {
    const s = await setup();
    expect(byId(s.getServices(), 'id-radarr')?.exposure).toBe('sso');
    expect(byId(s.getServices(), 'id-radarr')?.exposureSource).toContain('authelia');
  });

  it('reports unknown middleware as unknown', async () => {
    const s = await setup();
    expect(byId(s.getServices(), 'id-nextcloud')?.exposure).toBe('unknown');
  });

  it('reads every page of the API', async () => {
    const s = await setup(exampleLab, exampleTraefik, { pageSize: 2 });
    expect(byId(s.getServices(), 'traefik-nas-file')).toBeDefined();
    const pages = s.traefik.requests.filter((r) => r.url.startsWith('/api/http/routers'));
    expect(pages.length).toBeGreaterThan(2);
  });

  it('standalone services can be hidden and overridden', async () => {
    const token = 'change-me-0123456789abcdefghij';
    const s = await setup(exampleLab, exampleTraefik, {}, { HOMEGANTRY_ADMIN_TOKEN: token });
    const api = request.agent(s.app).set('Authorization', `Bearer ${token}`);
    await api
      .put('/api/services/traefik-proxmox-file/override')
      .send({ displayName: 'Hypervisor', category: 'Infra' })
      .expect(200);
    let res = await api.get('/api/services');
    expect(res.body).toContainEqual(
      expect.objectContaining({
        id: 'traefik-proxmox-file',
        name: 'Hypervisor',
        category: 'Infra',
      }),
    );
    await api.put('/api/services/traefik-proxmox-file/override').send({ hidden: true });
    res = await api.get('/api/services');
    expect(res.body.map((x: Service) => x.id)).not.toContain('traefik-proxmox-file');
    await s.fullScan();
    res = await api.get('/api/services');
    expect(res.body.map((x: Service) => x.id)).not.toContain('traefik-proxmox-file');
  });

  it('removes a standalone service when its router disappears', async () => {
    const s = await setup();
    const removed: string[] = [];
    s.dockerEvents.on('service_removed', (d: { id: string }) => removed.push(d.id));
    s.traefik.control.state = {
      ...exampleTraefik,
      routers: exampleTraefik.routers.filter((r) => r.name !== 'nas@file'),
    };
    await s.refreshTraefik({ force: true });
    await s.fullScan();
    expect(removed).toEqual(['traefik-nas-file']);
  });

  it('coalesces refreshes during an event burst', async () => {
    const s = await setup();
    const before = s.traefik.requests.length;
    await Promise.all([s.fullScan(), s.fullScan(), s.fullScan()]);
    expect(s.traefik.requests.length).toBe(before);
  });
});

describe('Traefik API failures', () => {
  const dockerOnly = (services: Service[]) => {
    expect(services.filter((x) => x.source === 'traefik')).toEqual([]);
    expect(services).toHaveLength(exampleLab.length);
    expect(byId(services, 'id-jellyfin')).toMatchObject({
      url: 'https://jellyfin.example.com',
    });
    expect(byId(services, 'id-jellyfin')?.exposure).toBeUndefined();
  };

  it('stays Docker-only without HOMEGANTRY_TRAEFIK_API_URL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const s = await loadApp(exampleLab);
    dockerOnly(s.getServices());
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each<[string, FakeTraefikOptions]>([
    ['HTTP 500', { status: 500 }],
    ['HTTP 401', { status: 401 }],
    ['invalid JSON', { body: '<html>' }],
    ['a non-array body', { body: '{"message":"nope"}' }],
  ])('falls back to Docker on %s with one log line', async (_name, options) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = await setup(exampleLab, exampleTraefik, options);
    dockerOnly(s.getServices());
    await s.refreshTraefik({ force: true });
    await s.refreshTraefik({ force: true });
    const lines = error.mock.calls.filter(([m]) => String(m).startsWith('[traefik]'));
    expect(lines).toHaveLength(1);
    expect(String(lines[0]![0])).toMatch(/Docker-only/);
  });

  it('falls back to Docker when the API is unreachable', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = await loadApp(exampleLab, { HOMEGANTRY_TRAEFIK_API_URL: 'http://127.0.0.1:1' });
    dockerOnly(s.getServices());
    expect(error.mock.calls.filter(([m]) => String(m).startsWith('[traefik]'))).toHaveLength(1);
  });

  it('times out on an API that never answers', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = await setup(
      exampleLab,
      exampleTraefik,
      { hang: true },
      {
        HOMEGANTRY_TRAEFIK_TIMEOUT: '0.05',
      },
    );
    dockerOnly(s.getServices());
    expect(String(error.mock.calls[0]![0])).toMatch(/timeout/);
  });

  it('ignores an unusable HOMEGANTRY_TRAEFIK_API_URL with one log line', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = await loadApp(exampleLab, { HOMEGANTRY_TRAEFIK_API_URL: 'ftp://traefik' });
    dockerOnly(s.getServices());
    await s.refreshTraefik({ force: true });
    expect(error.mock.calls.filter(([m]) => String(m).startsWith('[traefik]'))).toHaveLength(1);
  });

  it('does not crash on malformed percent-encoding in URL credentials', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = await loadApp(exampleLab, {
      HOMEGANTRY_TRAEFIK_API_URL: 'http://reader:bad%zz@127.0.0.1:1',
    });
    dockerOnly(s.getServices());
    expect(JSON.stringify(error.mock.calls)).not.toContain('bad%zz');
  });

  it('drops Traefik data while down and recovers afterwards', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const s = await setup();
    expect(byId(s.getServices(), 'traefik-nas-file')).toBeDefined();

    s.traefik.control.options = { status: 503 };
    await s.refreshTraefik({ force: true });
    await s.fullScan();
    dockerOnly(s.getServices());

    s.traefik.control.options = {};
    await s.refreshTraefik({ force: true });
    await s.fullScan();
    expect(byId(s.getServices(), 'traefik-nas-file')).toBeDefined();
    expect(log.mock.calls.some(([m]) => /\[traefik\] connected/.test(String(m)))).toBe(true);
  });
});

describe('Traefik credentials (security regression)', () => {
  const PASSWORD = 'change-me-traefik-password';
  const TOKEN = 'change-me-traefik-token';
  const basic = (user: string, pass: string) =>
    `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;

  function spyLogs() {
    return (['log', 'info', 'warn', 'error'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {}),
    );
  }

  const logged = (spies: ReturnType<typeof spyLogs>) =>
    JSON.stringify(spies.flatMap((spy) => spy.mock.calls));

  it('sends basic-auth credentials', async () => {
    const s = await setup(
      exampleLab,
      exampleTraefik,
      { authorization: basic('reader', PASSWORD) },
      { HOMEGANTRY_TRAEFIK_API_USERNAME: 'reader', HOMEGANTRY_TRAEFIK_API_PASSWORD: PASSWORD },
    );
    expect(byId(s.getServices(), 'traefik-nas-file')).toBeDefined();
  });

  it('sends a bearer token', async () => {
    const s = await setup(
      exampleLab,
      exampleTraefik,
      { authorization: `Bearer ${TOKEN}` },
      { HOMEGANTRY_TRAEFIK_API_TOKEN: TOKEN },
    );
    expect(byId(s.getServices(), 'traefik-nas-file')).toBeDefined();
  });

  it('accepts credentials embedded in the URL and never logs them', async () => {
    const spies = spyLogs();
    const traefik = await startFakeTraefik(exampleTraefik, {
      authorization: basic('reader', PASSWORD),
    });
    fakes.push(traefik);
    const s = await loadApp(exampleLab, {
      HOMEGANTRY_TRAEFIK_API_URL: `http://reader:${PASSWORD}@127.0.0.1:${traefik.port}/?x=${TOKEN}`,
    });
    expect(byId(s.getServices(), 'traefik-nas-file')).toBeDefined();
    traefik.control.options = { status: 500 };
    await s.refreshTraefik({ force: true });
    expect(logged(spies)).toContain('[traefik]');
    expect(logged(spies)).not.toContain(PASSWORD);
    expect(logged(spies)).not.toContain(TOKEN);
    expect(logged(spies)).not.toContain('reader');
  });

  it('never returns credentials or middleware configuration via REST or SSE', async () => {
    const spies = spyLogs();
    const fixture: TraefikFixture = {
      ...exampleTraefik,
      middlewares: [
        ...exampleTraefik.middlewares,
        {
          name: 'login@file',
          provider: 'file',
          type: 'basicauth',
          basicAuth: { users: [`admin:${PASSWORD}`] },
        },
      ],
      routers: [
        ...exampleTraefik.routers,
        {
          name: 'secret@file',
          provider: 'file',
          rule: 'Host(`secret.example.com`)',
          service: 'secret',
          status: 'enabled',
          middlewares: ['login@file'],
        },
      ],
    };
    const s = await setup(
      exampleLab,
      fixture,
      { authorization: `Bearer ${TOKEN}` },
      { HOMEGANTRY_TRAEFIK_API_TOKEN: TOKEN, HOMEGANTRY_TRAEFIK_API_PASSWORD: PASSWORD },
    );
    const rest = await request(s.app).get('/api/services?includeHidden=true').expect(200);
    const auth = await request(s.app).get('/api/auth').expect(200);
    const settings = await request(s.app).get('/api/settings').expect(200);
    const health = await request(s.app).get('/api/health').expect(200);
    const stream = await openSse(s.app);
    await stream.waitFor(1);
    s.dockerEvents.emit('service_updated', byId(s.getServices(), 'traefik-secret-file'));
    await stream.waitFor(2);
    stream.close();

    const everything = JSON.stringify([
      rest.body,
      auth.body,
      settings.body,
      health.body,
      stream.events,
    ]);
    for (const forbidden of [
      PASSWORD,
      TOKEN,
      s.traefik.url,
      'authelia:9091', // forwardAuth address
      '192.168.1.0/24', // allow-list source range
      '192.168.1.100:8006', // backend server of the file provider
    ]) {
      expect(everything).not.toContain(forbidden);
      expect(JSON.stringify(s.getServices())).not.toContain(forbidden);
    }
    expect(logged(spies)).not.toContain(PASSWORD);
    expect(logged(spies)).not.toContain(TOKEN);
  });

  it('does not follow redirects with credentials', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const target = await startFakeTraefik();
    fakes.push(target);
    const http = await import('node:http');
    const redirector = http.createServer((_req, res) => {
      res.writeHead(302, { Location: `${target.url}/api/http/routers` }).end();
    });
    await new Promise<void>((r) => redirector.listen(0, '127.0.0.1', r));
    const { port } = redirector.address() as { port: number };
    try {
      const s = await loadApp(exampleLab, {
        HOMEGANTRY_TRAEFIK_API_URL: `http://127.0.0.1:${port}`,
        HOMEGANTRY_TRAEFIK_API_TOKEN: TOKEN,
      });
      expect(s.getServices().filter((x) => x.source === 'traefik')).toEqual([]);
      expect(target.requests).toEqual([]);
    } finally {
      redirector.closeAllConnections();
      redirector.close();
    }
  });
});
