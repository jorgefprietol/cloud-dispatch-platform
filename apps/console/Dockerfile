FROM node:22-alpine AS build
WORKDIR /src
COPY apps/console/package*.json ./
RUN npm ci
COPY apps/console/ ./
RUN npm run build
FROM nginxinc/nginx-unprivileged:1.31-alpine
USER root
RUN apk add --no-cache jq
COPY --from=build --chown=101:101 /src/dist /usr/share/nginx/html
COPY apps/console/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY apps/console/runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
RUN chmod +x /docker-entrypoint.d/40-runtime-config.sh && chown -R 101:101 /usr/share/nginx/html
USER 101
EXPOSE 8080
