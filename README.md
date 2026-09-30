# TEKIA Tender Watcher

Internal automation for TEKIA. Periodically queries the official Greek **KIMDIS / KHMDHS Open Data API**, scores relevant public procurement opportunities, deduplicates by ADAM, and sends short Slack alerts.

A **local-only operator dashboard** (`apps/dashboard`) reviews opportunities and records submissions. Slack is the alert layer; the dashboard is the review / action layer.

**Hard security boundary:** the cloud watcher never sends email, never submits offers, and never contacts authorities. External sending (if added later) must stay local.

## What it does

1. Polls KIMDIS every N minutes (default 5)
2. Looks at recent **Requests (REQ)** and **Notices (PROC)**
3. Focuses on primary requests (`isInitial=true`, `isApproved=false`, `isApproval=false`)
4. Applies deterministic CPV / keyword / budget / PDF text scoring
5. Never Slack-alerts the same ADAM twice
6. On first empty DB bootstrap: indexes existing records and sends **one** startup message (no spam)
7. Exposes an authenticated Operator API for the local dashboard

## Hard web relevance gate

Before scoring or Slack, every item must pass `isWebRelevant()` in `src/filters/web-relevance.ts`.

Rules:

1. At least one **strong web signal** must exist (ιστοσελίδα, web εφαρμογή, portal, CMS, WordPress, …)
2. Weak terms alone (`λογισμικό`, `εφαρμογή`, `συντήρηση`, `hosting`) are **not** enough
3. Broad CPVs like `72261000-2` are **never** enough alone
4. Hosting-only / generic software maintenance / Η/Υ repair / electronic protocol → `IRRELEVANT`, no Slack
5. Slack only if `isWebRelevant` **and** a concrete web category **and** `score >= ALERT_SCORE_THRESHOLD`

Statuses stored in SQLite: `RELEVANT` | `NEEDS_REVIEW` | `IRRELEVANT` | `EXPIRED` | `TARGETED`.

## Architecture

```
CLOUD WATCHER (Coolify, 24/7)
  node-cron → poll job → KIMDIS Open Data API
                      → SQLite (dedupe + history + submissions + events)
                      → optional PDF text extract
                      → Slack Incoming Webhook
  Hono HTTP:
    GET  /health
    POST /admin/*              (X-Admin-Token)
    GET|PATCH|POST /api/operator/*  (X-Operator-Token, restrictive CORS)

LOCAL DASHBOARD (Mac only — never deploy)
  http://localhost:5173
  Opportunities → Tender detail → Submitted → Settings / Vault
```

Stack: Node.js 22, TypeScript, pnpm, Hono, better-sqlite3, node-cron, Zod, pdf-parse, Vitest, React + Vite (local dashboard).

## KIMDIS API endpoints used

Base URL: `https://cerpp.eprocurement.gov.gr`

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/khmdhs-opendata/request?page=0` | Search primary requests |
| GET | `/khmdhs-opendata/request/attachment/{ADAM}` | Download REQ PDF |
| POST | `/khmdhs-opendata/notice?page=0` | Search notices/invitations |
| GET | `/khmdhs-opendata/notice/attachment/{ADAM}` | Download PROC PDF |

Docs: https://cerpp.eprocurement.gov.gr/khmdhs-opendata/help

No scraping. No write/submission API. No credentials required for Open Data retrieval.

Public page URL generated as:

`https://cerpp.eprocurement.gov.gr/upgkimdis/unprotected/home.xhtml?referenceNumber={ADAM}`

## Local setup

### Prerequisites

- Node.js 22+
- pnpm 9+
- native build tools for `better-sqlite3` (Xcode CLT on macOS)

### Steps

```bash
git clone git@github.com:jgiannou/tekia-tender-watcher.git
cd tekia-tender-watcher
pnpm install
cp .env.example .env
```

Edit `.env` and set at least:

- `SLACK_WEBHOOK_URL`
- `ADMIN_TOKEN` (min 8 chars)

Then:

```bash
pnpm typecheck
pnpm test
pnpm dev
```

