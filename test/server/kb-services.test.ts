import { describe, expect, it } from 'vitest';
import { loadServer } from '../helpers.js';
import type { TraefikRoute } from '../../server/traefik.js';

const route = (routerName: string, serviceName = routerName): TraefikRoute => ({
  id: `traefik-${serviceName}-file`,
  routerName,
  serviceName,
  provider: 'file',
  url: `https://${routerName}.example.com`,
  https: true,
  exposure: 'private',
  exposureSource: 'example',
});

describe('new knowledge-base services', () => {
  it.each([
    ['freikin/dawarich:latest', 'Dawarich', 'dawarich'],
    ['johly/airtrail:latest', 'AirTrail', 'air-trail'],
    ['ghcr.io/moghtech/komodo-core:latest', 'Komodo', 'komodo'],
    ['henrygd/beszel:latest', 'Beszel', 'beszel'],
    ['ghcr.io/karakeep-app/karakeep:release', 'Karakeep', 'karakeep'],
  ])('recognises %s', async (image, name, icon) => {
    const { matchContainer } = await loadServer();
    const svc = matchContainer({
      id: 'abc',
      name: 'container',
      image,
      state: 'running',
      labels: {},
      ports: [],
    });
    expect(svc).toMatchObject({ name, icon });
  });

  it.each([
    ['ghcr.io/henrygd/beszel/beszel:latest', 'Beszel'],
    ['ghcr.io/henrygd/beszel/beszel-agent:latest', 'Beszel Agent'],
    ['paperlessngx/paperless-ngx:latest', 'Paperless-ngx'],
    ['ghcr.io/paperless-ngx/paperless-ngx:2', 'Paperless-ngx'],
    ['stirlingtools/stirling-pdf:latest', 'Stirling-PDF'],
    ['ghcr.io/stirling-tools/stirling-pdf:latest', 'Stirling-PDF'],
    ['qbittorrentofficial/qbittorrent-nox:latest', 'qBittorrent'],
    ['ghcr.io/qbittorrent/docker-qbittorrent-nox:latest', 'qBittorrent'],
    ['jlesage/nginx-proxy-manager:latest', 'Nginx Proxy Manager'],
  ])('recognises the published image %s (M3 gate)', async (image, name) => {
    const { matchContainer } = await loadServer();
    const base = { id: 'abc', name: 'container', state: 'running', labels: {}, ports: [] };
    expect(matchContainer({ ...base, image }).name).toBe(name);
  });

  it('hides the Beszel agent on the GitHub registry path too', async () => {
    const { matchContainer } = await loadServer();
    const base = { id: 'abc', name: 'container', state: 'running', labels: {}, ports: [] };
    const image = 'ghcr.io/henrygd/beszel/beszel-agent:latest';
    expect(matchContainer({ ...base, image }).hidden).toBe(true);
    expect(matchContainer({ ...base, image: 'ghcr.io/henrygd/beszel/beszel' }).hidden).toBe(false);
  });

  it('hides Redis Stack as infrastructure, like Redis', async () => {
    const { matchContainer } = await loadServer();
    const base = { id: 'abc', name: 'container', state: 'running', labels: {}, ports: [] };
    expect(matchContainer({ ...base, image: 'redis/redis-stack-server:latest' }).hidden).toBe(true);
  });

  it('hides the Beszel agent but not the hub', async () => {
    const { matchContainer } = await loadServer();
    const base = { id: 'abc', name: 'container', state: 'running', labels: {}, ports: [] };
    expect(matchContainer({ ...base, image: 'henrygd/beszel-agent:latest' }).hidden).toBe(true);
    expect(matchContainer({ ...base, image: 'henrygd/beszel:latest' }).hidden).toBe(false);
  });
});

describe('file-provider services (#29)', () => {
  it.each([
    ['proxmox', 'Proxmox VE', 'proxmox'],
    ['pve', 'Proxmox VE', 'proxmox'],
    ['pbs', 'Proxmox Backup Server', 'proxmox-backup-server'],
    ['haos', 'Home Assistant', 'home-assistant'],
    ['home-assistant-os', 'Home Assistant', 'home-assistant'],
    ['truenas', 'TrueNAS', 'truenas'],
    ['synology', 'Synology DSM', 'synology-dsm'],
    ['qnap', 'QNAP QTS', 'qnap'],
    ['unraid', 'Unraid', 'unraid'],
    ['omv', 'openmediavault', 'openmediavault'],
    ['opnsense', 'OPNsense', 'opnsense'],
    ['pfsense', 'pfSense', 'pfsense'],
    ['openwrt', 'OpenWrt', 'openwrt'],
    ['mikrotik', 'MikroTik RouterOS', 'mikrotik'],
    ['fritzbox', 'FRITZ!Box', 'fritzbox'],
  ])('router %s is %s', async (routerName, name, icon) => {
    const { matchRoute } = await loadServer();
    expect(matchRoute(route(routerName))).toMatchObject({ name, icon, hidden: false });
  });

  it('matches on the Traefik service name when the router name is unknown', async () => {
    const { matchRoute } = await loadServer();
    expect(matchRoute(route('edge-router-1', 'proxmox')).name).toBe('Proxmox VE');
  });

  it('ignores case and separators', async () => {
    const { matchRoute } = await loadServer();
    expect(matchRoute(route('Proxmox_VE')).name).toBe('Proxmox VE');
  });

  it('does not use Traefik names to recognise a container', async () => {
    const { matchContainer } = await loadServer();
    const svc = matchContainer({
      id: 'abc',
      name: 'pve',
      image: 'example/unknown:1',
      state: 'running',
      labels: {},
      ports: [],
    });
    expect(svc.name).toBe('pve');
  });

  it('leaves an unknown router name as it is', async () => {
    const { matchRoute } = await loadServer();
    expect(matchRoute(route('nas'))).toMatchObject({ name: 'nas', icon: '', category: 'Other' });
  });
});
