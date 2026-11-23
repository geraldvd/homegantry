const URL_ERROR = 'URL must start with http:// or https:// (for example https://app.example.com).';

function isHttp(value: string): boolean {
  try {
    const { protocol, hostname } = new URL(value);
    return (protocol === 'http:' || protocol === 'https:') && hostname !== '';
  } catch {
    return false;
  }
}

/** The URL if it is safe to use as a link (http/https only), otherwise `undefined`. */
export function safeHref(url: string): string | undefined {
  const value = url.trim();
  return isHttp(value) ? value : undefined;
}

export type UrlInputResult = { url: string; error?: undefined } | { url?: undefined; error: string };

/**
 * Check what the user typed into a URL field. A bare host (`192.168.1.100:8096`) gets `http://`;
 * other schemes (`javascript:`, `ftp://`) are refused with a clear message.
 */
export function normaliseUrlInput(
  input: string,
  options: { allowNone?: boolean } = {},
): UrlInputResult {
  const value = input.trim();
  if (options.allowNone && value === '#') return { url: '#' };

  let candidate = value;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    // "host:8080" is a host and port; "javascript:..." is a scheme.
    if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(value)) return { error: URL_ERROR };
    candidate = `http://${value}`;
  }
  return isHttp(candidate) ? { url: candidate } : { error: URL_ERROR };
}
