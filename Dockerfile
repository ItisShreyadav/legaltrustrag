# syntax=docker/dockerfile:1
#
# LegalTrustRAG production image: Next.js standalone server on Node 22.
#   docker build -t legaltrustrag .
#   docker run -p 3000:3000 --env-file .env -v ltr-data:/app/data legaltrustrag
# See README.md ("Docker") for the volume layout and environment variables.

ARG NODE_IMAGE=node:22-bookworm-slim

# ---- deps: install exactly what package-lock.json pins ----------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
# onnxruntime-node's postinstall would download CUDA providers on linux/x64; the
# CPU runtime ships inside the npm package and is all the app uses.
ENV ONNXRUNTIME_NODE_INSTALL=skip
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- builder: next build with output: "standalone" ---------------------------
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# public/ may be empty (and so absent from the build context).
RUN mkdir -p public && npm run build

# ---- runner: only the traced server files, as an unprivileged user -----------
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1 \
    LTR_DB_PATH=/app/data/ltr.sqlite \
    LTR_MODEL_CACHE_DIR=/app/data/hf-cache

# The base image's `node` user (uid 1000) owns the app and the data volume.
RUN mkdir -p /app/data /app/.next && chown node:node /app/data /app/.next
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

USER node
VOLUME /app/data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

CMD ["node", "server.js"]
