# Releases and upgrading

HomeGantry uses [semantic versioning](https://semver.org/). Until 1.0, a new **minor** version (`0.3.0`) may contain
breaking changes; a new **patch** version (`0.2.1`) only contains fixes, including dependency and base-image security
updates.

## Image tags

Images are published to the GitHub Container Registry as `ghcr.io/geraldvd/homegantry`, for `linux/amd64` and
`linux/arm64` (Raspberry Pi 4/5 and other 64-bit ARM boards). Docker picks the right one automatically.

| Tag              | Moves when                      | Use it for                                          |
| ---------------- | ------------------------------- | --------------------------------------------------- |
| `0.2`            | a `0.2.x` patch release         | **Recommended.** Fixes without breaking changes.    |
| `0.2.0`          | never                           | An exact, reproducible version.                     |
| `latest`         | every release (not every merge) | Always the newest release, including breaking ones. |
| `main`           | every merge to `main`           | Trying unreleased changes. Not for production.      |
| `sha-<commit>`   | never                           | One exact build of `main`.                          |
| `1` (from 1.0.0) | every `1.x.y` release           | Major-version pinning, once there is a 1.0.         |

Pin a minor version in your compose file:

```yaml
services:
  homegantry:
    image: ghcr.io/geraldvd/homegantry:0.2
```

The running version is shown in the dashboard footer (it links to the release notes) and in `GET /api/health`:

```bash
curl -s http://localhost:3000/api/health
# {"status":"ok","docker":"connected","version":"0.2.0"}
```

## What changed

- [CHANGELOG.md](https://github.com/geraldvd/homegantry/blob/main/CHANGELOG.md) lists every release.
- Each [GitHub release](https://github.com/geraldvd/homegantry/releases) has the same notes. Read them before moving
  to a new minor version: breaking changes are listed first.

## Upgrading

```bash
# 1. Point the image at the new version (or keep 0.2 / latest)
#    image: ghcr.io/geraldvd/homegantry:0.3
# 2. Pull and recreate the container
docker compose pull homegantry
docker compose up -d homegantry
```

Your overrides, manual services, stacks and settings live in the `/data` volume and are kept. To go back, set the
previous tag again and repeat step 2.

## SBOM and provenance

Every release image is scanned for known vulnerabilities in CI (the release is not pushed with a fixable critical or
high finding) and comes with a software bill of materials (SBOM):

- **Release asset**: each [GitHub release](https://github.com/geraldvd/homegantry/releases) has
  `homegantry-<version>-linux-amd64.spdx.json` and `homegantry-<version>-linux-arm64.spdx.json` (SPDX JSON).
- **Image attestations**: the SBOM and a [SLSA provenance](https://slsa.dev/) statement (how and from which commit the
  image was built) are attached to the image in the registry. Read them with Docker Buildx:

```bash
docker buildx imagetools inspect ghcr.io/geraldvd/homegantry:0.2.0 \
  --format '{{ json (index .SBOM "linux/amd64").SPDX }}'
docker buildx imagetools inspect ghcr.io/geraldvd/homegantry:0.2.0 \
  --format '{{ json (index .Provenance "linux/amd64").SLSA }}'
```

Security fixes go into the latest release only (see
[SECURITY.md](https://github.com/geraldvd/homegantry/blob/main/SECURITY.md)).
