// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import KbCoverageSection from '../../src/components/KbCoverageSection';
import ServiceIcon from '../../src/components/ServiceIcon';
import { IconSourceProvider } from '../../src/context/IconSourceContext';
import { iconCandidates } from '../../src/lib/icons';
import type { IconSource, KbCoverage } from '../../src/types';

const CDN = 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons';
const cdn: IconSource = { mode: 'cdn', baseUrl: CDN };
const custom: IconSource = { mode: 'custom', baseUrl: 'https://icons.example.com/set' };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function backend(icons: IconSource | null, coverage?: KbCoverage) {
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/ui-config') return icons ? json({ icons }) : json({ error: 'nope' }, 500);
    if (url === '/api/kb/coverage' && coverage) return json(coverage);
    return json({ error: 'not found' }, 404);
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('iconCandidates', () => {
  it('prefers SVG with a PNG fallback from the CDN', () => {
    expect(iconCandidates('jellyfin', cdn)).toEqual([
      `${CDN}/svg/jellyfin.svg`,
      `${CDN}/png/jellyfin.png`,
    ]);
  });

  it('uses a custom base URL', () => {
    expect(iconCandidates('jellyfin', custom)).toEqual([
      'https://icons.example.com/set/svg/jellyfin.svg',
      'https://icons.example.com/set/png/jellyfin.png',
    ]);
  });

  it('honours an explicit file format from a label', () => {
    expect(iconCandidates('jellyfin.png', cdn)).toEqual([`${CDN}/png/jellyfin.png`]);
  });

  it('uses a full URL as it is', () => {
    const url = 'https://images.example.com/a.png';
    expect(iconCandidates(url, cdn)).toEqual([url]);
  });

  it.each(['jellyfin', 'jellyfin.png', 'https://images.example.com/a.png'])(
    'requests nothing for %s when off',
    (icon) => {
      expect(iconCandidates(icon, { mode: 'off' })).toEqual([]);
    },
  );

  it('requests nothing without an icon', () => {
    expect(iconCandidates('', cdn)).toEqual([]);
  });
});

describe('ServiceIcon', () => {
  const renderIcon = (slug = 'jellyfin') =>
    render(
      <IconSourceProvider>
        <ServiceIcon slug={slug} name="Jellyfin" />
      </IconSourceProvider>,
    );

  it('shows the SVG once the source is known', async () => {
    backend(cdn);
    renderIcon();
    const img = await screen.findByRole('img', { name: 'Jellyfin' });
    expect(img.getAttribute('src')).toBe(`${CDN}/svg/jellyfin.svg`);
  });

  it('falls back from SVG to PNG to the letter avatar', async () => {
    backend(cdn);
    const { container } = renderIcon();
    const svg = await screen.findByRole('img');
    fireEvent.error(svg);
    const png = screen.getByRole('img');
    expect(png.getAttribute('src')).toBe(`${CDN}/png/jellyfin.png`);
    fireEvent.error(png);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('J')).toBeTruthy();
  });

  it('shows the letter avatar without a slug', async () => {
    backend(cdn);
    const { container } = renderIcon('');
    await waitFor(() => expect(screen.getByText('J')).toBeTruthy());
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders no image and no URL when the source is off', async () => {
    const mock = backend({ mode: 'off' });
    const { container } = renderIcon();
    await waitFor(() => expect(mock).toHaveBeenCalled());
    await Promise.resolve();
    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML).not.toMatch(/https?:/);
  });

  it('requests no image before the server has answered', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    const { container } = renderIcon();
    expect(container.querySelector('img')).toBeNull();
  });

  it('stays on letter avatars when the configuration cannot be loaded', async () => {
    const mock = backend(null);
    const { container } = renderIcon();
    await waitFor(() => expect(mock).toHaveBeenCalled());
    await Promise.resolve();
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('KbCoverageSection', () => {
  const coverage: KbCoverage = {
    total: 5,
    recognised: 3,
    unrecognised: ['example/custom-one', 'example/custom-two'],
  };
  const renderSection = (open = true) =>
    render(
      <IconSourceProvider>
        <KbCoverageSection open={open} />
      </IconSourceProvider>,
    );

  it('shows the counts and the unrecognised images', async () => {
    backend(cdn, coverage);
    renderSection();
    expect(await screen.findByText('3 of 5 containers recognised')).toBeTruthy();
    const list = screen.getByRole('list', { name: 'Unrecognised images' });
    expect(list.textContent).toContain('example/custom-one');
    expect(list.textContent).toContain('example/custom-two');
  });

  it('links to the Missing service issue template without sending image names', async () => {
    backend(cdn, coverage);
    renderSection();
    const link = await screen.findByRole('link', { name: 'Report a missing service' });
    const href = link.getAttribute('href')!;
    expect(href).toContain('template=missing_service.yml');
    expect(href).not.toContain('custom');
  });

  it('carries no external link when icons are off', async () => {
    backend({ mode: 'off' }, coverage);
    const { container } = renderSection();
    await screen.findByText('3 of 5 containers recognised');
    expect(container.querySelector('a')).toBeNull();
    expect(container.innerHTML).not.toMatch(/https?:/);
  });

  it('does not load while the drawer is closed', async () => {
    const mock = backend(cdn, coverage);
    renderSection(false);
    await waitFor(() => expect(mock).toHaveBeenCalled());
    expect(mock.mock.calls.map(([url]) => String(url))).not.toContain('/api/kb/coverage');
  });

  it('says so when the report cannot be loaded', async () => {
    backend(cdn);
    renderSection();
    expect(await screen.findByText('Could not load the coverage report.')).toBeTruthy();
  });
});
