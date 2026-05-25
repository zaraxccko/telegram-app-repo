# syntax=docker/dockerfile:1.7

# ─── Stage 1: build ──────────────────────────────────────────
FROM node:20-bookworm-slim AS build

# better-sqlite3 нужны build-инструменты
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* bun.lock* ./
RUN npm install --no-audit --no-fund

COPY . .

RUN npm run build && npm run server:build

# ─── Stage 2: runtime ────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    tini ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server/dist ./server/dist

RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server/dist/index.js"]
