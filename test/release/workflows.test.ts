import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

interface Step {
  id?: string;
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
}
interface Job {
  'runs-on': string;
  needs?: string | string[];
  if?: string;
  permissions?: Record<string, string>;
  outputs?: Record<string, string>;
  steps: Step[];
}
interface Workflow {
  on: Record<string, unknown>;
  permissions?: Record<string, string>;
  concurrency?: { group: string; 'cancel-in-progress': unknown };
  env?: Record<string, string>;
  jobs: Record<string, Job>;
}

const DIR = path.resolve('.github/workflows');
const files = fs.readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f));
const raw = (file: string) => fs.readFileSync(path.join(DIR, file), 'utf-8');
const load = (file: string) => parse(raw(file)) as Workflow;

const ci = load('ci.yml');
const image = ci.jobs.image!;
const stepIndex = (job: Job, pred: (s: Step) => boolean) => job.steps.findIndex(pred);
const usesAction = (name: string) => (s: Step) => s.uses?.startsWith(`${name}@`) ?? false;
const buildSteps = image.steps.filter(usesAction('docker/build-push-action'));
const pushStep = buildSteps.find((s) => s.with?.push === true)!;

describe('all workflows', () => {
  it('finds the workflow files', () => {
    expect(files).toEqual(expect.arrayContaining(['ci.yml', 'pr-title.yml']));
  });

  it.each(files)('%s pins every action to a full commit SHA with its version', (file) => {
    const uses = raw(file)
      .split('\n')
      .filter((line) => /^\s*-?\s*uses:/.test(line));
    expect(uses.length).toBeGreaterThan(0);
    for (const line of uses) {
      expect(line).toMatch(/uses: [\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
    }
  });

  it.each(files)('%s needs no secret except GITHUB_TOKEN', (file) => {
    const secrets = [...raw(file).matchAll(/secrets\.([A-Za-z_]+)/g)].map((m) => m[1]);
    expect(secrets.every((s) => s === 'GITHUB_TOKEN')).toBe(true);
  });

  it.each(files)('%s runs on GitHub-hosted ubuntu-latest only', (file) => {
    for (const [name, job] of Object.entries(load(file).jobs)) {
      expect(job['runs-on'], name).toBe('ubuntu-latest');
    }
  });

  it.each(files)('%s defaults to a read-only token', (file) => {
    expect(load(file).permissions).toEqual({ contents: 'read' });
  });

  it.each(files)('%s never puts event text straight into a shell script', (file) => {
    for (const job of Object.values(load(file).jobs)) {
      for (const step of job.steps) {
        expect(step.run ?? '').not.toMatch(/\$\{\{\s*github\.event\./);
      }
    }
  });
});

describe('ci.yml triggers', () => {
  it('runs on pushes to main and on pull requests', () => {
    expect(ci.on).toEqual({ push: { branches: ['main'] }, pull_request: { branches: ['main'] } });
  });

  it('never cancels a run on main (it may be cutting a release)', () => {
    expect(ci.concurrency?.['cancel-in-progress']).toBe(
      "${{ github.event_name == 'pull_request' }}",
    );
  });

  it('checks runtime dependencies with npm audit (#11)', () => {
    const audit = ci.jobs.audit!;
    expect(audit.steps.some((s) => s.run === 'npm audit --omit=dev')).toBe(true);
  });

  it('keeps the docs build', () => {
    expect(ci.jobs.docs!.steps.some((s) => s.run === 'npm run docs:build')).toBe(true);
  });
});

describe('ci.yml release-please', () => {
  const release = ci.jobs.release!;
  const step = release.steps.find(usesAction('googleapis/release-please-action'))!;

  it('only runs on pushes to main, after the checks', () => {
    expect(release.if).toBe("github.event_name == 'push'");
    expect(release.needs).toEqual(expect.arrayContaining(['check', 'audit', 'docs']));
  });

  it('uses the manifest config and only GITHUB_TOKEN', () => {
    expect(step.with).toMatchObject({
      'config-file': 'release-please-config.json',
      'manifest-file': '.release-please-manifest.json',
    });
    expect(step.with?.token).toBeUndefined();
    expect(release.permissions).toEqual({
      contents: 'write',
      'pull-requests': 'write',
      issues: 'write',
    });
  });

  it('passes on what the image and release-asset jobs need', () => {
    for (const key of ['release_created', 'tag_name', 'version', 'major']) {
      expect(release.outputs?.[key], key).toBe(`\${{ steps.release.outputs.${key} }}`);
    }
    expect(step.id).toBe('release');
  });
});

describe('ci.yml image', () => {
  const meta = image.steps.find(usesAction('docker/metadata-action'))!;
  const tags = String(meta.with?.tags)
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean);
  const released = "needs.release.outputs.release_created == 'true'";

  it('runs in the same workflow run as the release (GITHUB_TOKEN events trigger nothing)', () => {
    expect(image.needs).toEqual(expect.arrayContaining(['check', 'audit', 'release']));
    expect(image.if).toBe('${{ !cancelled() && !failure() }}');
    expect(image.permissions).toEqual({ contents: 'read', packages: 'write' });
  });

  it('tags main pushes with main and sha-…', () => {
    expect(tags).toContain('type=raw,value=main,enable={{is_default_branch}}');
    expect(tags).toContain('type=sha,enable={{is_default_branch}}');
  });

  it('moves latest, X.Y.Z and X.Y only on a release, X only from 1.0', () => {
    const version = 'value=${{ needs.release.outputs.version }}';
    expect(tags).toContain(`type=semver,pattern={{version}},${version},enable=\${{ ${released} }}`);
    expect(tags).toContain(
      `type=semver,pattern={{major}}.{{minor}},${version},enable=\${{ ${released} }}`,
    );
    expect(tags).toContain(
      `type=semver,pattern={{major}},${version},enable=\${{ ${released} && needs.release.outputs.major != '0' }}`,
    );
    expect(tags).toContain(`type=raw,value=latest,enable=\${{ ${released} }}`);
    expect(String(meta.with?.flavor)).toContain('latest=false');
    expect(tags.filter((t) => t.includes('latest'))).toHaveLength(1);
  });

  it('pushes linux/amd64 and linux/arm64 with provenance and SBOM attestations', () => {
    expect(pushStep.with).toMatchObject({
      platforms: 'linux/amd64,linux/arm64',
      push: true,
      tags: '${{ steps.meta.outputs.tags }}',
      labels: '${{ steps.meta.outputs.labels }}',
      provenance: 'mode=max',
      sbom: true,
    });
    expect(pushStep.if).toBe("github.event_name == 'push'");
    expect(image.steps.some(usesAction('docker/setup-qemu-action'))).toBe(true);
  });

  it.each(['amd64', 'arm64'])('builds, smoke-tests and scans linux/%s before pushing', (arch) => {
    const push = image.steps.indexOf(pushStep);
    const build = stepIndex(
      image,
      (s) => s.with?.platforms === `linux/${arch}` && s.with?.load === true,
    );
    const smoke = stepIndex(
      image,
      (s) => (s.run ?? '').includes('scripts/smoke-test.ts') && s.run!.includes(`ci-${arch}`),
    );
    const scan = stepIndex(
      image,
      (s) => usesAction('anchore/scan-action')(s) && s.with?.image === `homegantry:ci-${arch}`,
    );
    expect(build).toBeGreaterThanOrEqual(0);
    expect(smoke).toBeGreaterThan(build);
    expect(scan).toBeGreaterThan(build);
    expect(push).toBeGreaterThan(Math.max(smoke, scan));
  });

  it('checks the reported version and the OCI version label in the smoke test', () => {
    const smoke = image.steps.find(
      (s) => (s.run ?? '').includes('ci-amd64') && s.run!.includes('smoke'),
    )!;
    expect(smoke.run).toContain('"$VERSION"');
    expect(smoke.run).toContain('org.opencontainers.image.version');
  });

  it('fails the scan on fixable CRITICAL/HIGH findings, with the documented ignore file', () => {
    for (const scan of image.steps.filter(usesAction('anchore/scan-action'))) {
      expect(scan.with).toMatchObject({
        'fail-build': true,
        'severity-cutoff': 'high',
        'only-fixed': true,
        config: '.grype.yaml',
      });
    }
  });

  it('exposes the pushed digest', () => {
    expect(image.outputs?.digest).toBe(`\${{ steps.${pushStep.id}.outputs.digest }}`);
  });
});

describe('ci.yml release assets', () => {
  const assets = ci.jobs['release-assets']!;
  const script = assets.steps.map((s) => s.run ?? '').join('\n');

  it('only runs for a release, after the image was pushed', () => {
    expect(assets.needs).toEqual(['release', 'image']);
    expect(assets.if).toBe("needs.release.outputs.release_created == 'true'");
    expect(assets.permissions).toEqual({ contents: 'write', packages: 'read' });
  });

  it('attaches the SPDX SBOM of each platform to the GitHub release', () => {
    expect(script).toContain('docker buildx imagetools inspect');
    expect(script).toContain('.SPDX');
    for (const platform of ['linux/amd64', 'linux/arm64']) expect(script).toContain(platform);
    expect(script).toMatch(/gh release upload "\$TAG" .*\.spdx\.json/);
  });
});

describe('pr-title.yml', () => {
  const wf = load('pr-title.yml');
  const job = Object.values(wf.jobs)[0]!;

  it('runs when a pull request is opened, retitled or updated', () => {
    expect(wf.on).toEqual({
      pull_request: { types: ['opened', 'edited', 'reopened', 'synchronize'] },
    });
  });

  it('checks the title with scripts/pr-title.ts, passed through the environment', () => {
    const step = job.steps.find((s) => s.run?.includes('scripts/pr-title.ts'))!;
    expect(step.env?.PR_TITLE).toBe('${{ github.event.pull_request.title }}');
  });
});
