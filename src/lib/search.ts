import type { Service } from '../types';
import { safeHref } from './url';

/** Lower case without accents, so "Médiathèque" is found by "mediatheque". */
export function normalise(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** The host name of an http(s) link, lower case without port; `''` for anything else. */
export function urlHost(url: string): string {
  const href = safeHref(url);
  if (!href) return '';
  try {
    return new URL(href).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return '';
  }
}

function words(query: string): string[] {
  return normalise(query).split(/\s+/).filter(Boolean);
}

function haystack(s: Service): string[] {
  return [s.name, s.description, s.category, s.stack ?? '', urlHost(s.url)].map(normalise);
}

/** True when every word of `query` occurs in the name, description, category, stack or URL host. */
export function matchesQuery(s: Service, query: string): boolean {
  const terms = words(query);
  if (terms.length === 0) return true;
  const fields = haystack(s);
  return terms.every((t) => fields.some((f) => f.includes(t)));
}

/** 0: the name starts with the query, 1: every word is in the name, 2: found in another field. */
function rank(s: Service, query: string): number {
  const name = normalise(s.name);
  const full = words(query).join(' ');
  if (name.startsWith(full)) return 0;
  return words(query).every((t) => name.includes(t)) ? 1 : 2;
}

export function byOrderThenName(a: Service, b: Service): number {
  return (
    a.sortOrder - b.sortOrder ||
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
  );
}

/** Matching services, name matches first; ties by sort order, then name. Empty query: none. */
export function searchServices(services: readonly Service[], query: string): Service[] {
  if (words(query).length === 0) return [];
  return services
    .filter((s) => matchesQuery(s, query))
    .map((s) => ({ s, r: rank(s, query) }))
    .sort((a, b) => a.r - b.r || byOrderThenName(a.s, b.s))
    .map(({ s }) => s);
}

// ---- the query in the address bar (?q=) ----

export function readQueryParam(): string {
  try {
    return new URLSearchParams(window.location.search).get('q') ?? '';
  } catch {
    return '';
  }
}

/** Keep `?q=` in sync without adding history entries (other parameters are kept). */
export function writeQueryParam(query: string): void {
  try {
    const url = new URL(window.location.href);
    if (query) url.searchParams.set('q', query);
    else url.searchParams.delete('q');
    if (url.href !== window.location.href) window.history.replaceState(null, '', url);
  } catch {
    // history unavailable (sandboxed frame): the query just is not bookmarkable
  }
}
