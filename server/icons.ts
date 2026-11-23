/**
 * Where the browser loads service icons from (`HOMEGANTRY_ICON_SOURCE`): the dashboard-icons CDN,
 * a self-hosted copy, or nowhere (letter avatars, no external request).
 */
import { config } from './config.js';
import { safeHttpUrl } from './urls.js';

export const ICON_CDN = 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons';

export type IconSource = { mode: 'cdn' | 'custom'; baseUrl: string } | { mode: 'off' };

/** Parse the option. Anything invalid turns icons off: a typo must not cause external requests. */
export function parseIconSource(raw: string): IconSource {
  const value = raw.trim();
  const lower = value.toLowerCase();
  if (!value || lower === 'cdn') return { mode: 'cdn', baseUrl: ICON_CDN };
  if (lower === 'off') return { mode: 'off' };
  const safe = safeHttpUrl(value);
  if (!safe) {
    console.warn('[homegantry] HOMEGANTRY_ICON_SOURCE is invalid; icons are off');
    return { mode: 'off' };
  }
  const url = new URL(safe);
  return { mode: 'custom', baseUrl: `${url.origin}${url.pathname}`.replace(/\/+$/, '') };
}

export const iconSource: IconSource = parseIconSource(config.iconSource);

/** The CSP `img-src`. Explicit icon URLs (labels, overrides) may point anywhere unless icons are off. */
export function imgSrc(source: IconSource = iconSource): string {
  return source.mode === 'off' ? "img-src 'self' data:" : "img-src 'self' data: https: http:";
}
