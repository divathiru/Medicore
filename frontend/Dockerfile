# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

# NOTE: We intentionally do NOT set VITE_API_BASE_URL here.
# The frontend uses relative paths (empty base URL) for all API calls.
# Nginx in stage 2 proxies /auth/*, /patients/*, /doctors/*, /cashier/*, /ai/*
# to main-website:4000 inside the Docker network. This means the compiled JS
# bundle works correctly from ANY host/IP — no rebuild needed when the URL changes.
RUN npm run build

# ── Stage 2: Serve ───────────────────────────────────────────────────────────
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/index.html > /dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
