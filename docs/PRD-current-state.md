# PRD — Current State (v1)

**Product:** TEKIA Tender Watcher  
**Document type:** Current-state Product Requirements Document  
**Status:** As-built (internal product)  
**Date:** 2026-10-04  
**Audience:** Product / eng planning for SaaS redesign  
**Source of truth:** codebase + README (not aspirational)

> This document describes **what exists today**. It is the baseline for a future multi-tenant SaaS product. SaaS scope is listed only as gaps / direction — not as committed requirements.

---

## 1. One-liner

Internal TEKIA tool that watches Greek public procurement on **ΚΗΜΔΗΣ (KIMDIS)**, filters for web-relevant opportunities, alerts via Slack, and lets operators review, draft, and record outreach/submissions from a local macOS desktop app — without ever auto-sending email or submitting offers.

---

## 2. Problem (today)

Finding relevant Greek public tenders for a **web-focused SME** is noisy and manual:

- ΚΗΜΔΗΣ volume is high; most notices are irrelevant.
- Relevant signals hide in titles, CPVs, and PDF bodies.
- Operators need a structured pipeline from “new match” → early interest → invitation → offer → result.
- Company documents and Google Doc templates must stay under operator control (not cloud auto-send).

**v1 solves this for one organization (TEKIA)** with a cloud watcher + local operator UI.

---

## 3. Goals & non-goals (v1)

### Goals

| ID | Goal | Status |
|----|------|--------|
| G1 | Poll ΚΗΜΔΗΣ Open Data for REQ + PROC on a schedule | Done |
| G2 | Hard web-relevance gate + deterministic scoring | Done |
| G3 | Deduplicate by ΑΔΑΜ; never Slack-spam the same ADAM | Done |
| G4 | Slack alerts for high-confidence matches | Done |
| G5 | Operator review UI (opportunities → detail → submitted) | Done |
| G6 | Draft packages + approval snapshot + submission ledger | Done |
| G7 | REQ↔PROC relation / invitation monitoring | Done |
| G8 | Google Drive vault + Docs template merge (desktop) | Done |
| G9 | Hard boundary: no cloud email / offer / authority contact | Done |

### Explicit non-goals (v1)

- Multi-tenant SaaS / self-serve signup / billing
- Hosted public web dashboard for many customers
- Automatic email send or ΕΣΗΔΗΣ / portal submission
- OCR for scanned PDFs
- AI classification as a product feature
- User accounts, RBAC, SSO (except Google OAuth for Drive on desktop)
- Windows / Linux desktop packaging
- Notarized Mac App Store–style distribution

---

## 4. Personas

| Persona | Who | How they use v1 |
|---------|-----|-----------------|
| **Operator** | TEKIA business / bid prep | Desktop app: review Ευκαιρίες, prepare Εκδήλωση Ενδιαφέροντος / offers, record outreach & submissions |
| **Ops / deployer** | Technical owner | Coolify Docker deploy, Slack webhook, `ADMIN_TOKEN`, volume for SQLite |
| **End customer (SaaS)** | — | **Not supported** |

There are **no named user accounts**. Auth is shared static tokens.

---

## 5. Product surfaces

```
┌─────────────────────────────────────────────────────────────┐
│ CLOUD WATCHER (Coolify / Docker)                            │
│  Cron poll → KIMDIS → filters/PDF → SQLite → Slack          │
│  HTTP: /health · /admin/* · /api/operator/*                 │
└──────────────────────────▲──────────────────────────────────┘
                           │ X-Operator-Token / X-Admin-Token
┌──────────────────────────┴──────────────────────────────────┐
│ LOCAL OPERATOR                                              │
│  Electron (macOS arm64) + React dashboard (Greek UI)        │
│  Google Drive / Docs OAuth in Main process only               │
└─────────────────────────────────────────────────────────────┘
```

| Surface | Deploy | Role |
|---------|--------|------|
| Watcher API (`src/`) | Coolify Docker | 24/7 poll + persistence + Operator API |
| Dashboard (`apps/dashboard`) | Local only (Vite) | React UI — **must not** ship to Coolify |
| Desktop (`apps/desktop`) | DMG / `.app` | Primary operator experience wrapping the same UI |

**Security boundary (hardcoded):** `sendingConfigured: false` (API) and `DESKTOP_EXTERNAL_SENDING_ENABLED = false`. Cloud never sends email or submits offers.

---

## 6. Functional requirements (as built)

### 6.1 Tender watching

- Poll every `POLL_INTERVAL_MINUTES` (default 5).
- Query recent **REQ** (primary requests) and **PROC** (notices) via official Open Data API.
- Focus on primary requests (`isInitial`, not approval flags — per README).
- Persist to SQLite; bootstrap empty DB without spam (`BOOTSTRAP_SEND_ALERTS` default false).
- Dedup / alert once per ΑΔΑΜ (`notified_at`).

