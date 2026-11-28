/**
 * Checks a pull-request title against Conventional Commits. PRs are squash-merged, so the title
 * becomes the commit on `main` and release-please turns it into the changelog line.
 *
 * CI: `PR_TITLE="..." node --experimental-strip-types scripts/pr-title.ts` (no npm install
 * needed; the title comes from an environment variable, never from the command line).
 */
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const PR_TITLE_TYPES = [
  'feat',
  'fix',
  'perf',
  'refactor',
  'docs',
  'test',
  'build',
  'ci',
  'chore',
  'style',
  'revert',
] as const;

export type PrTitleResult = { ok: true } | { ok: false; error: string };

const HEADER = /^(?<type>[A-Za-z]+)(?:\((?<scope>[^)]*)\))?(?<bang>!)?(?<sep>:\s?)(?<subject>.*)$/;
const SCOPE = /^[a-z0-9][a-z0-9._/-]*$/;

export function checkPrTitle(title: string): PrTitleResult {
  const fail = (error: string): PrTitleResult => ({
    ok: false,
    error: `${error}. Expected "type(optional-scope): description", e.g. "fix(routes): return 404 for unknown stacks"; types: ${PR_TITLE_TYPES.join(', ')}.`,
  });
  if (!title.trim()) return fail('The title is empty');
  const m = HEADER.exec(title);
  if (!m?.groups) return fail('The title does not start with a type');
  const { type, scope, sep, subject } = m.groups as Record<string, string | undefined>;
  if (!(PR_TITLE_TYPES as readonly string[]).includes(type!)) {
    return fail(`unknown type "${type}"`);
  }
  if (scope !== undefined && !SCOPE.test(scope)) {
    return fail(`The scope "${scope}" must be lower case (letters, digits, . _ / -)`);
  }
  if (sep !== ': ') return fail('The type must be followed by ": " (colon and one space)');
  if (!subject!.trim()) return fail('The description after the type is empty');
  return { ok: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const title = process.env.PR_TITLE ?? '';
  const result = checkPrTitle(title);
  if (result.ok) {
    console.log(`PR title OK: ${title}`);
  } else {
    console.log(`::error title=PR title is not a Conventional Commit::${result.error}`);
    process.exitCode = 1;
  }
}
