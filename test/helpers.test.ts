import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadServer, makeTempDir } from './helpers.js';

// The two tests run in order: the first records the directories, the second checks
// that the afterEach hook from setup.ts removed them (#8).
const created: string[] = [];

describe('test helpers', () => {
  it('creates temp data directories', async () => {
    const { dataDir } = await loadServer();
    created.push(dataDir, makeTempDir());
    for (const dir of created) expect(fs.existsSync(dir)).toBe(true);
  });

  it('removes them after each test', () => {
    expect(created).toHaveLength(2);
    for (const dir of created) expect(fs.existsSync(dir)).toBe(false);
  });
});
