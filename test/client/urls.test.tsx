// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getServices, updateSettings } from '../../src/api/client';
import { request } from '../../src/api/client';
import AddServiceModal from '../../src/components/AddServiceModal';
import EditServiceModal from '../../src/components/EditServiceModal';
import ServiceCard from '../../src/components/ServiceCard';
import ServiceListItem from '../../src/components/ServiceListItem';
import { AuthProvider } from '../../src/context/AuthContext';
import { ServiceProvider } from '../../src/context/ServiceContext';
import { normaliseUrlInput, safeHref } from '../../src/lib/url';
import type { Service } from '../../src/types';

const service: Service = {
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal('EventSource', FakeEventSource);
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) === '/api/auth') {
      return json({
        canEdit: false,
        method: null,
        readonly: false,
        methods: { token: false, header: false },
      });
    }
    if (String(input) === '/api/stacks') return json({});
    return json({ ok: true });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function writes() {
  return fetchMock.mock.calls.filter(([, init]) => init?.method && init.method !== 'GET');
}

function wrap(ui: React.ReactNode) {
  return render(
    <AuthProvider>
      <ServiceProvider>{ui}</ServiceProvider>
    </AuthProvider>,
  );
}

describe('safeHref', () => {
  it.each(['https://app.example.com', 'http://192.168.1.100:8096/x'])('allows %s', (url) => {
    expect(safeHref(url)).toBe(url);
  });

  it.each([
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    ' javascript:alert(1)',
    'java\nscript:alert(1)',
    'data:text/html,x',
    '#',
    '',
    '/relative',
  ])('refuses %j', (url) => {
    expect(safeHref(url)).toBeUndefined();
  });
});

describe('normaliseUrlInput (#18)', () => {
  it.each([
    ['https://app.example.com', 'https://app.example.com'],
    ['  http://192.168.1.100:8096 ', 'http://192.168.1.100:8096'],
    ['app.example.com', 'http://app.example.com'],
    ['192.168.1.100:8096', 'http://192.168.1.100:8096'],
    ['localhost:8080/admin', 'http://localhost:8080/admin'],
  ])('accepts %j', (input, url) => {
    expect(normaliseUrlInput(input)).toEqual({ url });
  });

  it.each(['javascript:alert(1)', 'data:text/html,x', 'ftp://files.example.com', 'not a url', ''])(
    'explains why %j is refused',
    (input) => {
      expect(normaliseUrlInput(input).error).toMatch(/http:\/\/ or https:\/\//);
    },
  );

  it('accepts "#" only when asked to', () => {
    expect(normaliseUrlInput('#', { allowNone: true })).toEqual({ url: '#' });
    expect(normaliseUrlInput('#').error).toBeTruthy();
  });
});

describe('service links (#16)', () => {
  it.each(['javascript:alert(1)', 'data:text/html,x', '#'])(
    'does not render %s as a link',
    async (url) => {
      wrap(
        <>
          <ServiceCard service={{ ...service, url }} showStatus onEdit={() => {}} />
          <ServiceListItem service={{ ...service, id: 'id-2', url }} showStatus onEdit={() => {}} />
        </>,
      );
      await act(async () => {});
      expect(screen.getAllByText('App')).toHaveLength(2);
      expect(document.querySelector('a')).toBeNull();
    },
  );

  it('renders http(s) URLs as links that open safely', async () => {
    wrap(<ServiceCard service={service} showStatus onEdit={() => {}} />);
    await act(async () => {});
    const link = screen.getByText('App').closest('a')!;
    expect(link.getAttribute('href')).toBe('https://app.example.com');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });
});

describe('Add service modal (#18)', () => {
  async function submit(url: string) {
    wrap(<AddServiceModal open onClose={() => {}} />);
    await act(async () => {});
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Router' } });
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: url } });
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: 'Add Service' }).closest('form')!);
    });
  }

  it('shows a clear message and sends nothing for an invalid URL', async () => {
    await submit('javascript:alert(1)');
    expect(screen.getByText(/must start with http:\/\/ or https:\/\//)).toBeTruthy();
    expect(writes()).toHaveLength(0);
  });

  it('adds http:// to a bare host', async () => {
    await submit('192.168.1.100:8096');
    expect(writes()).toHaveLength(1);
    expect(JSON.parse(writes()[0]![1].body).url).toBe('http://192.168.1.100:8096');
  });
});

describe('Edit service modal (#18)', () => {
  async function submit(svc: Service, url: string) {
    wrap(<EditServiceModal service={svc} onClose={() => {}} />);
    await act(async () => {});
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: url } });
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!);
    });
  }

  it('shows a clear message and sends nothing for an invalid URL', async () => {
    await submit(service, 'ftp://files.example.com');
    expect(screen.getByText(/must start with http:\/\/ or https:\/\//)).toBeTruthy();
    expect(writes()).toHaveLength(0);
  });

  it('keeps "#" (no link) for discovered services', async () => {
    await submit(service, '#');
    expect(JSON.parse(writes()[0]![1].body).url).toBe('#');
  });

  it('refuses "#" for manual services, which need a URL', async () => {
    await submit({ ...service, source: 'manual' }, '#');
    expect(writes()).toHaveLength(0);
  });
});

describe('request() headers (#20)', () => {
  const headersOf = (call = 0) => new Headers(fetchMock.mock.calls[call]![1].headers);

  it('merges caller headers with the defaults', async () => {
    sessionStorage.setItem('homegantry.adminToken', 'change-me-0123456789abcdefghij');
    await request('/settings', { headers: { 'X-Example': 'yes' } });
    const headers = headersOf();
    expect(headers.get('X-Example')).toBe('yes');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('Authorization')).toBe('Bearer change-me-0123456789abcdefghij');
  });

  it('accepts a Headers instance and lets the caller replace the content type', async () => {
    await request('/settings', { headers: new Headers({ 'content-type': 'text/plain' }) });
    expect(headersOf().get('Content-Type')).toBe('text/plain');
  });

  it('never lets a caller replace the stored token', async () => {
    sessionStorage.setItem('homegantry.adminToken', 'change-me-0123456789abcdefghij');
    await request('/settings', { headers: { Authorization: 'Bearer change-me-other' } });
    expect(headersOf().get('Authorization')).toBe('Bearer change-me-0123456789abcdefghij');
  });

  it('still sends the defaults from the normal helpers', async () => {
    await getServices();
    await updateSettings({ columns: 3 });
    expect(headersOf(1).get('Content-Type')).toBe('application/json');
  });
});
