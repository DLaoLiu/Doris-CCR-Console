# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps
WORKDIR /app

RUN corepack enable \
  && apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
WORKDIR /app
COPY index.html tsconfig.json tsconfig.server.json vite.config.ts vitest.config.ts ./
COPY src ./src
RUN pnpm run build

FROM node:22-bookworm-slim AS prod-deps
WORKDIR /app

RUN corepack enable \
  && apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3100
ENV DATA_DIR=/app/data
ENV DB_PATH=/app/data/ccr-console.db

RUN useradd --system --uid 1001 --create-home ccr \
  && mkdir -p /app/data \
  && chown -R ccr:ccr /app

COPY --from=prod-deps --chown=ccr:ccr /app/node_modules ./node_modules
COPY --from=build --chown=ccr:ccr /app/dist ./dist
COPY --from=build --chown=ccr:ccr /app/dist-web ./dist-web
COPY --chown=ccr:ccr package.json ./

USER ccr
EXPOSE 3100
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3100/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/server/index.js"]
