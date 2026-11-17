import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { loadServer, makeTempDir } from '../helpers.js';

describe('config', () => {
  it('uses documented defaults', async () => {
    const { config } = await loadServer();
    expect(config).toMatchObject({
      port: 3000,
      host: '',
      title: 'HomeGantry',
      dockerSocket: '/var/run/docker.sock',
      pollInterval: 60,
      showStopped: false,
      homepageCompat: true,
      excludeSelf: true,
      logLevel: 'info',
      composeOnly: true,
    });
  });

  it('parses numbers and booleans from the environment', async () => {
    const { config } = await loadServer({
      HOMEGANTRY_PORT: '8080',
      HOMEGANTRY_POLL_INTERVAL: 'not-a-number',
      HOMEGANTRY_SHOW_STOPPED: '1',
      HOMEGANTRY_HOMEPAGE_COMPAT: 'TRUE',
      HOMEGANTRY_EXCLUDE_SELF: 'yes',
      HOMEGANTRY_HOST: '192.168.1.100',
    });
    expect(config).toMatchObject({
      port: 8080,
      pollInterval: 60,
      showStopped: true,
      homepageCompat: true,
      excludeSelf: false,
      host: '192.168.1.100',
    });
  });
});

describe('storage', () => {
  it('loads existing JSON files from the data directory', async () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, 'stacks.json'), JSON.stringify({ media: { visible: false } }));
    fs.writeFileSync(path.join(dir, 'settings.json'), '{ not json');
    vi.resetModules();
    vi.stubEnv('HOMEGANTRY_DATA_DIR', dir);
    const storage = await import('../../server/storage.js');
    expect(storage.getStackConfig('media')).toEqual({ visible: false });
    expect(storage.getStackConfig('other')).toEqual({ visible: true });
    // Corrupt files fall back to defaults.
    expect(storage.settingsStore.get().dashboardTitle).toBe('HomeGantry');
  });

  it('writes atomically and creates the data directory if missing', async () => {
    const s = await loadServer();
    const nested = path.join(s.dataDir, 'nested');
    vi.resetModules();
    vi.stubEnv('HOMEGANTRY_DATA_DIR', nested);
    const storage = await import('../../server/storage.js');
    storage.manualServicesStore.set([]);
    expect(fs.readdirSync(nested)).toEqual(['manual-services.json']);
  });
});
