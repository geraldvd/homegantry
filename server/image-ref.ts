/**
 * Docker image references and the knowledge base's image patterns (see
 * docs/guide/knowledge-base.md). A pattern matches whole path segments, so `redis` matches
 * `bitnami/redis:7` but never `redis-exporter`.
 */

export interface ImageRef {
  /** Lower-case registry host; `undefined` for Docker Hub. */
  registry?: string;
  /** Lower-case repository path without tag, digest or Docker Hub's `library/`. */
  path: string;
}

const DOCKER_HUB = new Set(['docker.io', 'index.docker.io', 'registry-1.docker.io']);
const BARE_IMAGE_ID = /^(sha256:)?[0-9a-f]{12,64}$/;

/** Parse an image reference, ignoring case, tag and digest. */
export function parseImageRef(image: string): ImageRef {
  const lower = image.trim().toLowerCase().split('@')[0]!;
  const segments = lower.split('/');
  // A tag can only follow the last slash; an earlier colon is a registry port.
  segments[segments.length - 1] = segments[segments.length - 1]!.split(':')[0]!;

  const first = segments[0]!;
  const hasRegistry =
    segments.length > 1 && (first.includes('.') || first.includes(':') || first === 'localhost');
  const registry = hasRegistry ? segments.shift() : undefined;
  const onHub = registry === undefined || DOCKER_HUB.has(registry);
  if (onHub && segments.length > 1 && segments[0] === 'library') segments.shift();
  return { registry: onHub ? undefined : registry, path: segments.join('/') };
}

/** The repository of an image, without tag or digest: all the coverage report shows. */
export function repositoryName(image: string): string {
  const trimmed = image.trim().toLowerCase();
  if (!trimmed || BARE_IMAGE_ID.test(trimmed)) return '(untagged image)';
  const { registry, path } = parseImageRef(trimmed);
  return registry ? `${registry}/${path}` : path;
}

function globToRegExp(glob: string): RegExp {
  const source = glob
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/]*');
  return new RegExp(`^${source}$`);
}

/**
 * True when `image` is the repository named by `pattern`. A pattern with a registry only matches
 * that registry; without one it matches on any registry and below any namespace or mirror prefix.
 * `*` matches within one path segment.
 */
export function imageMatches(pattern: string, image: string): boolean {
  const ref = parseImageRef(image);
  const want = parseImageRef(pattern);
  if (want.registry !== undefined && want.registry !== ref.registry) return false;
  // A pattern naming Docker Hub explicitly is pinned to it, like any other registry.
  const namesHub = DOCKER_HUB.has(pattern.trim().toLowerCase().split('/')[0]!);
  if (namesHub && ref.registry !== undefined) return false;

  if (pattern.includes('*')) {
    const regex = globToRegExp(want.path);
    if (want.registry !== undefined) return regex.test(ref.path);
    const segments = ref.path.split('/');
    const depth = want.path.split('/').length;
    return segments.length >= depth && regex.test(segments.slice(-depth).join('/'));
  }

  if (want.registry !== undefined) return ref.path === want.path;
  return ref.path === want.path || ref.path.endsWith(`/${want.path}`);
}
