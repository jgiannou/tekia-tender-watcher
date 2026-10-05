#!/bin/sh
set -eu

echo "[saas-api] prisma migrate deploy…"
./node_modules/.bin/prisma migrate deploy

echo "[saas-api] starting node dist/index.js (SAAS_ENABLED=${SAAS_ENABLED:-})"
exec node dist/index.js
