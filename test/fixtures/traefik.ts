import http from 'node:http';
import type { AddressInfo } from 'node:net';

/** Raw Traefik API objects, as returned by `/api/http/*`. Only example data. */
export interface TraefikFixture {
  routers: Array<Record<string, unknown>>;
  services: Array<Record<string, unknown>>;
  middlewares: Array<Record<string, unknown>>;
}

const router = (
  name: string,
  rule: string,
  opts: { middlewares?: string[]; tls?: boolean; service?: string; entryPoints?: string[] } = {},
) => {
  const [base, provider] = name.split('@') as [string, string];
  return {
    name,
    provider,
    rule,
    service: opts.service ?? base,
    status: 'enabled',
    entryPoints: opts.entryPoints ?? [opts.tls === false ? 'web' : 'websecure'],
    ...(opts.middlewares ? { middlewares: opts.middlewares } : {}),
    ...(opts.tls === false ? {} : { tls: {} }),
  };
};

/** Traefik view of the example lab: Docker routers, file-provider services, internal routers. */
export const exampleTraefik: TraefikFixture = {
  routers: [
    router('jellyfin@docker', 'Host(`jellyfin.example.com`)'),
    router('jellyfin-http@docker', 'Host(`jellyfin.example.com`)', {
      tls: false,
      service: 'jellyfin',
      middlewares: ['redirect-https@file'],
    }),
    router('sonarr@docker', 'Host(`sonarr.example.com`)', { middlewares: ['authelia@docker'] }),
    router('radarr@docker', 'Host(`radarr.example.com`)', { middlewares: ['secured@file'] }),
    router('grafana@docker', 'Host(`grafana.example.com`)', {
      middlewares: ['lan-ipallowlist@file'],
    }),
    router('nextcloud@docker', 'Host(`cloud.example.com`)', {
      middlewares: ['custom-plugin@file'],
    }),
    router('vault@docker', 'Host(`vault.example.com`)', {
      service: 'vaultwarden',
      middlewares: ['authelia@docker'],
    }),
    router('proxmox@file', 'Host(`proxmox.example.com`)', {
      middlewares: ['lan-ipallowlist@file'],
    }),
    router('nas@file', 'Host(`nas.example.com`) && PathPrefix(`/ui`)', { tls: false }),
    router('api@internal', 'PathPrefix(`/api`)', { service: 'api@internal' }),
    router('dashboard@internal', 'PathPrefix(`/dashboard`)', { service: 'dashboard@internal' }),
    router('acme-http@internal', 'PathPrefix(`/.well-known/acme-challenge/`)', {
      service: 'acme-http@internal',
    }),
    router('web-to-websecure@internal', 'HostRegexp(`.+`)', {
      tls: false,
      service: 'noop@internal',
      middlewares: ['redirect-web-to-websecure@internal'],
    }),
  ],
  services: [
    { name: 'jellyfin@docker', provider: 'docker', status: 'enabled' },
    { name: 'sonarr@docker', provider: 'docker', status: 'enabled' },
    { name: 'radarr@docker', provider: 'docker', status: 'enabled' },
    { name: 'grafana@docker', provider: 'docker', status: 'enabled' },
    { name: 'nextcloud@docker', provider: 'docker', status: 'enabled' },
    { name: 'vaultwarden@docker', provider: 'docker', status: 'enabled' },
    {
      name: 'proxmox@file',
      provider: 'file',
      status: 'enabled',
      loadBalancer: { servers: [{ url: 'https://192.168.1.100:8006' }] },
    },
    { name: 'nas@file', provider: 'file', status: 'enabled' },
  ],
  middlewares: [
    {
      name: 'authelia@docker',
      provider: 'docker',
      type: 'forwardauth',
      forwardAuth: { address: 'http://authelia:9091/api/authz/forward-auth' },
    },
    {
      name: 'secured@file',
      provider: 'file',
      type: 'chain',
      chain: { middlewares: ['gzip', 'authelia@docker'] },
    },
    { name: 'gzip@file', provider: 'file', type: 'compress' },
    {
      name: 'lan-ipallowlist@file',
      provider: 'file',
      type: 'ipallowlist',
      ipAllowList: { sourceRange: ['192.168.1.0/24'] },
    },
    { name: 'custom-plugin@file', provider: 'file', type: 'plugin-example' },
    { name: 'redirect-https@file', provider: 'file', type: 'redirectscheme' },
    {
      name: 'redirect-web-to-websecure@internal',
      provider: 'internal',
      type: 'redirectscheme',
    },
  ],
};

export interface FakeTraefikOptions {
  /** Required `Authorization` header value. */
  authorization?: string;
  /** Items per page (Traefik's `X-Next-Page` pagination). */
  pageSize?: number;
  /** Respond with this status instead of data. */
  status?: number;
  /** Respond with this raw body instead of data. */
  body?: string;
  /** Never respond. */
  hang?: boolean;
}

/** A fake Traefik API on an ephemeral port. `state`/`options` can change between requests. */
export async function startFakeTraefik(
  initial: TraefikFixture = exampleTraefik,
  initialOptions: FakeTraefikOptions = {},
) {
  const control = { state: initial, options: initialOptions };
  const requests: Array<{ url: string; authorization?: string }> = [];

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://traefik.invalid');
    requests.push({ url: url.pathname + url.search, authorization: req.headers.authorization });
    const { options, state } = control;
    if (options.hang) return;
    if (options.authorization && req.headers.authorization !== options.authorization) {
      res.writeHead(401).end('unauthorized');
      return;
    }
    if (options.status) {
      res.writeHead(options.status).end('error');
      return;
    }
    if (options.body !== undefined) {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(options.body);
      return;
    }
    const kind = url.pathname.replace('/api/http/', '') as keyof TraefikFixture;
    const items = state[kind];
    if (!items) {
      res.writeHead(404).end('not found');
      return;
    }
    const size = options.pageSize ?? Number(url.searchParams.get('per_page') ?? 100);
    const page = Number(url.searchParams.get('page') ?? 1);
    const slice = items.slice((page - 1) * size, page * size);
    // Traefik sends X-Next-Page: 1 on the last page.
    const next = page * size < items.length ? page + 1 : 1;
    res
      .writeHead(200, { 'Content-Type': 'application/json', 'X-Next-Page': String(next) })
      .end(JSON.stringify(slice));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    control,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
