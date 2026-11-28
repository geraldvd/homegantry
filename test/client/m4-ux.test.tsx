// @vitest-environment jsdom
/**
 * M4 UX: search, keyboard navigation, grouping, focus handling, the edit-modal fixes (#31, #32),
 * one status per card (#33), a fresh "last checked" time (#30) and accessibility basics.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import type { DashboardSettings, Service, SSEEvent } from '../../src/types';

// Newer Node versions define their own (disabled) global `localStorage`, which hides jsdom's.
if (!window.localStorage) {
  const data = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, String(v)),
      removeItem: (k: string) => void data.delete(k),
      clear: () => data.clear(),
    },
  });
}

// axe probes icon fonts with a canvas, which jsdom does not implement (it would only log noise).
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value: () => null,
});

const TOKEN = 'change-me-0123456789abcdefghij';
const checkedAt = '2026-01-01T12:00:00.000Z';

const SERVICES: Service[] = [
  {
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
    health: { status: 'up', checkedAt, httpStatus: 200 },
  },
  {
    id: 'id-plex',
    source: 'docker',
    name: 'Plex',
    description: 'Stream movies and TV',
    url: 'https://plex.example.com',
    icon: '',
    category: 'Media',
    status: 'running',
    stack: 'media',
    hidden: false,
    sortOrder: 0,
  },
  {
    id: 'id-grafana',
    source: 'docker',
    name: 'Grafana',
    description: 'Dashboards for metrics',
    url: 'http://192.168.1.100:3000',
    icon: '',
    category: 'Monitoring',
    status: 'running',
    stack: 'monitoring',
    hidden: false,
    sortOrder: 0,
    health: { status: 'down', checkedAt, reason: 'timeout' },
  },
  {
    id: 'm-router',
    source: 'manual',
    name: 'Router',
    description: 'Home router',
    url: 'http://192.168.1.1',
    icon: '',
    category: 'Network',
    status: 'running',
    hidden: false,
    sortOrder: 0,
  },
  {
    id: 'id-sonarr',
    source: 'docker',
    name: 'Sonarr',
    description: 'TV series',
    url: 'http://192.168.1.100:8989',
    icon: '',
    category: 'Media',
    status: 'stopped',
    stack: 'arr',
    hidden: false,
    sortOrder: 0,
  },
];

const DEFAULT_SETTINGS: DashboardSettings = {
  dashboardTitle: 'HomeGantry',
  columns: 4,
  showStatus: true,
  layout: 'grid',
  showStopped: false,
  groupBy: 'category',
};

/** EventSource stand-in; `FakeEventSource.push()` sends an event to the open dashboard. */
class FakeEventSource {
  static current: FakeEventSource | null = null;
  static initial: Service[] = SERVICES;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private handler: ((ev: { data: string }) => void) | null = null;
  constructor(public url: string) {
    FakeEventSource.current = this;
  }
  set onmessage(fn: (ev: { data: string }) => void) {
    this.handler = fn;
    const data = FakeEventSource.initial;
    queueMicrotask(() => fn({ data: JSON.stringify({ type: 'initial_state', data }) }));
  }
  get onmessage() {
    return this.handler!;
  }
  static push(event: SSEEvent) {
    act(() => FakeEventSource.current!.handler!({ data: JSON.stringify(event) }));
  }
  close() {}
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let settings: DashboardSettings;
let fetchMock: ReturnType<typeof vi.fn>;

function writes() {
  return fetchMock.mock.calls
    .filter(([, init]) => init?.method && init.method !== 'GET')
    .map(([url, init]) => ({
      url: String(url),
      method: init!.method,
      body: JSON.parse(String(init!.body ?? '{}')),
    }));
}

beforeEach(() => {
  settings = { ...DEFAULT_SETTINGS };
  FakeEventSource.initial = SERVICES;
  vi.stubGlobal('EventSource', FakeEventSource);
  sessionStorage.clear();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const auth = new Headers(init?.headers).get('Authorization');
    const tokenOk = auth === `Bearer ${TOKEN}`;
    if (url === '/api/auth') {
      return json(200, {
        canEdit: tokenOk,
        method: tokenOk ? 'token' : null,
        readonly: false,
        methods: { token: true, header: false },
      });
    }
    if (url === '/api/stacks') {
      return json(200, { media: { visible: true }, monitoring: { visible: true } });
    }
    if (url === '/api/settings' && (!init?.method || init.method === 'GET')) {
      return json(200, settings);
    }
    if (url === '/api/kb/coverage') return json(200, { total: 0, recognised: 0, unrecognised: [] });
    if (init?.method && init.method !== 'GET') {
      if (!tokenOk) return json(401, { error: 'authentication required' });
      if (url === '/api/settings') {
        settings = { ...settings, ...JSON.parse(String(init.body)) };
        return json(200, settings);
      }
      return json(200, { ok: true });
    }
    return json(404, { error: 'not found' });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderApp({ unlocked = false } = {}) {
  if (unlocked) sessionStorage.setItem('homegantry.adminToken', TOKEN);
  render(<App />);
  await waitFor(() => expect(document.querySelector('[data-card]')).not.toBeNull());
  if (unlocked) await screen.findByText('+ Add Service');
  await act(async () => {});
}

const searchBox = () => screen.getByRole('searchbox', { name: 'Search services' });
const card = (name: string) => screen.getByRole('link', { name: new RegExp(`^${name}`) });
const press = (key: string, target: Element = document.body, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(target, { key, ...init });
const cardNames = () =>
  [...document.querySelectorAll('[data-card]')].map((el) => el.getAttribute('data-name'));

describe('search', () => {
  it('"/" focuses the search box from anywhere', async () => {
    await renderApp();
    press('/');
    expect(document.activeElement).toBe(searchBox());
  });

  it('shortcuts do not fire while typing in an input', async () => {
    await renderApp();
    const box = searchBox();
    box.focus();
    for (const key of ['?', 'e', '/']) press(key, box);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(box);

    // In another field (the unlock dialog's token input) "/" stays there too.
    fireEvent.click(screen.getByText('Unlock editing'));
    const token = screen.getByLabelText('Admin token');
    token.focus();
    press('/', token);
    press('?', token);
    expect(document.activeElement).toBe(token);
    expect(screen.queryByText('Keyboard shortcuts', { selector: 'h2' })).toBeNull();
  });

  it('"Esc" clears the query and leaves the box', async () => {
    await renderApp();
    const box = searchBox();
    box.focus();
    fireEvent.change(box, { target: { value: 'plex' } });
    expect(cardNames()).toEqual(['Plex']);
    press('Escape', box);
    expect((box as HTMLInputElement).value).toBe('');
    expect(document.activeElement).not.toBe(box);
    expect(cardNames()).toHaveLength(4);
  });

  it('"Enter" opens the first result in a new tab', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    await renderApp();
    fireEvent.change(searchBox(), { target: { value: 'media' } });
    press('Enter', searchBox());
    expect(open).toHaveBeenCalledWith(
      'https://jellyfin.example.com',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it.each([
    ['name', 'graf', ['Grafana']],
    ['description', 'metrics', ['Grafana']],
    ['category', 'network', ['Router']],
    ['stack', 'monitoring', ['Grafana']],
    // Neither is a name match: sort order, then name.
    ['URL host', '192.168.1.1', ['Grafana', 'Router']],
  ])('matches on %s', async (_field, query, expected) => {
    await renderApp();
    fireEvent.change(searchBox(), { target: { value: query } });
    expect(cardNames()).toEqual(expected);
  });

  it('ranks name matches first and shows one flat result list', async () => {
    FakeEventSource.initial = [
      ...SERVICES,
      { ...SERVICES[3]!, id: 'm-mediathek', name: 'Médiathèque', category: 'Library' },
    ];
    await renderApp();
    fireEvent.change(searchBox(), { target: { value: 'media' } });
    // Name match (accent-insensitive) first, then category and description matches.
    expect(cardNames()).toEqual(['Médiathèque', 'Jellyfin', 'Plex']);
    expect(screen.getByRole('heading', { name: 'Results for “media” 3' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('3 results');
    expect(screen.queryByRole('heading', { name: /^Media/ })).toBeNull();
  });

  it('keeps the query in the URL (?q=) and reads it on load', async () => {
    window.history.replaceState(null, '', '/?q=grafana');
    await renderApp();
    expect((searchBox() as HTMLInputElement).value).toBe('grafana');
    expect(cardNames()).toEqual(['Grafana']);

    fireEvent.change(searchBox(), { target: { value: 'plex tv' } });
    expect(new URLSearchParams(window.location.search).get('q')).toBe('plex tv');
    fireEvent.change(searchBox(), { target: { value: '' } });
    expect(window.location.search).toBe('');
  });

  it('explains an empty result: hidden services are not searched, stopped ones only when shown', async () => {
    await renderApp();
    fireEvent.change(searchBox(), { target: { value: 'sonarr' } });
    const status = screen.getByRole('status');
    expect(status.textContent).toMatch(/No services match/);
    expect(status.textContent).toMatch(/Hidden services are not searched/);
    expect(status.textContent).toMatch(/1 stopped container matches/);
  });
});

describe('keyboard navigation', () => {
  it('arrow keys move between cards in reading order, across groups', async () => {
    await renderApp();
    expect(cardNames()).toEqual(['Jellyfin', 'Plex', 'Grafana', 'Router']);
    card('Jellyfin').focus();
    press('ArrowRight', document.activeElement!);
    expect(document.activeElement).toBe(card('Plex'));
    press('ArrowDown', document.activeElement!); // no layout in jsdom: next in reading order
    expect(document.activeElement).toBe(card('Grafana'));
    press('ArrowRight', document.activeElement!);
    expect(document.activeElement).toBe(card('Router'));
    press('ArrowRight', document.activeElement!); // stays on the last card
    expect(document.activeElement).toBe(card('Router'));
    press('ArrowLeft', document.activeElement!);
    press('ArrowUp', document.activeElement!);
    expect(document.activeElement).toBe(card('Plex'));
    press('End', document.activeElement!);
    expect(document.activeElement).toBe(card('Router'));
    press('Home', document.activeElement!);
    expect(document.activeElement).toBe(card('Jellyfin'));
  });

  it('ArrowDown/ArrowUp use the grid layout when there is one', async () => {
    await renderApp();
    // Two columns: Jellyfin | Plex / Grafana | Router.
    const pos: Record<string, [number, number]> = {
      Jellyfin: [0, 0],
      Plex: [200, 0],
      Grafana: [0, 100],
      Router: [200, 100],
    };
    for (const el of document.querySelectorAll<HTMLElement>('[data-card]')) {
      const [left, top] = pos[el.getAttribute('data-name')!]!;
      el.getBoundingClientRect = () =>
        ({ left, top, right: left + 180, bottom: top + 80, width: 180, height: 80 }) as DOMRect;
    }
    card('Plex').focus();
    press('ArrowDown', document.activeElement!);
    expect(document.activeElement).toBe(card('Router'));
    press('ArrowUp', document.activeElement!);
    expect(document.activeElement).toBe(card('Plex'));
  });

  it('ArrowDown in the search box moves to the first result', async () => {
    await renderApp();
    fireEvent.change(searchBox(), { target: { value: 'grafana' } });
    press('ArrowDown', searchBox());
    expect(document.activeElement).toBe(card('Grafana'));
  });

  it('"Enter" opens the focused service', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    await renderApp();
    card('Grafana').focus();
    press('Enter', document.activeElement!);
    expect(open).toHaveBeenCalledWith('http://192.168.1.100:3000', '_blank', 'noopener,noreferrer');
  });

  it('"e" opens the edit dialog for the focused card when editing is unlocked', async () => {
    await renderApp({ unlocked: true });
    card('Plex').focus();
    press('e', document.activeElement!);
    const dialog = screen.getByRole('dialog', { name: 'Edit Docker Service' });
    expect(within(dialog).getByLabelText('Name')).toHaveProperty('value', 'Plex');
    // Esc closes it and focus goes back to the card.
    press('Escape', document.activeElement!);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(card('Plex'));
  });

  it('"e" does nothing while the dashboard is locked', async () => {
    await renderApp();
    card('Plex').focus();
    press('e', document.activeElement!);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByLabelText('Edit service')).toBeNull();
  });

  it('"?" shows the shortcut overview, which closes with Esc', async () => {
    await renderApp();
    card('Plex').focus();
    press('?', document.activeElement!);
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    for (const text of ['/', 'Esc', 'Enter', '?', 'e']) {
      expect(within(dialog).getAllByText(text, { selector: 'kbd' }).length).toBeGreaterThan(0);
    }
    expect(dialog.textContent).toMatch(/editing is unlocked/);
    press('Escape', document.activeElement!);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(card('Plex'));
  });

  it('the footer opens the shortcut overview for mouse and touch users', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /Keyboard shortcuts/ }));
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeTruthy();
  });

  it('modals trap focus: Tab from the last control wraps to the first', async () => {
    await renderApp({ unlocked: true });
    card('Plex').focus();
    press('e', document.activeElement!);
    const dialog = screen.getByRole('dialog');
    const focusable = dialog.querySelectorAll<HTMLElement>('input, button');
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    expect(dialog.contains(document.activeElement)).toBe(true);
    last.focus();
    press('Tab', last);
    expect(document.activeElement).toBe(first);
    press('Tab', first, { shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('the settings drawer traps focus, closes with Esc and is unreachable while closed', async () => {
    await renderApp({ unlocked: true });
    const settingsButton = screen.getByRole('button', { name: 'Settings' });
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();
    settingsButton.focus();
    fireEvent.click(settingsButton);
    const drawer = screen.getByRole('dialog', { name: 'Settings' });
    expect(drawer.contains(document.activeElement)).toBe(true);
    press('Escape', document.activeElement!);
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();
    expect(document.activeElement).toBe(settingsButton);
  });

  it('skips cards in collapsed groups', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /Monitoring/ }));
    card('Plex').focus();
    press('ArrowRight', document.activeElement!);
    expect(document.activeElement).toBe(card('Router'));
  });
});

describe('grouping', () => {
  /** Heading text as read out: without decorative (aria-hidden) icons. */
  const groupHeadings = () =>
    screen.getAllByRole('heading', { level: 2 }).map((h) => {
      const copy = h.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('[aria-hidden="true"]').forEach((el) => el.remove());
      return copy.textContent?.replace(/\s+/g, ' ').trim();
    });

  it('groups by category by default, with counts', async () => {
    await renderApp();
    expect(groupHeadings()).toEqual(['Media 2', 'Monitoring 1', 'Network 1']);
    const media = screen.getByRole('region', { name: /Media/ });
    expect(within(media).getAllByRole('listitem')).toHaveLength(2);
  });

  it('uses the stored grouping on load (stack, "Other" last)', async () => {
    settings.groupBy = 'stack';
    await renderApp();
    await waitFor(() => expect(groupHeadings()).toEqual(['media 2', 'monitoring 1', 'Other 1']));
  });

  it('can group by URL host', async () => {
    settings.groupBy = 'host';
    await renderApp();
    await waitFor(() =>
      expect(groupHeadings()).toEqual([
        '192.168.1.1 1',
        '192.168.1.100 1',
        'jellyfin.example.com 1',
        'plex.example.com 1',
      ]),
    );
  });

  it('is chosen in the settings drawer and stored with the other settings', async () => {
    await renderApp({ unlocked: true });
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const drawer = screen.getByRole('dialog', { name: 'Settings' });
    const group = within(drawer).getByRole('group', { name: 'Group by' });
    for (const name of ['Category', 'Stack', 'Host']) {
      expect(within(group).getByRole('button', { name })).toBeTruthy();
    }
    expect(
      within(group).getByRole('button', { name: 'Category' }).getAttribute('aria-pressed'),
    ).toBe('true');
    await act(async () => {
      fireEvent.click(within(group).getByRole('button', { name: 'Host' }));
    });
    expect(writes()).toContainEqual({
      url: '/api/settings',
      method: 'PATCH',
      body: { groupBy: 'host' },
    });
    await waitFor(() => expect(groupHeadings()[0]).toBe('192.168.1.1 1'));
  });

  it('collapses a group, remembers it in the browser and restores it', async () => {
    await renderApp();
    const toggle = screen.getByRole('button', { name: /Media/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(cardNames()).toEqual(['Grafana', 'Router']);
    expect(JSON.parse(window.localStorage.getItem('homegantry.collapsedGroups')!)).toEqual([
      'category:Media',
    ]);

    cleanup();
    await renderApp();
    expect(cardNames()).toEqual(['Grafana', 'Router']);
    expect(groupHeadings()).toContain('Media 2');
    // Nothing about collapsing reaches the server.
    expect(writes()).toEqual([]);
  });

  it('still works when browser storage is unavailable', async () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    render(<App />);
    await screen.findByText('Jellyfin');
    fireEvent.click(screen.getByRole('button', { name: /Media/ }));
    expect(cardNames()).toEqual(['Grafana', 'Router']);
  });
});

describe('edit dialog', () => {
  async function openEdit(name: string) {
    card(name).focus();
    press('e', document.activeElement!);
    return screen.getByRole('dialog');
  }

  it('#31 clearing the URL sends an explicit reset (null)', async () => {
    await renderApp({ unlocked: true });
    const dialog = await openEdit('Plex');
    const url = within(dialog).getByLabelText('URL');
    expect(within(dialog).getByText(/auto-detected URL/)).toBeTruthy();
    fireEvent.change(url, { target: { value: '' } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    });
    const put = writes().find((w) => w.method === 'PUT')!;
    expect(put.url).toBe('/api/services/id-plex/override');
    expect(put.body).toHaveProperty('url', null);
  });

  it('#31 an unchanged URL is not stored as an override', async () => {
    await renderApp({ unlocked: true });
    const dialog = await openEdit('Plex');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Plex Server' } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    });
    const put = writes().find((w) => w.method === 'PUT')!;
    expect(put.body.displayName).toBe('Plex Server');
    expect(put.body).not.toHaveProperty('url');
  });

  it('#32 turns the health check off for a discovered service', async () => {
    await renderApp({ unlocked: true });
    const dialog = await openEdit('Jellyfin');
    const check = within(dialog).getByRole('checkbox', { name: /Health check/ });
    expect((check as HTMLInputElement).checked).toBe(true);
    fireEvent.click(check);
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    });
    const put = writes().find((w) => w.method === 'PUT')!;
    expect(put.url).toBe('/api/services/id-jellyfin/override');
    expect(put.body.healthcheck).toBe(false);
  });

  it('#32 shows the opt-out as off and can turn it back on', async () => {
    FakeEventSource.initial = SERVICES.map((s) =>
      s.id === 'id-plex' ? { ...s, healthcheckDisabled: true } : s,
    );
    await renderApp({ unlocked: true });
    const dialog = await openEdit('Plex');
    const check = within(dialog).getByRole('checkbox', { name: /Health check/ });
    expect((check as HTMLInputElement).checked).toBe(false);
    fireEvent.click(check);
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    });
    expect(writes().find((w) => w.method === 'PUT')!.body.healthcheck).toBe(true);
  });

  it('#32 works for manual services too', async () => {
    await renderApp({ unlocked: true });
    const dialog = await openEdit('Router');
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Health check/ }));
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    });
    const put = writes().find((w) => w.method === 'PUT')!;
    expect(put.url).toBe('/api/services/manual/m-router');
    expect(put.body.healthcheck).toBe(false);
  });
});

