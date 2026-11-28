# syntax=docker/dockerfile:1

# ── Build stage ──────────────────────────────────────────────────────────────
# Runs on the build machine's own platform, also for the arm64 image: dist/ is plain JavaScript,
# so there is no need to emulate the slow client and server builds under QEMU.
FROM --platform=$BUILDPLATFORM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Runtime stage (one per target platform: linux/amd64, linux/arm64) ───────
FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a
# apk upgrade: OS security fixes between base-image updates (Dependabot bumps the digest weekly).
RUN apk upgrade --no-cache && apk add --no-cache tini
WORKDIR /app
COPY package.json package-lock.json ./
# Runtime dependencies only. npm, corepack and yarn are removed afterwards: the app never runs them, and
# their bundled packages would only add findings to the image scan.
RUN npm ci --omit=dev \
  && npm cache clean --force \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
    /usr/local/lib/node_modules/corepack /usr/local/bin/corepack \
    /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
ENV HOMEGANTRY_DATA_DIR=/data

EXPOSE 3000
VOLUME /data

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# OCI labels. CI overrides version, revision and created with docker/metadata-action; the default
# VERSION is kept equal to package.json by release-please (extra-files).
# x-release-please-start-version
ARG VERSION=0.2.0
# x-release-please-end
LABEL org.opencontainers.image.title="HomeGantry" \
  org.opencontainers.image.description="Auto-discovering Docker homelab dashboard" \
  org.opencontainers.image.source="https://github.com/geraldvd/homegantry" \
  org.opencontainers.image.url="https://github.com/geraldvd/homegantry" \
  org.opencontainers.image.documentation="https://github.com/geraldvd/homegantry/tree/main/docs/guide" \
  org.opencontainers.image.licenses="MIT" \
  org.opencontainers.image.version="${VERSION}"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server/index.js"]
