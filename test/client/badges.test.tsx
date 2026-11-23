// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EditServiceModal from '../../src/components/EditServiceModal';
import ServiceCard from '../../src/components/ServiceCard';
import ServiceListItem from '../../src/components/ServiceListItem';
import { AuthProvider } from '../../src/context/AuthContext';
import { ServiceProvider } from '../../src/context/ServiceContext';
import type { Service } from '../../src/types';

const base: Service = {
  id: 'id-app',
  source: 'docker',
  name: 'App',
  description: '',
  url: 'https://app.example.com',
  icon: '',
  category: 'Other',
  status: 'running',
  hidden: false,
  sortOrder: 0,
};

class FakeEventSource {
  onopen = null;
  onerror = null;
  onmessage = null;
  close() {}
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubGlobal('EventSource', FakeEventSource);
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const body =
      String(input) === '/api/auth'
        ? {
            canEdit: false,
            method: null,
            readonly: false,
            methods: { token: false, header: false },
          }
        : {};
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderCard(service: Service, showStatus = true) {
  render(
    <AuthProvider>
      <ServiceProvider>
        <ServiceCard service={service} showStatus={showStatus} onEdit={() => {}} />
      </ServiceProvider>
    </AuthProvider>,
  );
  await act(async () => {});
}

describe('exposure badge', () => {
  it.each([
    ['public', 'Public'],
    ['sso', 'SSO'],
    ['private', 'Private'],
    ['unknown', 'Unknown'],
  ] as const)('shows %s as "%s" with its source in the tooltip', async (exposure, label) => {
    await renderCard({ ...base, exposure, exposureSource: 'Middleware: login (forwardauth)' });
    const badge = screen.getByText(label);
    expect(badge.getAttribute('title')).toContain('Middleware: login (forwardauth)');
  });

  it('is absent without Traefik data', async () => {
    await renderCard(base);
    for (const label of ['Public', 'SSO', 'Private']) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });
});

describe('health badge', () => {
  const checkedAt = '2026-01-01T12:00:00.000Z';

  it.each([
    [{ status: 'up', checkedAt, httpStatus: 200 }, 'Up', /HTTP 200/],
    [{ status: 'down', checkedAt, reason: 'timeout' }, 'Down', /timed out/],
    [{ status: 'down', checkedAt, reason: 'unreachable' }, 'Down', /not reachable/],
    [{ status: 'down', checkedAt, reason: 'http', httpStatus: 503 }, 'Down', /HTTP 503/],
    [{ status: 'unknown', checkedAt, reason: 'tls' }, 'TLS error', /certificate/],
    [{ status: 'unknown', checkedAt }, 'Not checked', /Health check/],
  ] as const)('renders %j', async (health, label, tooltip) => {
    await renderCard({ ...base, health });
    const badge = screen.getByText(label);
    expect(badge.getAttribute('title')).toMatch(tooltip);
    expect(badge.getAttribute('title')).toMatch(/Last checked/);
  });

  it('is hidden when "Show Status" is off', async () => {
    await renderCard({ ...base, health: { status: 'up', checkedAt } }, false);
    expect(screen.queryByText('Up')).toBeNull();
  });

  it('survives an invalid timestamp', async () => {
    await renderCard({ ...base, health: { status: 'up', checkedAt: 'nope' } });
    expect(screen.getByText('Up').getAttribute('title')).not.toMatch(/Invalid/);
  });
});

describe('Traefik services in the UI', () => {
  const traefik: Service = { ...base, source: 'traefik', status: 'unknown' };

  it('has no container status dot, the health badge says it instead', async () => {
    await renderCard(traefik);
    expect(document.querySelector('.status-dot')).toBeNull();
  });

  it('shows badges in the list layout too', async () => {
    render(
      <AuthProvider>
        <ServiceProvider>
          <ServiceListItem
            service={{
              ...traefik,
              exposure: 'sso',
              health: { status: 'up', checkedAt: '2026-01-01T12:00:00.000Z' },
            }}
            showStatus
            onEdit={() => {}}
          />
        </ServiceProvider>
      </AuthProvider>,
    );
    await act(async () => {});
    expect(screen.getByText('SSO')).toBeTruthy();
    expect(screen.getByText('Up')).toBeTruthy();
    expect(document.querySelector('.status-dot')).toBeNull();
  });

  it('edits a Traefik service through an override, like a container', async () => {
    render(
      <AuthProvider>
        <ServiceProvider>
          <EditServiceModal service={traefik} onClose={() => {}} />
        </ServiceProvider>
      </AuthProvider>,
    );
    await act(async () => {});
    expect(screen.getByText('Edit Traefik Service')).toBeTruthy();
    expect(screen.getByText('Revert to auto-detected')).toBeTruthy();
    expect(screen.queryByText('Delete')).toBeNull();
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!);
    });
    const write = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(write?.[0]).toBe('/api/services/id-app/override');
  });
});
