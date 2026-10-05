#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npx concurrently -k -n vite,electron -c blue,magenta \
  "npx vite --host 127.0.0.1 --port 5190" \
  "npx wait-on http://127.0.0.1:5190 && npx electron ."
