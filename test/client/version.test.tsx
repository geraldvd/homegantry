// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';

/** EventSource stand-in that delivers an empty dashboard. */
class FakeEventSource {
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {}
  set onmessage(fn: (ev: { data: string }) => void) {
    queueMicrotask(() => fn({ data: JSON.stringify({ type: 'initial_state', data: [] }) }));
  }
  close() {}
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function backend(uiConfig: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/ui-config') return uiConfig ? json(200, uiConfig) : json(500, {});
      if (url === '/api/auth') {
        return json(200, {
          canEdit: false,
          method: null,
          readonly: false,
          methods: { token: false, header: false },
        });
      }
      return json(404, { error: 'not found' });
    }),
  );
}

beforeEach(() => {
  vi.stubGlobal('EventSource', FakeEventSource);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('version in the footer', () => {
  it('shows the server version with a link to its release notes', async () => {
    backend({ icons: { mode: 'off' }, version: '0.2.0' });
    render(<App />);
    const link = await screen.findByRole('link', { name: /HomeGantry v0\.2\.0/ });
    expect(link.getAttribute('href')).toBe(
      'https://github.com/geraldvd/homegantry/releases/tag/v0.2.0',
    );
    expect(link.getAttribute('rel')).toContain('noreferrer');
  });

  it('shows only the name while the server has not answered or the version is unknown', async () => {
    backend({ icons: { mode: 'off' }, version: 'unknown' });
    render(<App />);
    expect(await screen.findByText('HomeGantry', { selector: 'footer *' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /HomeGantry v/ })).toBeNull();
  });

  it('builds no link from a version that is not semver', async () => {
    backend({ icons: { mode: 'off' }, version: 'javascript:alert(1)' });
    render(<App />);
    expect(await screen.findByText('HomeGantry', { selector: 'footer *' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /HomeGantry/ })).toBeNull();
  });

  it('copes with a failing ui-config request', async () => {
    backend(null);
    render(<App />);
    expect(await screen.findByText('HomeGantry', { selector: 'footer *' })).toBeTruthy();
  });
});
