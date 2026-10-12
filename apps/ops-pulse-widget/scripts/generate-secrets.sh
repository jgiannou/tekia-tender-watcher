#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$ROOT/../.." && pwd)"
OUT="$ROOT/ARCPulseWidget/Secrets.generated.json"
ENV_FILE="${ENV_FILE:-$REPO/.env}"

export PULSE_API_URL="${OPS_API_URL:-http://gfjv662rudc5mhwwyvj2zcvh.169.58.65.199.sslip.io}"
export PULSE_ADMIN_TOKEN=""
export OUT

if [[ -f "$ENV_FILE" ]]; then
  PULSE_ADMIN_TOKEN="$(grep -E '^ADMIN_TOKEN=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '\r' || true)"
  export PULSE_ADMIN_TOKEN
  if grep -qE '^OPS_API_URL=' "$ENV_FILE"; then
    PULSE_API_URL="$(grep -E '^OPS_API_URL=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '\r')"
    export PULSE_API_URL
  fi
fi

if [[ -z "${PULSE_ADMIN_TOKEN}" ]]; then
  echo "warning: ADMIN_TOKEN missing in $ENV_FILE" >&2
fi

python3 - <<'PY'
import json, os
from pathlib import Path
out = Path(os.environ["OUT"])
token = os.environ.get("PULSE_ADMIN_TOKEN", "").strip()
api = os.environ.get("PULSE_API_URL", "").strip()
out.write_text(json.dumps({"apiUrl": api, "adminToken": token}, indent=2) + "\n")
print(f"Wrote {out} (token_len={len(token)})")
PY
