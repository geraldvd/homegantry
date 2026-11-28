import { describe, expect, it } from 'vitest';
import { checkPrTitle, PR_TITLE_TYPES } from '../../scripts/pr-title.js';

describe('checkPrTitle', () => {
  it.each([
    'feat: release engineering (versioning, changelog, multi-arch, SBOM + scan, dependency updates)',
    'fix(routes): return 404 for unknown stacks',
    'feat(matcher)!: match whole repository paths',
    'docs: explain HOMEGANTRY_HOST',
    'chore(main): release 0.2.0',
    'chore(deps): bump the npm-development group with 4 updates',
    'fix(deps): bump express from 4.22.3 to 4.22.4',
    'ci(deps): bump the github-actions group with 2 updates',
    'build(deps): bump node from 22-alpine to 24-alpine',
    'revert: "feat: add something"',
  ])('accepts %s', (title) => {
    expect(checkPrTitle(title)).toEqual({ ok: true });
  });

  it.each([
    ['', /empty/],
    ['M4: UX (search, keyboard navigation)', /type/],
    ['Add a feature', /type/],
    ['feature: add a thing', /unknown type "feature"/],
    ['Feat: add a thing', /unknown type "Feat"/],
    ['feat:add a thing', /": "/],
    ['feat : add a thing', /type/],
    ['feat(): add a thing', /scope/],
    ['feat(Matcher): add a thing', /scope/],
    ['feat: ', /description/],
  ])('rejects %j', (title, message) => {
    const result = checkPrTitle(title);
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.error).toMatch(message);
  });

  it('lists the documented types', () => {
    expect(PR_TITLE_TYPES).toEqual(
      expect.arrayContaining(['feat', 'fix', 'docs', 'test', 'refactor', 'build', 'ci', 'chore']),
    );
  });
});
