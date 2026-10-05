#!/bin/sh
set -eu

UPSTREAM="${API_UPSTREAM:-saas-api:3000}"
sed "s|__API_UPSTREAM__|${UPSTREAM}|g" \
  /etc/nginx/templates/default.conf \
  >/etc/nginx/conf.d/default.conf

exec nginx -g "daemon off;"
