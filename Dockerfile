# syntax=docker/dockerfile:1

# =============================================================================
# Stage 1 — build the Vite SPA
# =============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Reproducible install from the lockfile.
COPY package.json package-lock.json ./
RUN npm ci

# GHOSTFOLIO_URL is baked into the client bundle at build time via Vite's
# envPrefix. Leave it EMPTY so the browser calls same-origin "/api/v1",
# which the runtime server reverse-proxies to the real Ghostfolio. Setting
# it to a container-internal hostname here would break the browser (it can't
# resolve "ghostfolio:3333").
ENV GHOSTFOLIO_URL=""

COPY . .
RUN npm run build
# Outputs the static bundle to /app/dist

# =============================================================================
# Stage 2 — lean runtime (zero node_modules)
# =============================================================================
FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

# Built bundle + the tiny config/proxy server + the editable config.json.
# node:alpine ships a non-root `node` user (uid 1000); copy with ownership so
# the PUT /sidecar/config endpoint can write config.json at runtime.
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --chown=node:node server.mjs ./
COPY --chown=node:node config.json ./config.json

# Ghostfolio upstream for the /api reverse proxy (container hostname).
# Override with -e / docker-compose as needed.
ENV GHOSTFOLIO_URL=http://ghostfolio:3333
ENV PORT=5173

EXPOSE 5173

USER node

# Lightweight liveness check against the SPA root.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5173)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
