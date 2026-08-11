# Two runtime targets share one dependency layer:
#   web  — Next.js standalone server
#   node — MCP server, migrations, seeding, and ingestion (all tsx entry points)
#
# Debian slim rather than Alpine: esbuild (used by tsx and vitest) ships
# separate glibc and musl binaries, and glibc avoids a class of resolution
# surprises for no meaningful size saving here.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app


# ---------------------------------------------------------------------------
# Dependencies — manifests only, so a source edit does not invalidate the
# install layer.
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY apps/mcp/package.json ./apps/mcp/
COPY packages/auth/package.json ./packages/auth/
COPY packages/config/package.json ./packages/config/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/core/package.json ./packages/core/
COPY packages/db/package.json ./packages/db/
COPY tools/ingest/package.json ./tools/ingest/
RUN pnpm install --frozen-lockfile


# ---------------------------------------------------------------------------
# Build the Next.js app
# ---------------------------------------------------------------------------
FROM deps AS builder
COPY . .
# Collecting page data imports the auth module, which builds its adapter at
# module scope. Nothing connects or queries during a build — postgres.js dials
# lazily on first query — so placeholders satisfy the imports without reaching
# any real service. Both are replaced by compose at runtime.
ENV BETTER_AUTH_SECRET=build-time-placeholder-not-used-at-runtime \
    DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @rag/web build


# ---------------------------------------------------------------------------
# Web runtime — standalone output only, no pnpm store, no source
# ---------------------------------------------------------------------------
FROM base AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

# Standalone mirrors the monorepo layout beneath its root, hence apps/web/…
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "apps/web/server.js"]


# ---------------------------------------------------------------------------
# Node runtime — MCP server plus the tsx-based CLIs
# ---------------------------------------------------------------------------
FROM deps AS node
ENV NODE_ENV=production
COPY . .
EXPOSE 8787
CMD ["pnpm", "--filter", "@rag/mcp", "start"]
