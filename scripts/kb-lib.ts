/**
 * Knowledge-base tooling: schema, validation and the YAML-to-JSON build. Build-time only; the
 * server reads the generated JSON and needs no YAML parser.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import { parseImageRef } from '../server/image-ref.js';
import type { KnownService } from '../server/types.js';

export const KB_DIR = path.resolve(import.meta.dirname, '../knowledge-base');
export const ICON_METADATA = path.join(KB_DIR, '_meta/dashboard-icons.json');
export const GENERATED_FILE = path.resolve(
  import.meta.dirname,
  '../server/knowledge-base.generated.json',
);
export const TEMPLATE_FILE = '_template.yaml';

const FILE_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ICON_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// A repository without tag or digest; `*` is the only glob character.
const IMAGE_PATTERN =
  /^[a-z0-9*]([a-z0-9._*-]*[a-z0-9*])?(:[0-9]+)?(\/[a-z0-9*]([a-z0-9._*-]*[a-z0-9*])?)*$/i;

const text = (max: number) => z.string().trim().min(1).max(max);

/** The format of one `knowledge-base/<id>.yaml` file. */
export const entrySchema = z
  .strictObject({
    name: text(60),
    description: text(160),
    icon: z.string().regex(ICON_SLUG, 'must be a dashboard-icons slug').optional(),
    category: text(40),
    defaultPort: z.number().int().min(1).max(65535).optional(),
    patterns: z
      .array(z.string().regex(IMAGE_PATTERN, 'must be an image repository without tag or digest'))
      .default([]),
    aliases: z.array(text(60)).default([]),
    traefik: z.array(text(60)).optional(),
    infrastructure: z.boolean().optional(),
  })
  .refine((e) => e.patterns.length + e.aliases.length + (e.traefik?.length ?? 0) > 0, {
    message: 'needs at least one of patterns, aliases or traefik',
  });

export interface KbEntry extends KnownService {
  /** File name without `.yaml`. */
  id: string;
}

export interface KbIssue {
  file: string;
  message: string;
}

export function normaliseName(name: string): string {
  return name.toLowerCase().replace(/[-_.\s]/g, '');
}

function normalisePattern(pattern: string): string {
  const { registry, path: repo } = parseImageRef(pattern);
  return registry ? `${registry}/${repo}` : repo;
}

/** Parse and schema-check every `<id>.yaml` in `dir` (files starting with `_` are not services). */
export function readEntries(dir: string): { entries: KbEntry[]; issues: KbIssue[] } {
  const entries: KbEntry[] = [];
  const issues: KbIssue[] = [];
  const files = fs
    .readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f) && !f.startsWith('_'))
    .sort();
  for (const file of files) {
    const id = file.replace(/\.ya?ml$/, '');
    if (!file.endsWith('.yaml')) issues.push({ file, message: 'must use the .yaml extension' });
    if (!FILE_ID.test(id)) {
      issues.push({ file, message: 'file name must be lower-case words separated by dashes' });
    }
    const entry = parseEntry(path.join(dir, file), file, issues);
    if (entry) entries.push({ id, ...entry });
  }
  return { entries, issues };
}

function parseEntry(fullPath: string, file: string, issues: KbIssue[]) {
  let raw: unknown;
  try {
    raw = parse(fs.readFileSync(fullPath, 'utf-8'));
  } catch (err) {
    issues.push({ file, message: `invalid YAML: ${(err as Error).message.split('\n')[0]}` });
    return undefined;
  }
  const result = entrySchema.safeParse(raw);
  if (result.success) return { icon: '', ...result.data };
  for (const issue of result.error.issues) {
    issues.push({ file, message: `${issue.path.join('.') || 'entry'}: ${issue.message}` });
  }
  return undefined;
}

/** Duplicate patterns and names across entries, and icon slugs missing from dashboard-icons. */
export function checkEntries(entries: readonly KbEntry[], iconSlugs: ReadonlySet<string>) {
  const issues: KbIssue[] = [];
  const seen = (kind: string, normalise: (s: string) => string) => {
    const owners = new Map<string, string>();
    return (entry: KbEntry, values: readonly string[]) => {
      const own = new Set<string>();
      for (const value of values) {
        const key = normalise(value);
        const file = `${entry.id}.yaml`;
        const owner = owners.get(key);
        if (owner && owner !== entry.id) {
          issues.push({ file, message: `duplicate ${kind} "${value}" (also in ${owner}.yaml)` });
        }
        if (own.has(value)) issues.push({ file, message: `${kind} "${value}" listed twice` });
        own.add(value);
        owners.set(key, entry.id);
      }
    };
  };
  const patterns = seen('pattern', normalisePattern);
  const aliases = seen('alias', normaliseName);
  const traefik = seen('traefik name', normaliseName);
  for (const entry of entries) {
    patterns(entry, entry.patterns);
    aliases(entry, entry.aliases);
    traefik(entry, entry.traefik ?? []);
    if (entry.icon && !iconSlugs.has(entry.icon)) {
      issues.push({
        file: `${entry.id}.yaml`,
        message: `unknown icon slug "${entry.icon}" (not in dashboard-icons)`,
      });
    }
  }
  return issues;
}

export function loadIconSlugs(file: string = ICON_METADATA): Set<string> {
  const data = JSON.parse(fs.readFileSync(file, 'utf-8')) as { svg: string[]; png: string[] };
  return new Set([...data.svg, ...data.png]);
}

/** Every problem in a knowledge-base directory, including its template when it has one. */
export function checkDirectory(dir: string, iconSlugs: ReadonlySet<string>): KbIssue[] {
  const { entries, issues } = readEntries(dir);
  const template = path.join(dir, TEMPLATE_FILE);
  if (fs.existsSync(template)) {
    const parsed = parseEntry(template, TEMPLATE_FILE, issues);
    if (parsed?.icon && !iconSlugs.has(parsed.icon)) {
      issues.push({ file: TEMPLATE_FILE, message: `unknown icon slug "${parsed.icon}"` });
    }
  }
  return [...issues, ...checkEntries(entries, iconSlugs)];
}

/** Write the runtime JSON. Throws on an invalid entry, so a bad file cannot reach a build. */
export function buildKnowledgeBase(out: string = GENERATED_FILE, dir: string = KB_DIR): number {
  const { entries, issues } = readEntries(dir);
  if (issues.length > 0) {
    throw new Error(issues.map((i) => `${i.file}: ${i.message}`).join('\n'));
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(entries)}\n`);
  return entries.length;
}