describe('card status', () => {
  it('#33 shows one status, no container dot next to a health badge', async () => {
    await renderApp();
    const grafana = card('Grafana');
    expect(grafana.querySelector('.status-dot')).toBeNull();
    const status = within(grafana).getByText('Down');
    expect(status.getAttribute('title')).toMatch(/container is running, but the health check/);
    expect(within(grafana).queryByText('Running')).toBeNull();
    expect(within(card('Plex')).getByText('Running')).toBeTruthy();
    expect(within(card('Jellyfin')).getByText('Up')).toBeTruthy();
  });

  it('#30 shows the new "last checked" time when the server pushes it', async () => {
    await renderApp();
    const before = within(card('Jellyfin')).getByText('Up').getAttribute('title');
    const later = '2026-01-01T12:05:00.000Z';
    FakeEventSource.push({
      type: 'service_updated',
      data: { ...SERVICES[0]!, health: { status: 'up', checkedAt: later, httpStatus: 200 } },
    });
    const after = within(card('Jellyfin')).getByText('Up').getAttribute('title');
    expect(after).not.toBe(before);
    expect(after).toContain(new Date(later).toLocaleString());
  });
});

describe('layout and accessibility', () => {
  async function expectNoAxeViolations() {
    const result = await axe.run(document.body, {
      // jsdom has no layout or colours.
      rules: { 'color-contrast': { enabled: false } },
    });
    const summary = result.violations.map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
    );
    expect(summary).toEqual([]);
  }

  it('has landmarks, labelled groups and lists', async () => {
    await renderApp();
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.getByRole('contentinfo')).toBeTruthy();
    expect(screen.getAllByRole('region')).toHaveLength(3);
    expect(screen.getAllByRole('list')).toHaveLength(3);
  });

  it('passes axe: read-only dashboard', async () => {
    await renderApp();
    await expectNoAxeViolations();
  });

  it('passes axe: unlocked dashboard with the settings drawer open', async () => {
    await renderApp({ unlocked: true });
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await act(async () => {});
    await expectNoAxeViolations();
  });

  it('passes axe: edit dialog, shortcut overview and search results', async () => {
    await renderApp({ unlocked: true });
    card('Plex').focus();
    press('e', document.activeElement!);
    await expectNoAxeViolations();
    press('Escape', document.activeElement!);
    press('?', document.activeElement!);
    await expectNoAxeViolations();
    press('Escape', document.activeElement!);
    fireEvent.change(searchBox(), { target: { value: 'zzz' } });
    await expectNoAxeViolations();
  });

  it('dialogs and the drawer go full-screen on small screens', async () => {
    await renderApp({ unlocked: true });
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const drawer = screen.getByRole('dialog', { name: 'Settings' });
    expect(drawer.className).toMatch(/(^|\s)w-full(\s|$)/);
    expect(drawer.className).toMatch(/sm:w-80/);
    press('Escape', document.activeElement!);
    press('?');
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(dialog.className).toMatch(/(^|\s)h-full(\s|$)/);
    expect(dialog.className).toMatch(/sm:h-auto/);
  });
});
