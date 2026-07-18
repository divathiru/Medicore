# =====================================================================
# cashier-service — multi-stage Dockerfile
# Stage 1 (deps): install production dependencies only
# Stage 2 (runtime): copy source + deps, run as non-root
# =====================================================================
# ---------- Stage 1: dependency install ----------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
# ---------- Stage 2: runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /app
# Run as non-root user for security
RUN addgroup -S medicore && adduser -S medicore -G medicore
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN chown -R medicore:medicore /app
USER medicore
EXPOSE 4003
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4003/health || exit 1
CMD ["node", "src/index.js"]
