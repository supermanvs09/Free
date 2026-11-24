# syntax=docker/dockerfile:1
# deepalgorithms.io as a container: build and prerender with Node, serve with nginx.
#   docker build -t deepalgorithms-website .
#   docker run -p 8080:8080 deepalgorithms-website      -> http://localhost:8080
# Or: docker compose up --build

# ---------- build: install, compile and prerender all 41 pages to static HTML ----------
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# No build settings: the site address and form endpoint live in src/data/site.js.
COPY . .
RUN npm run build && node scripts/csp.mjs /app/csp.conf

# ---------- serve: nginx as a non-root user, static files only ----------
FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/csp.conf /etc/nginx/snippets/csp.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
