import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

interface IgnoreRule {
  vulnerability?: string;
  reason?: string;
  package?: { name?: string };
}

const config = parse(fs.readFileSync(path.resolve('.grype.yaml'), 'utf-8')) as {
  ignore?: IgnoreRule[];
};

/** What is wrong with an ignore rule, or `null`. */
function problem(rule: IgnoreRule): string | null {
  if (!/^(CVE-\d{4}-\d+|GHSA-[\w-]+)$/.test(rule.vulnerability ?? '')) {
    return 'names no CVE or GHSA id';
  }
  if ((rule.reason?.trim().length ?? 0) < 20) return 'gives no reason';
  return null;
}

describe('.grype.yaml', () => {
  it('has an ignore list', () => {
    expect(Array.isArray(config.ignore)).toBe(true);
  });

  it('gives every accepted finding an id and a reason', () => {
    const problems = (config.ignore ?? [])
      .map((rule) => [rule.vulnerability, problem(rule)])
      .filter(([, p]) => p !== null);
    expect(problems).toEqual([]);
  });

  it('rejects rules without a reason or id', () => {
    expect(problem({ vulnerability: 'CVE-2026-00000' })).toBe('gives no reason');
    expect(problem({ vulnerability: 'CVE-2026-00000', reason: 'ok' })).toBe('gives no reason');
    expect(problem({ reason: 'A long enough reason for the test.' })).toBe(
      'names no CVE or GHSA id',
    );
    expect(
      problem({
        vulnerability: 'GHSA-abcd-efgh-ijkl',
        reason: 'Only reachable through a CLI the image never runs.',
      }),
    ).toBeNull();
  });
});