Health check:

```bash
curl http://localhost:3000/health
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Runtime mode |
| `PORT` | `3000` | HTTP port |
| `DATABASE_PATH` | `./data/tenders.db` | SQLite file path |
| `POLL_INTERVAL_MINUTES` | `5` | Cron poll interval |
| `LOOKBACK_HOURS` | `24` | Recent window queried each cycle |
| `MIN_BUDGET` | `1500` | Preferred min budget (ex VAT) |
| `MAX_BUDGET` | `30000` | Preferred max budget (ex VAT) |
| `ALERT_SCORE_THRESHOLD` | `60` | Slack only if score ≥ this |
| `BOOTSTRAP_SEND_ALERTS` | `false` | If true, alert on first empty-DB indexing |
| `SLACK_WEBHOOK_URL` | _(empty)_ | Slack Incoming Webhook URL |
| `ADMIN_TOKEN` | _(required)_ | Protects `/admin/*` |
| `OPERATOR_API_TOKEN` | _(empty)_ | Protects `/api/operator/*` (required for dashboard) |
| `LOCAL_DASHBOARD_URL` | _(empty)_ | Optional Slack CTA base, e.g. `http://localhost:5173` |
| `LOCAL_DASHBOARD_ORIGINS` | `http://localhost:5173` | Comma-separated CORS allow-list (no wildcards) |
| `KIMDIS_BASE_URL` | official URL | Override only for tests |

Secrets must never be committed. `.env` is gitignored.

## Desktop App

Primary operator experience is the native macOS app wrapping the **same** React dashboard.

```
apps/desktop/          Electron main + preload (secure IPC)
apps/dashboard/        Shared React/Vite renderer (web + desktop)
```

### Development

```bash
# Cloud watcher must be reachable (local or Coolify)
pnpm dev

# Desktop app (starts Vite renderer + Electron)
pnpm desktop:dev
```

Browser-only renderer (optional, for UI work without Electron):

```bash
pnpm dashboard:dev:web
```

### Build / package (Apple Silicon)

```bash
pnpm desktop:build
pnpm desktop:package
```

Outputs (arm64):

- `apps/desktop/release/mac-arm64/TEKIA Tender Watcher.app`
- `apps/desktop/release/TEKIA Tender Watcher-*.dmg`

### Install

1. Open the DMG
2. Drag **TEKIA Tender Watcher** into **Applications**
3. Launch the app
4. Open **Settings → Desktop Connection**
5. Enter Watcher API URL + Operator API Token
6. **Test Connection** → **Save**

Token is stored with Electron `safeStorage` under:

`~/Library/Application Support/TEKIA Tender Watcher/`

The renderer never sees the raw token. API calls go Renderer → preload IPC → main → HTTPS cloud API.

### Unsigned macOS warning

This internal build is **not notarized**. First launch may show Gatekeeper:

> “TEKIA Tender Watcher” can’t be opened because Apple cannot check it for malicious software.

Open via **System Settings → Privacy & Security → Open Anyway**, or right-click → Open.

### Deep links

Protocol registered: `tekia-tender://tender/{referenceNumber}`  
Opens Tender Detail when the app is running (or on launch). Slack CTA wiring can use this later.

Bundle id: `gr.tekia.tenderwatcher`

### Safety

- Closing the desktop app does **not** stop cloud KIMDIS polling
- Desktop has **no** automatic email/offer/portal submission
- Approval + Send remain explicit human actions (Send still not configured)

## Google Drive Vault Setup

Google Drive OAuth belongs **only** to the Electron desktop app (Main process).  
Do **not** put Google credentials in Coolify / cloud watcher / `VITE_*` variables.

### Google Cloud Console

1. Open [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select project: **TEKIA Tender Watcher**
3. **APIs & Services → Library → Google Drive API → Enable**
4. **APIs & Services → Library → Google Docs API → Enable**  
   Required for placeholder merge (`documents.batchUpdate` / ReplaceAllText) into **tender copies only**. Masters are never edited.
5. **Google Auth Platform / APIs & Services → OAuth consent screen**  
   Configure for internal/testing users as needed
6. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Desktop app**
   - Name: **TEKIA Tender Watcher Desktop**
   - Reuse this same OAuth client for Drive + Docs (do **not** create a second client)
7. Copy **Client ID** (and Client Secret if shown — Desktop secrets are not server-confidential)

### Local desktop configuration

Edit (gitignored):

`apps/desktop/.env`

```env
GOOGLE_OAUTH_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=xxxxxxxx
GOOGLE_DRIVE_SCOPE=https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file openid email profile
```

Do **not** put the TEKIA/Tenders folder ID in `.env`. Select it in the app UI.

Alternative (also gitignored): `apps/desktop/google-oauth.local.json`

```json
{
  "clientId": "xxxxxxxx.apps.googleusercontent.com",
  "clientSecret": "xxxxxxxx"
}
```

### In the app

1. `pnpm desktop:dev` (or packaged app)
2. **Settings → Google Drive Vault → Connect Google Drive**
3. Sign in via **system browser** (PKCE + loopback)
4. Paste **one** root folder URL/ID: **TEKIA / Tenders**
5. App discovers Company Documents / Templates / Submissions and known children
6. **Refresh Vault** as needed

### Scope note

Operator-approved scopes (2026-09-30):

- `https://www.googleapis.com/auth/drive.readonly` — read the existing TEKIA/Tenders vault
- `https://www.googleapis.com/auth/drive.file` — create tender workspaces, copy templates, and write Docs merges into **app-created copies**

Google Docs API uses the same OAuth client and the existing `drive.file` (+ `drive.readonly`) scopes. **No extra OAuth scope** is required for ReplaceAllText on files available to the app.

After changing scopes: **Disconnect → Connect** again so Google issues a new consent/token.

Do **not** request full `https://www.googleapis.com/auth/drive` unless explicitly required.

### Template copy → merge flow

1. Select master Google Doc in Settings (never modified)
2. Tender Detail → Generate → Drive `files.copy` into `Submissions/{ADAM}/draft/`
3. Docs API `batchUpdate` / ReplaceAllText on the **copy only**
4. Known tender/company fields auto-fill; economic pricing and declaration text require explicit operator input
5. Unresolved `{{...}}` keep status **DRAFT** and block **Mark READY**
6. Generation never sends or submits externally — human review remains mandatory

### Company Profile sync (controlled)

Architecture:

```
Templates/Company Profile/   ← MASTER (placeholders; never edited by Sync)
        ↓ files.copy
Company Documents/Company Profile/TEKIA – Tender Company Profile
        ↓ Docs ReplaceAllText on the COPY only
FILLED CURRENT PROFILE (Vault checklist uses this)
```

Company Settings save to the cloud watcher DB only. Desktop **Sync Company Profile** regenerates the current profile from the master each time (idempotent).

| Company Settings / source | Placeholder |
|---|---|
| `legal_name` | `{{LEGAL_NAME}}` |
| `trading_name` + `distinctive_title_confirmed` | `{{TRADING_NAME_STATUS}}` (never claims confirmed title if flag is false) |
| `legal_form` | `{{LEGAL_FORM}}` |
| `vat_number` | `{{VAT_NUMBER}}` |
| `tax_office` | `{{TAX_OFFICE}}` |
| `gemi_number` | `{{GEMI_NUMBER}}` |
| `address` | `{{ADDRESS}}` |
| `email` | `{{CONTACT_EMAIL}}` |
| `phone` | `{{CONTACT_PHONE}}` |
| `website` | `{{WEBSITE}}` |
| *(manual — not from settings)* | `{{PORTFOLIO_REFERENCES}}`, `{{TECH_STACK}}`, `{{PUBLIC_SECTOR_NOTES}}` |

Blank settings leave placeholders intact. Manual fields stay unresolved until maintained in the master / later features. Never invents values. Does not send externally.

### Tokens

- Access/refresh tokens: Electron `safeStorage` in  
  `~/Library/Application Support/TEKIA Tender Watcher/drive-vault.json`  
  (token field encrypted; never sent to renderer or cloud watcher)
- Disconnect removes local OAuth state; does **not** delete Drive files

## Local operator dashboard (web)

The dashboard React app remains available in the browser for development. Do not deploy it to Coolify.

```bash
# Terminal 1 — cloud watcher API (or point VITE_WATCHER_API_URL at Coolify)
pnpm dev

# Terminal 2 — local dashboard (browser)
cp apps/dashboard/.env.example apps/dashboard/.env
# set VITE_WATCHER_API_URL + VITE_OPERATOR_API_TOKEN (same token as OPERATOR_API_TOKEN)
pnpm dashboard:dev:web
```

Open http://localhost:5173

Routes:

- `/opportunities` — default home + counters/filters
- `/tenders/:referenceNumber` — review / drafts / approval / record submission
- `/submitted` — submission history + PENDING/WON/LOST
- `/settings` — company, Drive vault, documents, safe watcher config

Operator API (token required):

- `GET /api/operator/opportunities`
- `GET /api/operator/tenders/:referenceNumber`
- `PATCH /api/operator/tenders/:referenceNumber`
- `PATCH /api/operator/tenders/:referenceNumber/status`
- `POST /api/operator/tenders/:referenceNumber/events`
- `POST /api/operator/tenders/:referenceNumber/approve`
- `POST /api/operator/tenders/:referenceNumber/submission`
- `GET /api/operator/submissions`
- `PATCH /api/operator/submissions/:id/result`
- `GET|PUT /api/operator/settings`
- `GET /api/operator/config`

Operational statuses: `NEW → REVIEW → READY → SUBMITTED → WON|LOST`.  
`SUBMITTED` is only set via a real Submission record (or manual “Record Existing Submission”).

## Slack Incoming Webhook setup

1. Create a Slack channel, suggested: `#tekia-tenders`
2. Go to https://api.slack.com/apps
3. **Create New App**
4. Choose **From scratch**
5. Name: `TEKIA Tender Watcher`
6. Select the TEKIA Slack workspace
7. Open **Incoming Webhooks**
8. Enable Incoming Webhooks
9. Click **Add New Webhook to Workspace**
10. Select `#tekia-tenders`
11. Authorize
12. Copy the webhook URL
13. Put it **only** in `.env`:

```env
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

Treat the webhook URL like a password. Never commit it.

## How to test Slack

```bash
curl -X POST http://localhost:3000/admin/test-slack \
  -H "X-Admin-Token: YOUR_ADMIN_TOKEN"
```

You should see a message in `#tekia-tenders`.

## How to run a manual KIMDIS poll

```bash
curl -X POST http://localhost:3000/admin/run \
  -H "X-Admin-Token: YOUR_ADMIN_TOKEN"
```

## Re-evaluate stored tenders (no Slack)

Re-scores every row in SQLite with the current filters. Does **not** send Slack.

```bash
curl -X POST http://localhost:3000/admin/reevaluate \
  -H "X-Admin-Token: YOUR_ADMIN_TOKEN"
```

## Resend Slack for current matches

Re-evaluates first, then alerts for rows that still pass the web gate + score threshold.

```bash
# Dry run — see candidates, send nothing
curl -X POST http://localhost:3000/admin/resend \
  -H "X-Admin-Token: YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dryRun":true,"force":true,"limit":50}'

# Actually send (force=true also re-alerts already notified ADAMs)
curl -X POST http://localhost:3000/admin/resend \
  -H "X-Admin-Token: YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"force":true,"limit":50}'
```

Body options:

| Field | Default | Meaning |
|-------|---------|---------|
| `force` | `false` | If true, also re-send for ADAMs that already have `notified_at` |
| `dryRun` | `false` | If true, only return candidates — no Slack |
| `limit` | `50` | Max alerts to send (cap `200`) |

Without `force`, only matching rows that were never notified are sent.

## Docker

```bash
docker build -t tekia-tender-watcher .
docker run --rm -p 3000:3000 \
  -v tekia_tender_data:/data \
  -e DATABASE_PATH=/data/tenders.db \
  -e ADMIN_TOKEN=change-me-now \
  -e SLACK_WEBHOOK_URL=https://hooks.slack.com/services/... \
  -e POLL_INTERVAL_MINUTES=5 \
  -e BOOTSTRAP_SEND_ALERTS=false \
  tekia-tender-watcher
```

Persistent volume must be mounted at `/data`.

## Coolify deployment

1. In Coolify, create a **new resource** → **Docker** / **Dockerfile** deployment
2. Connect the private GitHub repo: `jgiannou/tekia-tender-watcher`
3. Build pack: **Dockerfile** (repo root)
4. Port: `3000`
5. Health check path: `/health`
6. Add a **persistent volume**:
   - Destination path: `/data`
   - Keep it across redeploys
7. Set environment variables:

```env
NODE_ENV=production
PORT=3000
DATABASE_PATH=/data/tenders.db
POLL_INTERVAL_MINUTES=5
LOOKBACK_HOURS=24
MIN_BUDGET=1500
MAX_BUDGET=30000
ALERT_SCORE_THRESHOLD=60
BOOTSTRAP_SEND_ALERTS=false
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
ADMIN_TOKEN=long-random-secret
KIMDIS_BASE_URL=https://cerpp.eprocurement.gov.gr
```

8. Deploy
9. After first boot, check logs for:
   - `watcher started`
   - bootstrap Slack message
10. Test:

```bash
curl https://YOUR_INTERNAL_OR_PUBLIC_HOST/health

curl -X POST https://YOUR_HOST/admin/test-slack \
  -H "X-Admin-Token: long-random-secret"

curl -X POST https://YOUR_HOST/admin/run \
  -H "X-Admin-Token: long-random-secret"

# Optional: dry-run then force-resend matches after filter changes
curl -X POST https://YOUR_HOST/admin/resend \
  -H "X-Admin-Token: long-random-secret" \
  -H "Content-Type: application/json" \
  -d '{"dryRun":true,"force":true,"limit":50}'
```

A public domain is **optional**. Admin endpoints remain protected by `ADMIN_TOKEN` either way.

## Where to edit filters

| What | File / env |
|------|------------|
| Strong CPVs | `src/filters/cpvs.ts` → `STRONG_CPVS` |
| Positive keywords | `src/filters/keywords.ts` → `POSITIVE_KEYWORDS_EL` / `POSITIVE_KEYWORDS_EN` |
| Negative / hardware / social terms | `src/filters/keywords.ts` |
| Scoring weights | `src/filters/scorer.ts` |
| Budget range | `.env` → `MIN_BUDGET` / `MAX_BUDGET` |
| Slack threshold | `.env` → `ALERT_SCORE_THRESHOLD` |

## Known limitations (v1)

- Scanned/image PDFs often have **no extractable text** → `pdf_text_status=unreadable`
- No OCR in v1
- Unreadable PDFs do **not** fail the job and do **not** mark the opportunity irrelevant
- High-scoring unreadable PDFs are flagged in Slack as “PDF needs manual review”
- No UI / auth users / AI / queues / Postgres

## Troubleshooting

| Symptom | Check |
|---------|--------|
| App exits on boot | `ADMIN_TOKEN` missing/too short; invalid env |
| No Slack messages | `SLACK_WEBHOOK_URL`, channel permissions, `/admin/test-slack` |
| Spam on first deploy | Keep `BOOTSTRAP_SEND_ALERTS=false` |
| Same tender alerts again | Should not happen; verify SQLite volume persistence at `/data` |
| Health shows old poll | Check logs for `poll failed` / KIMDIS timeouts |
| 401 on admin | Send header `X-Admin-Token` |
| PDF never classified | Likely scanned PDF; manual review expected |
| DB resets after redeploy | Persistent volume not mounted to `/data` |

## License

Private / internal TEKIA use.
