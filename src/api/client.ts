import type { Service, ServiceOverride, ManualService, DashboardSettings, StackConfig } from '../types';

const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export function getServices(includeHidden = false): Promise<Service[]> {
  const qs = includeHidden ? '?includeHidden=true' : '';
  return request<Service[]>(`/services${qs}`);
}

export function updateOverride(id: string, override: ServiceOverride): Promise<Service> {
  return request<Service>(`/services/${encodeURIComponent(id)}/override`, {
    method: 'PUT',
    body: JSON.stringify(override),
  });
}

export function deleteOverride(id: string): Promise<Service> {
  return request<Service>(`/services/${encodeURIComponent(id)}/override`, {
    method: 'DELETE',
  });
}

export function addManualService(
  service: Omit<ManualService, 'id'>,
): Promise<ManualService> {
  return request<ManualService>('/services/manual', {
    method: 'POST',
    body: JSON.stringify(service),
  });
}

export function updateManualService(
  id: string,
  service: Partial<Omit<ManualService, 'id'>>,
): Promise<ManualService> {
  return request<ManualService>(`/services/manual/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(service),
  });
}

export function deleteManualService(id: string): Promise<void> {
  return request<void>(`/services/manual/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function getSettings(): Promise<DashboardSettings> {
  return request<DashboardSettings>('/settings');
}

export function updateSettings(
  settings: Partial<DashboardSettings>,
): Promise<DashboardSettings> {
  return request<DashboardSettings>('/settings', {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });
}

export function getStacks(): Promise<Record<string, StackConfig>> {
  return request<Record<string, StackConfig>>('/stacks');
}

export function updateStack(name: string, config: Partial<StackConfig>): Promise<StackConfig> {
  return request<StackConfig>(`/stacks/${encodeURIComponent(name)}`, {
    method: 'PATCH',
    body: JSON.stringify(config),
  });
}
