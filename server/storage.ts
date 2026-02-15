import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import type { ServiceOverride, ManualService, DashboardSettings, StackConfig } from './types.js';

class JsonStore<T> {
  private cache: T;
  private filePath: string;

  constructor(filename: string, defaultValue: T) {
    this.filePath = path.resolve(config.dataDir, filename);
    this.cache = defaultValue;
    this.load(defaultValue);
  }

  private load(defaultValue: T): void {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      this.cache = JSON.parse(raw) as T;
    } catch {
      this.cache = defaultValue;
    }
  }

  get(): T {
    return this.cache;
  }

  set(value: T): void {
    this.cache = value;
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = this.filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
    fs.renameSync(tmp, this.filePath);
  }
}

export const overridesStore = new JsonStore<Record<string, ServiceOverride>>(
  'overrides.json',
  {},
);

export const manualServicesStore = new JsonStore<ManualService[]>(
  'manual-services.json',
  [],
);

export const settingsStore = new JsonStore<DashboardSettings>(
  'settings.json',
  {
    dashboardTitle: config.title,
    columns: 4,
    showStatus: true,
    layout: 'grid',
    showStopped: config.showStopped,
    groupBy: 'category',
  },
);

export const stacksStore = new JsonStore<Record<string, StackConfig>>(
  'stacks.json',
  {},
);

export function getStackConfig(name: string): StackConfig {
  const stacks = stacksStore.get();
  return stacks[name] ?? { visible: true };
}

/** Resolve an override for a container by its id or name. */
export function resolveOverride(
  containerId: string,
  containerName: string,
): ServiceOverride | undefined {
  const overrides = overridesStore.get();
  return overrides[containerId] ?? overrides[containerName] ?? undefined;
}