**KIMDIS endpoints used (read-only, no credentials):**

| Purpose | Path |
|---------|------|
| Search requests | `POST /khmdhs-opendata/request` |
| REQ PDF | `GET /khmdhs-opendata/request/attachment/{ADAM}` |
| Search notices | `POST /khmdhs-opendata/notice` |
| PROC PDF | `GET /khmdhs-opendata/notice/attachment/{ADAM}` |

Public page: `…/home.xhtml?referenceNumber={ADAM}`

### 6.2 Relevance & scoring

1. Hard gate: `isWebRelevant()` — strong web signal required (ιστοσελίδα, web app, portal, CMS, …). Weak terms / broad CPVs alone insufficient.
2. Score: CPV + EL/EN keywords + budget + PDF text.
3. Slack only if web-relevant + category + `score >= ALERT_SCORE_THRESHOLD`.
4. Stored statuses: `RELEVANT` | `NEEDS_REVIEW` | `IRRELEVANT` | `EXPIRED` | `TARGETED`.
5. Classification versioning / re-evaluate admin job (no Slack).
6. PDF extract via `pdf-parse`; no OCR. Unreadable PDFs do not fail the poll.

### 6.3 Slack alerts

- Incoming Webhook only.
- Alert / bootstrap / test / resend (admin, with dry-run & force).
- Optional CTA base: `LOCAL_DASHBOARD_URL` or future deep link `tekia-tender://tender/{ADAM}`.

### 6.4 Operator workflow

**Operational status:** `NEW → REVIEW → READY → SUBMITTED → WON|LOST`  
`SUBMITTED` only via recorded Submission (or “Record Existing Submission”).

**Draft packages per tender:**

| Key | Greek label |
|-----|-------------|
| `outreach` | Εκδήλωση Ενδιαφέροντος |
| `technical` | Τεχνική Προσφορά |
| `economic` | Οικονομική Προσφορά |
| `declarations` | Δηλώσεις |

Draft statuses: `NOT_STARTED | DRAFT | READY | SENT`.

Also supported:

- Contact / submission method: EMAIL, PORTAL, **ΕΣΗΔΗΣ**, PHYSICAL, …
- Document checklist (Company Profile, ΓΕΜΗ, tax/insurance clearance, …)
- Events timeline (detect, outreach, relation confirm/dismiss, …)
- Approve → snapshot (does **not** send)
- Record outreach sent (manual ledger)
- Record formal submission → result PENDING / WON / LOST
- REQ↔PROC relation confirm/dismiss + invitation classification
- Presentation phases: 1 Πρωτογενές Αίτημα → 2 Επίσημη Πρόσκληση → 3 Υποβολή → 4 Αποτέλεσμα

### 6.5 Dashboard UI (Greek)

| Route | Purpose |
|-------|---------|
| `/opportunities` | **Ευκαιρίες** — filters/counters (νέες, παρακολουθούμενες, επίσημες, κλειστές, REQ/PROC, …) |
| `/tenders/:referenceNumber` | Detail: phase, drafts, Drive generate, approve, record outreach/submission, relation, timeline |
| `/submitted` | **Υποβληθέντα** + sent outreach |
| `/settings` | **Ρυθμίσεις / Έγγραφα** — company, watcher config (safe), Desktop Connection, Drive Vault |

### 6.6 Google Drive vault (desktop only)

- OAuth PKCE + system browser; tokens in Electron `safeStorage` (never renderer / never Coolify).
- Operator picks root folder (e.g. TEKIA / Tenders); app discovers Company Documents, Templates, Submissions.
- Create tender workspace; copy masters; Docs `ReplaceAllText` on **copies only**.
- Unresolved `{{...}}` keep DRAFT / block Mark READY.
- Company Profile sync: Templates master → filled Company Documents copy.
- Scopes: `drive.readonly` + `drive.file` (+ openid/email/profile).

### 6.7 Desktop app

- Product name: **TEKIA Tender Watcher** (`gr.tekia.tenderwatcher`)
- macOS **arm64** DMG only; unsigned / not notarized (Gatekeeper “Open Anyway”)
- Token stored via `safeStorage`; API calls Main → HTTPS
- Deep link: `tekia-tender://tender/{referenceNumber}`
- Closing desktop does **not** stop cloud polling

---

## 7. Domain model (summary)

| Entity | Role |
|--------|------|
| **Tender** | ΑΔΑΜ, REQ/PROC, budgets, CPVs, score, relevance, PDF, status, contacts, drafts, checklist, approval, relation/invitation |
| **Submission** | Method, amounts, PENDING/WON/LOST |
| **TenderEvent** | Typed audit trail |
| **OutreachLedger** | Durable early-outreach SENT/DRAFT |
| **OperatorSettings** | Company profile, Drive folder URLs, vault doc metadata |
| **DraftPackage / ApprovalSnapshot** | Offer prep artifacts |
| **MonitoringState** | Derived after outreach SENT + linked PROCs |

