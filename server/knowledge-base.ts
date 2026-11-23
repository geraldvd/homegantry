/**
 * Runtime lookups in the knowledge base. The data is generated from `knowledge-base/*.yaml` at
 * build time (`npm run kb:build`), so the server needs no YAML parser.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageMatches } from './image-ref.js';
import type { KnownService } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function load(): KnownService[] {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'knowledge-base.generated.json'), 'utf-8');
    return JSON.parse(raw) as KnownService[];
  } catch {
    console.warn('[homegantry] knowledge base not found; run `npm run kb:build`');
    return [];
  }
}

const knownServices = load();

function normalise(s: string): string {
  return s.toLowerCase().replace(/[-_.\s]/g, '');
}

export function findByAlias(alias: string): KnownService | undefined {
  const norm = normalise(alias);
  return knownServices.find((ks) => ks.aliases.some((a) => normalise(a) === norm));
}

/** A Traefik router/service name: the entry's `traefik` names first, then its aliases. */
export function findByRouteName(name: string): KnownService | undefined {
  const norm = normalise(name);
  return (
    knownServices.find((ks) => ks.traefik?.some((t) => normalise(t) === norm)) ?? findByAlias(name)
  );
}

/** The entry with the most specific matching pattern: literal before glob, then longest. */
export function findByImage(image: string): KnownService | undefined {
  let best: { entry: KnownService; score: number } | undefined;
  for (const entry of knownServices) {
    for (const pattern of entry.patterns) {
      if (!imageMatches(pattern, image)) continue;
      const score = (pattern.includes('*') ? 0 : 1000) + pattern.length;
      if (!best || score > best.score) best = { entry, score };
    }
  }
  return best?.entry;
}
