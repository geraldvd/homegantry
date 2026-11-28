import type { DashboardSettings, Service, StackConfig } from '../types';
import { byOrderThenName, urlHost } from './search';

export type GroupBy = DashboardSettings['groupBy'];

/**
 * Key of the catch-all group, per grouping (so collapsing it in one grouping does not collapse it
 * in another); cannot collide with a real `category:`, `stack:` or `host:` key.
 */
export function otherGroupKey(groupBy: GroupBy): string {
  return `other:${groupBy}`;
}
export const OTHER_LABEL = 'Other';

export interface ServiceGroup {
  key: string;
  label: string;
  services: Service[];
}

/** Category values that mean "no category" and land in the Other group. */
const NO_CATEGORY = new Set(['', 'other', 'uncategorized']);

function groupOf(
  s: Service,
  groupBy: GroupBy,
  stacks: Record<string, StackConfig>,
): { key: string; label: string } | undefined {
  if (groupBy === 'stack') {
    if (!s.stack) return undefined;
    return { key: `stack:${s.stack}`, label: stacks[s.stack]?.displayName || s.stack };
  }
  if (groupBy === 'host') {
    const host = urlHost(s.url);
    return host ? { key: `host:${host}`, label: host } : undefined;
  }
  const category = s.category.trim();
  if (NO_CATEGORY.has(category.toLowerCase())) return undefined;
  return { key: `category:${category}`, label: category };
}

/**
 * Services grouped by category, stack or URL host. Groups are sorted by name (numbers in order,
 * so 192.168.1.20 comes before 192.168.1.100), the Other group is always last, and a group
 * keeps the sort order, then name.
 */
export function groupServices(
  services: readonly Service[],
  groupBy: GroupBy,
  stacks: Record<string, StackConfig>,
): ServiceGroup[] {
  const other = otherGroupKey(groupBy);
  const map = new Map<string, ServiceGroup>();
  for (const s of services) {
    const g = groupOf(s, groupBy, stacks) ?? { key: other, label: OTHER_LABEL };
    const group = map.get(g.key);
    if (group) group.services.push(s);
    else map.set(g.key, { ...g, services: [s] });
  }
  const groups = [...map.values()];
  for (const g of groups) g.services.sort(byOrderThenName);
  return groups.sort((a, b) => {
    if (a.key === other) return 1;
    if (b.key === other) return -1;
    return a.label.localeCompare(b.label, undefined, { sensitivity: 'base', numeric: true });
  });
}
