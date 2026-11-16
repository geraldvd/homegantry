import type Dockerode from 'dockerode';

/**
 * Build a Docker `ContainerInfo` (as returned by `listContainers`) with sensible
 * defaults. Only example data: example.com / 192.168.1.100.
 */
export function container(opts: {
  id?: string;
  name: string;
  image: string;
  state?: string;
  labels?: Record<string, string>;
  project?: string | null;
  service?: string;
  ports?: Array<{ PrivatePort: number; PublicPort?: number }>;
}): Dockerode.ContainerInfo {
  const labels: Record<string, string> = { ...(opts.labels ?? {}) };
  if (opts.project !== null) {
    labels['com.docker.compose.project'] ??= opts.project ?? 'default';
    labels['com.docker.compose.service'] ??= opts.service ?? opts.name;
  }
  return {
    Id: opts.id ?? `id-${opts.name}`,
    Names: [`/${opts.name}`],
    Image: opts.image,
    ImageID: 'sha256:0000',
    Command: '',
    Created: 0,
    State: opts.state ?? 'running',
    Status: '',
    Ports: (opts.ports ?? []).map((p) => ({
      IP: '0.0.0.0',
      Type: 'tcp',
      ...p,
    })) as Dockerode.Port[],
    Labels: labels,
    HostConfig: { NetworkMode: 'bridge' },
    NetworkSettings: { Networks: {} },
    Mounts: [],
  };
}

/** A small, realistic-looking example lab used by the API tests and the dev screenshot fixture. */
export const exampleLab: Dockerode.ContainerInfo[] = [
  container({
    name: 'jellyfin',
    image: 'lscr.io/linuxserver/jellyfin:latest',
    project: 'media',
    labels: { 'traefik.http.routers.jellyfin.rule': 'Host(`jellyfin.example.com`)' },
  }),
  container({
    name: 'sonarr',
    image: 'lscr.io/linuxserver/sonarr:4',
    project: 'media',
    labels: { 'traefik.http.routers.sonarr.rule': 'Host(`sonarr.example.com`)' },
  }),
  container({
    name: 'radarr',
    image: 'ghcr.io/hotio/radarr:release',
    project: 'media',
    labels: { 'traefik.http.routers.radarr.rule': 'Host(`radarr.example.com`)' },
  }),
  container({
    name: 'prowlarr',
    image: 'lscr.io/linuxserver/prowlarr:latest',
    project: 'media',
    ports: [{ PrivatePort: 9696, PublicPort: 9696 }],
  }),
  container({
    name: 'grafana',
    image: 'grafana/grafana-oss:11.3.0',
    project: 'monitoring',
    labels: { 'traefik.http.routers.grafana.rule': 'Host(`grafana.example.com`)' },
  }),
  container({
    name: 'uptime-kuma',
    image: 'louislam/uptime-kuma:1',
    project: 'monitoring',
    ports: [{ PrivatePort: 3001, PublicPort: 3001 }],
  }),
  container({
    name: 'nextcloud',
    image: 'nextcloud:30-apache',
    project: 'cloud',
    labels: { 'traefik.http.routers.nextcloud.rule': 'Host(`cloud.example.com`)' },
  }),
  container({
    name: 'nextcloud-db',
    image: 'mariadb:11',
    project: 'cloud',
    service: 'db',
  }),
  container({
    name: 'immich-server',
    image: 'ghcr.io/immich-app/immich-server:release',
    project: 'cloud',
    ports: [{ PrivatePort: 2283, PublicPort: 2283 }],
  }),
  container({
    name: 'vaultwarden',
    image: 'vaultwarden/server:latest',
    project: 'security',
    labels: { 'traefik.http.routers.vault.rule': 'Host(`vault.example.com`)' },
  }),
  container({
    name: 'homeassistant',
    image: 'ghcr.io/home-assistant/home-assistant:stable',
    project: 'home',
    ports: [{ PrivatePort: 8123, PublicPort: 8123 }],
  }),
  container({
    name: 'wiki',
    image: 'example/wiki:1.0',
    project: 'tools',
    labels: {
      'homegantry.name': 'Team Wiki',
      'homegantry.icon': 'bookstack',
      'homegantry.category': 'Productivity',
      'homegantry.description': 'Notes and runbooks',
      'homegantry.url': 'https://wiki.example.com',
    },
  }),
];
