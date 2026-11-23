/**
 * Extract a link target from a Traefik router rule.
 *
 * Multi-host rules (#13): the first literal host in the rule wins, for both `Host(`a`, `b`)` and
 * `Host(`a`) || Host(`b`)`. Use `homegantry.url` to pick another one. Negated matchers, wildcards
 * and regex matchers cannot be linked to and are skipped.
 */

export interface ParsedRule {
  host?: string;
  path?: string;
}

const NEGATED_GROUP = /!\s*\((?:[^()]|\([^()]*\))*\)/g;
const MATCHER = /(!\s*)?\b(Host|PathPrefix|Path)\(([^)]*)\)/gi;
const ARGUMENT = /`([^`]*)`|"([^"]*)"/g;
const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;
const LITERAL_PATH = /^\/[A-Za-z0-9._~/-]*$/;

function args(raw: string): string[] {
  return [...raw.matchAll(ARGUMENT)].map((m) => m[1] ?? m[2] ?? '');
}

export function parseRule(rule: string): ParsedRule {
  const positive = rule.replace(NEGATED_GROUP, '');
  let host: string | undefined;
  let path: string | undefined;

  for (const [, negated, matcher, rawArgs] of positive.matchAll(MATCHER)) {
    if (negated) continue;
    const values = args(rawArgs ?? '');
    if (matcher!.toLowerCase() === 'host') {
      host ??= values.find((value) => HOSTNAME.test(value));
    } else {
      path ??= values.find((value) => LITERAL_PATH.test(value) && value !== '/');
    }
  }

  // With "||" a path may belong to another branch than the host.
  return { host, path: host && !rule.includes('||') ? path : undefined };
}
