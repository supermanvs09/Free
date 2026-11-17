# NHI Console - frontend image.
#
# Two stages. The first has Node and the dependency tree and builds the bundle;
# the second is nginx serving the bundle, plus the zero-dependency notification
# console server (server/): the live workspace everyone shares, alert email
# through Gmail (or Amazon SES) and Jira issues. Nothing else from the build
# stage is carried forward.
#
# Build:
#   docker build -t nhi-console:latest .
#
# Run:
#   docker run --rm -p 3000:3000 \
#     -e MAIL_FROM=alerts@yourcompany.com \
#     -e AWS_REGION=ap-south-1 \
#     nhi-console:latest
#
# On ECS / EKS / EC2, attach a role that may call ses:SendEmail (and
# ses:SendRawEmail) for the MAIL_FROM identity: the relay signs with it, so no
# AWS keys are configured anywhere. See README.md.

# ── Stage 1: build the bundle ────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install --no-audit --no-fund; fi
COPY . .
# on: the live scenarios panel (Ctrl/Cmd + Shift + L) is built in.
#   docker build --build-arg VITE_LIVE_REPLAY=on -t nhi-console .
ARG VITE_LIVE_REPLAY=off
ENV VITE_LIVE_REPLAY=$VITE_LIVE_REPLAY
RUN npm run build && test -f dist/index.html

# ── Stage 2: serve it ────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# Node for the relay only (no npm, no packages).
RUN apk add --no-cache nodejs

ENV NGINX_ENVSUBST_OUTPUT_DIR=/etc/nginx/conf.d \
    NGINX_ENVSUBST_FILTER='(NOTIFY_RELAY_PORT)$' \
    NOTIFY_RELAY_PORT=8787 \
    NOTIFY_RELAY_ENABLED=true \
    DATA_DIR=/var/lib/nhi

RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx/nginx.conf.template /etc/nginx/templates/nhi-console.conf.template
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --chmod=0755 docker/18-default-env.envsh /docker-entrypoint.d/18-default-env.envsh
COPY --chmod=0755 docker/40-notify-relay.sh /docker-entrypoint.d/40-notify-relay.sh
COPY server/ /opt/notify-relay/
COPY --from=build /app/dist /usr/share/nginx/html

RUN mkdir -p /var/lib/nhi \
    && chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /var/log/nginx /etc/nginx/conf.d /var/lib/nhi \
    && touch /var/run/nginx.pid && chown nginx:nginx /var/run/nginx.pid

# The shared workspace (users, audit log, settings, alerts) is saved here.
# Mount a volume to keep it across container restarts.
VOLUME ["/var/lib/nhi"]

USER nginx
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/healthz || exit 1

STOPSIGNAL SIGQUIT
CMD ["nginx", "-g", "daemon off;"]
