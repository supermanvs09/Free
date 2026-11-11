# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && test -f dist/index.html

FROM nginx:1.27-alpine
ENV NGINX_ENVSUBST_FILTER="^(ONPREM_API_UPSTREAM|DNS_RESOLVER)$" \
    ONPREM_API_UPSTREAM="http://onprem-api:8090"
COPY nginx/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY docker/18-default-env.envsh /docker-entrypoint.d/18-default-env.envsh
COPY --from=build /app/dist /usr/share/nginx/html
RUN rm -f /etc/nginx/conf.d/default.conf
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/healthz >/dev/null || exit 1
