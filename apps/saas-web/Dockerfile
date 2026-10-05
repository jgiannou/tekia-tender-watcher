# syntax=docker/dockerfile:1.7
# ARC Tenders SaaS web — nginx SPA + /api proxy to SaaS API
# Public domain: https://arc-tenders.tekia.gr
#
# Build context MUST be repository root:
#   docker build -f apps/saas-web/Dockerfile -t arc-tenders-web .

FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/saas-web/package.json ./apps/saas-web/
# Root postinstall runs `prisma generate` — not needed for the web image.
COPY prisma ./prisma

RUN pnpm install --frozen-lockfile --filter @tekia/saas-web... --ignore-scripts \
  || pnpm install --filter @tekia/saas-web... --ignore-scripts

COPY apps/saas-web ./apps/saas-web

RUN pnpm --filter @tekia/saas-web build

FROM nginx:1.27-alpine AS runtime

RUN apk add --no-cache wget \
  && rm -f /etc/nginx/conf.d/default.conf

COPY apps/saas-web/docker/nginx.conf /etc/nginx/templates/default.conf
COPY apps/saas-web/docker/entrypoint.sh /entrypoint.sh
COPY --from=build /app/apps/saas-web/dist /usr/share/nginx/html

RUN chmod +x /entrypoint.sh

ENV API_UPSTREAM=saas-api:3000

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

CMD ["/entrypoint.sh"]
