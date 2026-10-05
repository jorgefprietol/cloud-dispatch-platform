FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS build
WORKDIR /src
COPY apps/console/package*.json ./
RUN npm ci
COPY apps/console/ ./
RUN npm run build
FROM nginxinc/nginx-unprivileged:1.31-alpine@sha256:b9241c6e7b8e9a862f129d8d4199ab64b10390949a78bdd5603379b32c844083
USER root
RUN apk add --no-cache jq
COPY --from=build --chown=101:101 /src/dist /usr/share/nginx/html
COPY apps/console/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY apps/console/runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
RUN chmod +x /docker-entrypoint.d/40-runtime-config.sh && chown -R 101:101 /usr/share/nginx/html
USER 101
EXPOSE 8080