Persistence: **one SQLite file** (`DATABASE_PATH`; prod `/data/tenders.db`). No Postgres / Redis / job queue.

---

## 8. API surface (v1)

| Auth | Routes |
|------|--------|
| None | `GET /health` |
| `X-Admin-Token` | `POST /admin/run`, `/admin/test-slack`, `/admin/reevaluate`, `/admin/resend` |
| Operator (or Admin) token | `/api/operator/opportunities`, tenders CRUD-ish, status, events, approve, submission, outreach/send, relation confirm/dismiss, submissions, settings, config |

CORS: allow-list `LOCAL_DASHBOARD_ORIGINS` only (no wildcards).

---

## 9. Non-functional / ops

| Area | Today |
|------|--------|
| Stack | Node 22, Hono, better-sqlite3, node-cron, Zod, pdf-parse, Vitest; React 19 + Vite; Electron 36 |
| Deploy | Dockerfile → Coolify; volume `/data`; port 3000; health `/health` |
| Config | Env: poll window, budgets, score threshold, Slack, tokens, KIMDIS base URL |
| Tests | Vitest: relevance, scorer, operator API, vault, template merge, relations, monitoring, desktop security, … |
| License / positioning | Private / internal TEKIA use |
| Observability | Logs + `/health` stats; no product analytics / metering |

---

## 10. Known limitations (v1)

1. Single-tenant: one DB, one Slack webhook, one settings blob, TEKIA-branded defaults.
2. Shared tokens — no users, sessions, MFA, RBAC.
3. Dashboard not multi-customer hostable; local / desktop only.
4. Filters/CPVs/keywords largely code + env, not per-customer UI packs.
5. Scanned PDFs often unreadable (no OCR).
6. Drive vault assumes one company folder hierarchy on one Google account.
7. Desktop: macOS arm64 only; not notarized.
8. No queues — in-process cron only.
9. No billing, signup, orgs, usage limits, or customer isolation.

---

## 11. SaaS readiness — gap map (for next PRD)

These are **not** v1 requirements. They define the redesign gap from “internal tool” → “subscription product”.

| Capability | v1 | Needed for SaaS (directional) |
|------------|----|-------------------------------|
| Tenancy | Single SQLite DB | Orgs / workspaces + data isolation |
| Auth | Shared tokens | Self-serve accounts, invites, roles |
| Hosting | Coolify watcher + local UI | Hosted web app (+ optional desktop) |
| Data store | SQLite file | Managed multi-tenant DB + migrations |
| Alerts | One Slack webhook | Per-tenant channels / email digests |
| Filters | TEKIA web-SME bias in code | Configurable profiles / vertical packs |
| Documents | Desktop Google Drive | Cloud vault or BYO storage with consent |
| Billing | None | Subscription plans, metering, invoices |
| Compliance | Internal | Tenant privacy, audit, GDPR posture |
| Onboarding | Manual Coolify + DMG | Self-serve signup → first alert |
| Sending | Explicitly disabled | Still likely human-gated; product decision TBD |

**Reusable know-how to preserve:** KIMDIS integration, web-relevance gate, scoring, REQ↔PROC monitoring, draft/submission ledger model, template-merge concepts, Greek operator UX language.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| **ΚΗΜΔΗΣ / KIMDIS** | Greek Central Electronic Public Procurement Registry (Open Data) |
| **ΑΔΑΜ / ADAM** | Unique tender reference number |
| **REQ** | Πρωτογενές Αίτημα (primary request) |
| **PROC** | Πρόσκληση / notice |
| **ΕΣΗΔΗΣ** | National e-procurement system (submission channel label) |
| **Εκδήλωση Ενδιαφέροντος** | Early interest / outreach draft |
| **Watcher** | Cloud poll + alert service |
| **Operator API** | Authenticated API for the dashboard/desktop |
| **Vault** | Google Drive folder tree for company docs + templates + submissions |

---

## 13. Open questions (for SaaS PRD next)

1. Who is the paying customer — web agencies, general contractors, legal/bid offices, or vertical packs?
2. Keep desktop + Drive, move vault to cloud, or both?
3. Per-tenant filter packs vs shared “web SME” intelligence with overlays?
4. Alert channels: Slack only, email, in-app, WhatsApp?
5. Is auto-send ever in scope, or forever human-recorded?
6. Greek-only market vs EU eForms later?
7. Pricing unit: seats, tenders watched, alerts, document packs?

---

## Document control

| Version | Notes |
|---------|--------|
| 1.0 | Current-state baseline from repo as of 2026-10-04 |

**Next document:** `PRD-saas-v1.md` — target SaaS product (personas, MVP scope, tenancy, billing, migration from this baseline).
