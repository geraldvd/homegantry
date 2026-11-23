import type { IconSource } from '../types';

const EXPLICIT_FORMAT = /\.(svg|png|webp)$/i;

/**
 * Image URLs to try for an icon, best first; empty means "show the letter avatar". A full URL is
 * used as it is, a dashboard-icons slug tries SVG and then PNG. With the source `off` nothing is
 * ever requested.
 */
export function iconCandidates(icon: string, source: IconSource): string[] {
  if (!icon || source.mode === 'off') return [];
  if (/^https?:\/\//i.test(icon)) return [icon];
  const format = EXPLICIT_FORMAT.exec(icon)?.[1]?.toLowerCase();
  if (format) {
    const slug = icon.slice(0, -(format.length + 1));
    return [`${source.baseUrl}/${format}/${slug}.${format}`];
  }
  return [`${source.baseUrl}/svg/${icon}.svg`, `${source.baseUrl}/png/${icon}.png`];
}
