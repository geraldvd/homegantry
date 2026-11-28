// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import type { AuthStatus, Service } from '../../src/types';

const TOKEN = 'change-me-0123456789abcdefghij';

const service: Service = {
  id: 'id-jellyfin',
  source: 'docker',
  name: 'Jellyfin',
  description: 'The free software media system',
  url: 'https://jellyfin.example.com',
  icon: '',
  category: 'Media',
  status: 'running',
  stack: 'media',
  hidden: false,
  sortOrder: 0,
};

/** EventSource stand-in: delivers the initial state as soon as a handler is attached. */
class FakeEventSource {
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private handler: ((ev: { data: string }) => void) | null = null;
  constructor(public url: string) {}
  set onmessage(fn: (ev: { data: string }) => void) {
    this.handler = fn;
    queueMicrotask(() => fn({ data: JSON.stringify({ type: 'initial_state', data: [service] }) }));
  }
  get onmessage() {
    return this.handler!;
  }
  close() {}
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Fake backend: token-protected writes, like the real server with HOMEGANTRY_ADMIN_TOKEN set. */
function fakeBackend(methods: AuthStatus['methods'], readonly = false) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const auth = new Headers(init?.headers).get('Authorization');
    const tokenOk = methods.token && auth === `Bearer ${TOKEN}`;
    if (url === '/api/auth') {
      if (auth && !tokenOk) return json(401, { error: 'invalid token' });
      return json(200, {
        canEdit: tokenOk,
        method: tokenOk ? 'token' : null,
        readonly,
        methods,
      });
    }
    if (url === '/api/stacks') return json(200, { media: { visible: true } });
    if (init?.method && init.method !== 'GET') {
      if (!tokenOk) return json(401, { error: 'authentication required' });
      return json(200, { ok: true });
    }
    return json(404, { error: 'not found' });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.stubGlobal('EventSource', FakeEventSource);
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderApp() {
  render(<App />);
  await screen.findByText('Jellyfin');
}

function hoverCard() {
  fireEvent.mouseEnter(screen.getByText('Jellyfin').closest('a')!);
}

describe('read-only UI', () => {
  it('is read-only by default and hides every edit control', async () => {
    fakeBackend({ token: false, header: false });
    await renderApp();
    const badge = await screen.findByText('Read-only');
    expect(badge.closest('[title]')!.getAttribute('title')).toMatch(/HOMEGANTRY_ADMIN_TOKEN/);
    expect(screen.queryByText('+ Add Service')).toBeNull();
    expect(screen.queryByLabelText('Settings')).toBeNull();
    expect(screen.queryByText('Unlock editing')).toBeNull();
    hoverCard();
    expect(screen.queryByLabelText('Edit Jellyfin')).toBeNull();
    expect(screen.queryByLabelText('Hide Jellyfin')).toBeNull();
  });

  it('explains READONLY mode', async () => {
    fakeBackend({ token: false, header: false }, true);
    await renderApp();
    const badge = await screen.findByText('Read-only');
    expect(badge.closest('[title]')!.getAttribute('title')).toMatch(/HOMEGANTRY_READONLY/);
  });

  it('shows "Unlock editing" when a token is configured', async () => {
    fakeBackend({ token: true, header: false });
    await renderApp();
    expect(await screen.findByText('Unlock editing')).toBeTruthy();
    expect(screen.queryByText('+ Add Service')).toBeNull();
  });
});

describe('unlock editing', () => {
  async function unlock(token: string) {
    fireEvent.click(await screen.findByText('Unlock editing'));
    fireEvent.change(screen.getByLabelText('Admin token'), { target: { value: token } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    });
  }

  it('unlocks with the correct token, stores it for the session and sends it on edits', async () => {
    const fetchMock = fakeBackend({ token: true, header: false });
    await renderApp();
    await unlock(TOKEN);

    expect(await screen.findByText('+ Add Service')).toBeTruthy();
    expect(screen.getByLabelText('Settings')).toBeTruthy();
    expect(screen.queryByText('Read-only')).toBeNull();
    expect(sessionStorage.getItem('homegantry.adminToken')).toBe(TOKEN);

    hoverCard();
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Hide Jellyfin'));
    });
    const write = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(write?.[0]).toBe('/api/services/id-jellyfin/override');
    expect(new Headers(write?.[1]?.headers).get('Authorization')).toBe(`Bearer ${TOKEN}`);
  });

  it('shows an error for a wrong token and stays read-only', async () => {
    fakeBackend({ token: true, header: false });
    await renderApp();
    await unlock('change-me-wrong-token-000000000');
    expect(await screen.findByText(/invalid token/i)).toBeTruthy();
    expect(screen.queryByText('+ Add Service')).toBeNull();
    expect(sessionStorage.getItem('homegantry.adminToken')).toBeNull();
  });

  it('restores the unlocked state from sessionStorage', async () => {
    sessionStorage.setItem('homegantry.adminToken', TOKEN);
    fakeBackend({ token: true, header: false });
    await renderApp();
    expect(await screen.findByText('+ Add Service')).toBeTruthy();
  });

  it('drops a stale stored token and falls back to read-only', async () => {
    sessionStorage.setItem('homegantry.adminToken', 'change-me-stale-token-0000000000');
    fakeBackend({ token: true, header: false });
    await renderApp();
    expect(await screen.findByText('Unlock editing')).toBeTruthy();
    await waitFor(() => expect(sessionStorage.getItem('homegantry.adminToken')).toBeNull());
  });

  it('"Lock" forgets the token', async () => {
    fakeBackend({ token: true, header: false });
    await renderApp();
    await unlock(TOKEN);
    await act(async () => {
      fireEvent.click(await screen.findByText('Lock'));
    });
    expect(await screen.findByText('Unlock editing')).toBeTruthy();
    expect(sessionStorage.getItem('homegantry.adminToken')).toBeNull();
  });
});
