import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_EXPOSURE_RULES,
  parseExposureMap,
  resolveExposure,
  type MiddlewareInfo,
} from '../../server/exposure.js';

const mw = (name: string, type: string, chain?: string[]): MiddlewareInfo => ({
  name,
  type,
  ...(chain ? { chain } : {}),
});

function index(...items: MiddlewareInfo[]) {
  return new Map(items.map((m) => [m.name, m]));
}

const noRules = parseExposureMap('');

describe('parseExposureMap', () => {
  it('parses pattern=level pairs', () => {
    expect(parseExposureMap('authentik=sso, office-*=vpn-only,open=public')).toEqual([
      { pattern: 'authentik', level: 'sso' },
      { pattern: 'office-*', level: 'vpn-only' },
      { pattern: 'open', level: 'public' },
    ]);
  });

  it('skips invalid entries with a warning that does not crash', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseExposureMap('good=sso,broken,bad=level,=sso')).toEqual([
      { pattern: 'good', level: 'sso' },
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('resolveExposure: defaults', () => {
  it('a router without middlewares is public', () => {
    expect(resolveExposure([], new Map(), noRules).level).toBe('public');
  });

  it.each([
    ['my-forwardauth@file', 'sso'],
    ['authentik@docker', 'sso'],
    ['AUTHELIA@file', 'sso'],
    ['lan-ipallowlist@file', 'vpn-only'],
    ['old-ipwhitelist@docker', 'vpn-only'],
  ])('maps %s to %s by name', (name, level) => {
    expect(resolveExposure([name], index(mw(name, 'plugin')), noRules).level).toBe(level);
  });

  it.each([
    ['login', 'forwardauth', 'sso'],
    ['login', 'basicauth', 'sso'],
    ['login', 'digestauth', 'sso'],
    ['office', 'ipallowlist', 'vpn-only'],
    ['office', 'ipwhitelist', 'vpn-only'],
  ])('falls back to the type of %s (%s)', (name, type, level) => {
    const result = resolveExposure([`${name}@file`], index(mw(`${name}@file`, type)), noRules);
    expect(result.level).toBe(level);
    expect(result.source).toContain(type);
  });

  it('an unrecognised middleware gives unknown', () => {
    const items = index(mw('mystery@file', 'plugin-mystery'));
    expect(resolveExposure(['mystery@file'], items, noRules).level).toBe('unknown');
  });

  it('a middleware Traefik did not report gives unknown', () => {
    expect(resolveExposure(['missing@file'], new Map(), noRules).level).toBe('unknown');
  });

  it('middlewares that do not restrict access keep a router public', () => {
    const items = index(mw('gzip@file', 'compress'), mw('hsts@file', 'headers'));
    expect(resolveExposure(['gzip@file', 'hsts@file'], items, noRules).level).toBe('public');
  });

  it('the strictest middleware wins', () => {
    const items = index(
      mw('gzip@file', 'compress'),
      mw('login@file', 'forwardauth'),
      mw('lan@file', 'ipallowlist'),
      mw('mystery@file', 'plugin-x'),
    );
    const names = ['gzip@file', 'mystery@file', 'login@file', 'lan@file'];
    expect(resolveExposure(names, items, noRules).level).toBe('vpn-only');
    expect(resolveExposure(names.slice(0, 3), items, noRules).level).toBe('sso');
    expect(resolveExposure(names.slice(0, 2), items, noRules).level).toBe('unknown');
  });

  it('contains no lab-specific names', () => {
    expect(DEFAULT_EXPOSURE_RULES.map((r) => r.pattern).sort()).toEqual([
      '*authelia*',
      '*authentik*',
      '*forwardauth*',
      '*ipallowlist*',
      '*ipwhitelist*',
    ]);
  });
});

describe('resolveExposure: custom map', () => {
  it('maps exact names and globs, ignoring case and the provider', () => {
    const rules = parseExposureMap('corp-login=sso,office-*=vpn-only');
    const items = index(mw('Corp-Login@file', 'plugin'), mw('office-gate@docker', 'plugin'));
    expect(resolveExposure(['Corp-Login@file'], items, rules).level).toBe('sso');
    expect(resolveExposure(['office-gate@docker'], items, rules).level).toBe('vpn-only');
  });

  it('supports the ? wildcard and treats regex characters literally', () => {
    const rules = parseExposureMap('gate?=sso,a.b=vpn-only');
    expect(resolveExposure(['gate1@file'], new Map(), rules).level).toBe('sso');
    expect(resolveExposure(['gate12@file'], new Map(), rules).level).toBe('unknown');
    expect(resolveExposure(['axb@file'], new Map(), rules).level).toBe('unknown');
    expect(resolveExposure(['a.b@file'], new Map(), rules).level).toBe('vpn-only');
  });

  it('takes precedence over the defaults and the type', () => {
    const rules = parseExposureMap('authelia=public');
    const items = index(mw('authelia@file', 'forwardauth'));
    expect(resolveExposure(['authelia@file'], items, rules).level).toBe('public');
  });
});

describe('resolveExposure: chains', () => {
  it('follows a chain, resolving members against the chain provider', () => {
    const items = index(
      mw('secured@file', 'chain', ['gzip', 'login']),
      mw('gzip@file', 'compress'),
      mw('login@file', 'forwardauth'),
    );
    const result = resolveExposure(['secured@file'], items, noRules);
    expect(result.level).toBe('sso');
    expect(result.source).toContain('login');
  });

  it('follows nested chains and explicit providers', () => {
    const items = index(
      mw('outer@file', 'chain', ['inner@docker']),
      mw('inner@docker', 'chain', ['lan@file']),
      mw('lan@file', 'ipallowlist'),
    );
    expect(resolveExposure(['outer@file'], items, noRules).level).toBe('vpn-only');
  });

  it('resolves a router middleware without provider against the router provider', () => {
    const items = index(mw('login@docker', 'forwardauth'));
    expect(resolveExposure(['login'], items, noRules, 'docker').level).toBe('sso');
  });

  it('a mapped chain name counts too', () => {
    const rules = parseExposureMap('secured=sso');
    const items = index(mw('secured@file', 'chain', ['gzip']), mw('gzip@file', 'compress'));
    expect(resolveExposure(['secured@file'], items, rules).level).toBe('sso');
  });

  it('survives chain cycles', () => {
    const items = index(mw('a@file', 'chain', ['b']), mw('b@file', 'chain', ['a']));
    expect(resolveExposure(['a@file'], items, noRules).level).toBe('public');
  });

  it('an unknown member of a chain gives unknown', () => {
    const items = index(mw('c@file', 'chain', ['gzip', 'gone']), mw('gzip@file', 'compress'));
    expect(resolveExposure(['c@file'], items, noRules).level).toBe('unknown');
  });
});

describe('source files', () => {
  it('exposure defaults stay generic', () => {
    const source = fs.readFileSync(path.resolve('server/exposure.ts'), 'utf-8');
    expect(source).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
  });
});
