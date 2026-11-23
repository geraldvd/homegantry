/**
 * Knowledge-base commands:
 *
 *   npm run kb:check                  validate the YAML files (schema, duplicates, icon slugs)
 *   npm run kb:build                  generate server/knowledge-base.generated.json
 *   npm run kb:refresh-icons [commit] re-pin the dashboard-icons metadata (default: latest main)
 */
import fs from 'node:fs';
import {
  buildKnowledgeBase,
  checkDirectory,
  GENERATED_FILE,
  ICON_METADATA,
  KB_DIR,
  loadIconSlugs,
  readEntries,
} from './kb-lib.js';

const REPO = 'homarr-labs/dashboard-icons';

async function github<T>(route: string): Promise<T> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/${route}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'homegantry-kb-refresh' },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${route}`);
  return (await res.json()) as T;
}

async function refreshIcons(ref = 'main'): Promise<void> {
  const { sha } = await github<{ sha: string }>(`commits/${ref}`);
  const tree = await github<{ truncated: boolean; tree: Array<{ path: string }> }>(
    `git/trees/${sha}?recursive=1`,
  );
  if (tree.truncated) throw new Error('GitHub truncated the file tree; metadata not updated');
  const slugs = (format: 'svg' | 'png') =>
    tree.tree
      .map((item) => new RegExp(`^${format}/([^/]+)\\.${format}$`).exec(item.path)?.[1])
      .filter((slug): slug is string => slug !== undefined)
      .sort();
  const data = { repository: REPO, commit: sha, svg: slugs('svg'), png: slugs('png') };
  fs.writeFileSync(ICON_METADATA, `${JSON.stringify(data)}\n`);
  console.log(`Pinned ${REPO}@${sha}: ${data.svg.length} SVG, ${data.png.length} PNG icons`);
}

function check(): number {
  const issues = checkDirectory(KB_DIR, loadIconSlugs());
  for (const issue of issues) console.error(`${issue.file}: ${issue.message}`);
  if (issues.length > 0) {
    console.error(`\nkb:check failed with ${issues.length} problem(s).`);
    return 1;
  }
  console.log(`kb:check passed: ${readEntries(KB_DIR).entries.length} services.`);
  return 0;
}

const [command, arg] = process.argv.slice(2);
if (command === 'check') {
  process.exitCode = check();
} else if (command === 'build') {
  const out = arg ?? GENERATED_FILE;
  console.log(`Knowledge base: ${buildKnowledgeBase(out)} services written to ${out}`);
} else if (command === 'refresh-icons') {
  await refreshIcons(arg);
} else {
  console.error('Usage: tsx scripts/kb.ts <check|build [out]|refresh-icons [commit]>');
  process.exitCode = 2;
}
