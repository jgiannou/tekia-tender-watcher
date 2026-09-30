# TEKIA Tender Watcher

Internal automation for TEKIA. Periodically queries the official Greek **KIMDIS / KHMDHS Open Data API**, scores relevant public procurement opportunities, deduplicates by ADAM, and sends short Slack alerts.

This is **not** a SaaS product. No customer UI. Slack is the main notification channel; HTTP is only for health + manual admin actions.

## What it does

1. Polls KIMDIS every N minutes (default 5)
2. Looks at recent **Requests (REQ)** and **Notices (PROC)**
3. Focuses on primary requests (`isInitial=true`, `isApproved=false`, `isApproval=false`)
4. Applies deterministic CPV / keyword / budget / PDF text scoring
5. Never Slack-alerts the same ADAM twice
6. On first empty DB bootstrap: indexes existing records and sends **one** startup message (no spam)

## Hard web relevance gate

Before scoring or Slack, every item must pass `isWebRelevant()` in `src/filters/web-relevance.ts`.

Rules:

1. At least one **strong web signal** must exist (ιστοσελίδα, web εφαρμογή, portal, CMS, WordPress, …)
2. Weak terms alone (`λογισμικό`, `εφαρμογή`, `συντήρηση`, `hosting`) are **not** enough
3. Broad CPVs like `72261000-2` are **never** enough alone
4. Hosting-only / generic software maintenance / Η/Υ repair / electronic protocol → `IRRELEVANT`, no Slack
5. Slack only if `isWebRelevant` **and** a concrete web category **and** `score >= ALERT_SCORE_THRESHOLD`

Statuses stored in SQLite: `RELEVANT` | `NEEDS_REVIEW` | `IRRELEVANT`.

## Architecture

```
node-cron → poll job → KIMDIS Open Data API
                    → SQLite (dedupe + history)
                    → optional PDF text extract
                    → Slack Incoming Webhook

Hono HTTP:
  GET  /health
  POST /admin/run
  POST /admin/test-slack   (X-Admin-Token required)
```

Stack: Node.js 22, TypeScript, pnpm, Hono, better-sqlite3, node-cron, Zod, pdf-parse, Vitest.

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
| `KIMDIS_BASE_URL` | official URL | Override only for tests |

Secrets must never be committed. `.env` is gitignored.

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
