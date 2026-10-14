# PRD — ARC Tenders (as-built)

**Product:** ARC Tenders  
**Document type:** Current-state Product Requirements Document  
**Status:** As-built commercial SaaS (code + catalog)  
**Date:** 2026-10-14  
**Public URL:** https://arc-tenders.tekia.gr  
**Surfaces:** `apps/saas-web`, `apps/mobile`, `apps/ops-desk`, `src/saas`  

**Related docs:** [subscription-plans.md](./subscription-plans.md) · [PRD-saas-features.md](./PRD-saas-features.md) · [ops-setup.md](./ops-setup.md) · [release-checklist-status.md](./release-checklist-status.md)  

**Out of this PRD:** the internal TEKIA Electron / SQLite / Slack / Google Drive operator tool ([PRD-current-state.md](./PRD-current-state.md)) — still exists separately.

---

## 1. One-liner

**EN:** Multi-tenant SaaS for Greek public procurement. One shared KIMDIS ingest finds new acts within minutes; organizations save searches, follow tender threads, organize company documents, and record outreach/submissions — without the product emailing authorities or submitting to ΕΣΗΔΗΣ.

**EL:** Εμπορικό SaaS για δημόσιους διαγωνισμούς. Κοινός έλεγχος ΚΗΜΔΗΣ φέρνει νέες πράξεις σε λίγα λεπτά· οι οργανισμοί αποθηκεύουν αναζητήσεις, παρακολουθούν νήματα, οργανώνουν έγγραφα και καταγράφουν ενδιαφέρον/υποβολή — χωρίς αυτόματη αποστολή προς φορείς ή υποβολή στο ΕΣΗΔΗΣ.

---

## 2. Problem

Finding and tracking Greek public tenders is noisy and slow for SMEs and bid teams:

- ΚΗΜΔΗΣ volume is high; relevant signals hide in titles, CPVs, regions, and PDF bodies.
- Competitors often promise slow email digests; customers need **fast in-app / push** awareness.
- Teams need a structured thread from πρωτογενές αίτημα → πρόσκληση → προθεσμία → κατακύρωση.
- Document prep and “did we send / submit?” must stay under human control.

ARC Tenders solves this with self-serve orgs, plan entitlements, shared discovery, and a human-gated workflow.

---

## 3. Goals & non-goals

### Goals (shipped)

| ID | Goal | Status |
|----|------|--------|
| G1 | Public Free signup (no card) + paid Basic / Pro | Done (code) |
| G2 | Shared KIMDIS ingest (~2 min) → in-app / push within ~5 min target | Done |
| G3 | Saved searches with region (NUTS 2), CPV, keywords, scoring | Done |
| G4 | Followed-tender thread monitoring on the same ingest cycle | Done |
| G5 | Plan-gated email (weekly Free / digest hours Basic–Pro) via outbox | Done (ops verification partial) |
| G6 | Company vault, outreach ledger, submission recording (Basic+) | Done |
| G7 | Participation checklist from PDF + vault compare (Basic+) | Done |
| G8 | Expiring contracts list / Free count-only | Done |
| G9 | Thin price memory on followed tenders (Basic+) | Done |
| G10 | Stripe checkout + portal + seats (Pro) | Done |
| G11 | Web + Expo mobile + Electron ops desk | Done |
| G12 | Durable jobs outbox + ops pipeline metrics | Done |
| G13 | Plan-gated Slack + Google Calendar / Drive / Sheets (Basic+) | Done (ops flags) |
| G14 | Pro-only priority monitoring, deadline radar, advanced filters | Done |

### Explicit non-goals

- Automatic email to contracting authorities
- ΕΣΗΔΗΣ (or any portal) submission
- AI chat over PDFs / bid–no-bid scores
- OCR for scanned PDFs
- Crawls of authority websites or micro-procurement platforms
- Full market-analytics / competitor ranking product
- Replacing the internal TEKIA desktop watcher

---

## 4. Personas

| Persona | Who | How they use the product |
|---------|-----|---------------------------|
| **Bidder / SME owner** | Small web / services firm | Free or Basic: search, follow, alerts |
| **Bid coordinator** | Prepares packages | Basic/Pro: vault, checklist, outreach & submission ledger |
| **Team lead** | Multi-seat office | Pro: seats, more searches/follows, denser email |
| **TEKIA operator** | Internal | Ops Desk: health, pipeline, grants, impersonate |

---

## 5. Product surfaces

```
Internet → arc-tenders.tekia.gr (saas-web nginx)
              ├─ /api/*  → saas-api (Hono + Prisma + Postgres)
              └─ static SPA

Cron (API process): shared ingest · notification waves · outbox processor

Clients: Web SPA · Expo mobile (arctenders://) · Ops Desk Electron (X-Admin-Token)
```

| Surface | Path | Role |
|---------|------|------|
| Marketing / auth | `/`, `/pricing`, login, signup, legal | Acquisition + accounts |
| App (web) | `/app/*` | Primary product UI (Greek) |
| Mobile | `apps/mobile` | Parity tabs: opportunities, search, monitoring, docs, settings |
| API | `/api/auth/*`, `/api/saas/*`, `/admin/ops/*` | Auth, product, ops |
| Ops Desk | `apps/ops-desk` | Internal admin console (Mac DMG) |

---

## 6. Plans & feature differentiation

Source of truth: `src/saas/plans/catalog.ts` · short table: [subscription-plans.md](./subscription-plans.md).

Public plans are **Free**, **Basic**, and **Pro**. There is no Business or Enterprise plan. Pro extra seats are a recurring add-on, not a fourth plan. **No AI on any plan.**

**Trial** is a 7-day **Pro-level** preview via explicit «Δοκιμάστε το Pro». It does **not** replace Free. New orgs start on **Free**. On expiry, email falls back to the Free weekly policy and pending daily/immediate product emails are cancelled.

Prices exclude VAT. Above 20 Pro seats: `Χρειάζεστε περισσότερους από 20 χρήστες; Επικοινωνήστε μαζί μας.` (`contact@tekia.gr`).

### 6.1 Price, seats, quotas

| | **Free** | **Basic** | **Pro** |
|--|--|--|--|
| Positioning | Find opportunities that match the business | Monitor tenders and organize participation | Do not miss a critical development |
| Price | €0 · no card · no expiry | €4.99 / mo · €49 / yr | €9.99 / mo · €99 / yr |
| Seats | 1 | 1 | 3 included · +€2.49 / seat / mo (€24.90 / yr) · self-service cap 20 |
| Active saved searches | 1 | 5 | 15 |
| Active followed tenders | 5 | 30 | 100 |
| Company storage | — | 250 MB | 2 GB |
| Manual saved-search refreshes / day | 5 | 10 | 20 |

Discovery speed is **not** a plan difference. Every plan uses the same shared KIMDIS ingest (~2 minutes). `maxDigestHoursPerDay` caps **email** hour slots; it is not scan latency. Free weekly cadence uses 0 digest hours.

### 6.2 Same on every plan

These capabilities are on Free, Basic, Pro, and the Pro trial:

| Capability | Notes |
|------------|--------|
| Shared KIMDIS ingest | ~2 min, all tenants |
| Manual KIMDIS search | Keywords, CPV, region. Unverified users may search; saved-search scans stay gated |
| Match score + reasons | |
| NUTS 2 region filter | Empty = all Greece |
| Tender thread | REQ → notice → deadline → award |
| Related-act monitoring | On the shared ingest cycle |
| In-app attention | Immediate; not delayed by email cadence |
| Push (Expo) | Immediate, when the device is registered |
| In-app deadline reminders | On the tender thread. **Email** deadline radar is Pro-only (see below) |

### 6.3 Differentiated by plan

Legend: **—** not included · **✓** included · **count** count-only.

| Capability | **Free** | **Basic** | **Pro** |
|------------|--|--|--|
| **Email cadence** | ≤1 weekly summary when there is new content, one recipient per org | Digest at up to **2** Athens hours/day | Digest at up to **6** Athens hours/day |
| Immediate email: developments on followed tenders | — | Optional | Optional |
| Immediate email: new high-match opportunities (score ≥ 70) | — | — | Optional |
| Deadline radar emails | — | — | ✓ (sent on the digest schedule) |
| **Priority monitoring** (Hot Watch) | — | — | ✓ |
| **Advanced saved-search filters** | — | — | ✓ |
| Priority support | — | — | ✓ (catalog / marketing; not a separate product module) |
| Company vault, versions, tender workspace | — | ✓ | ✓ |
| Outreach ledger (record sent; no send) | — | ✓ | ✓ |
| Submission ledger (human-gated) | — | ✓ | ✓ |
| Participation checklist vs vault | — | ✓ | ✓ |
| Expiring contracts (3–9 months) | count only | list + follow | list + follow |
| Award history | — | ✓ | ✓ |
| Price memory | — | ✓ | ✓ |
| Slack (1 channel / org) | — | ✓ | ✓ |
| Google Calendar deadline sync | — | ✓ | ✓ |
| Google Drive import + tender folder | — | ✓ | ✓ |
| Google Sheets watched-tenders list | — | ✓ | ✓ |

**Pro includes every Basic capability**, then adds seats, higher quotas, denser email, priority monitoring, high-match immediate email, deadline radar, advanced filters, and priority support. Marketing copy: «Όλες οι δυνατότητες του Basic, με:».

### 6.4 What the Pro-only rows mean

| Row | Product behavior |
|-----|------------------|
| **Priority monitoring** | User (or outreach) marks a followed tender as priority. A shared Hot Watch worker re-checks **related acts** on a ~2 min cycle, deduped by tender. It does **not** speed up the shared KIMDIS ingest and does **not** scrape public UI on that hot path. |
| **Advanced filters** | Saved search may set contracting authority, contract type, procedure type, min/max budget, and an `IMMEDIATE` notification override. Basic/Free requests for these fields are rejected (`advanced_watch_filters_requires_pro`). Keywords, CPV, and region stay on every plan. |
| **High-match immediate email** | New-opportunity email leaves the digest only when the plan allows it, the org chose immediate delivery, and match score ≥ 70. |
| **Deadline radar** | Approaching-deadline **email** is Pro-only and rides the digest-hour path. In-app deadline reminders exist on every plan. |

### 6.5 Integrations are plan-gated and ops-flagged

Slack, Calendar, Drive, and Sheets are **entitled on Basic, Pro, and the Pro trial**, and **off on Free** (Connections shows a description and a link to plans). They stay dark until the matching server flag and OAuth secrets are set. Marketing lists hide a line until that integration is live.

| Integration | Flag | Scope |
|-------------|------|--------|
| Slack | `SAAS_SLACK_NOTIFICATIONS_ENABLED` | 1 incoming-webhook channel / org |
| Google Calendar | `SAAS_GOOGLE_CALENDAR_ENABLED` | Secondary ARC calendar; followed deadlines only |
| Google Drive | `SAAS_GOOGLE_DRIVE_ENABLED` | Copy into the vault + create a tender folder. Not a live sync |
| Google Sheets | `SAAS_GOOGLE_SHEETS_ENABLED` | Managed «Διαγωνισμοί ARC» sheet |

Drive import also requires the company vault, so Free cannot reach it even if a flag were on.

---

## 7. Functional requirements (as built)

### 7.1 Auth, orgs, onboarding

- Better Auth: email/password, verification, password reset.
- Organizations (max 3 owned), active org header, invites, roles OWNER / ADMIN / MEMBER.
- Company profile + optional **ΓΕΜΗ (GEMI)** OpenData lookup.
- Legal acceptance, account deletion, cookie consent + analytics hooks.
- Unverified users may use manual KIMDIS search; saved-search scans stay gated.

### 7.2 Discovery — shared KIMDIS ingest

- One worker ingests new/updated KIMDIS acts every **~2 minutes** (Europe/Athens).
- Matches **all enabled watch profiles** across tenants; upserts opportunities.
- Checks followed threads on the same cycle (related acts, deadlines).
- Manual KIMDIS search remains available on every plan; refresh is not the discovery path.
- Ingest status exposed (`τελευταίος επιτυχής έλεγχος…` when stale).
- Acceptance target: **≤5 minutes** Open Data → in-app/push under normal load.

### 7.3 Watch profiles (saved searches)

- Keywords, CPVs, custom filters, enable/pause.
- Multi-select Greek **NUTS 2** regions; empty = all Greece.
- If regions selected, acts with no NUTS field are excluded (with “without region” UX affordance).
- Match score + reasons; KAD → suggested CPVs/keywords.
- **Pro only:** advanced filters — authority, contract type, procedure type, min/max budget, immediate notification override. Keywords, CPV, and region are on every plan.

### 7.4 Opportunities & monitoring thread

One tender screen / monitoring pipeline:

1. Πρωτογενές αίτημα  
2. Πρόσκληση  
3. Προθεσμία υποβολής  
4. Κατακύρωση  

- Early REQ is an opportunity when published (no wait for PROC).
- **Νέα εξέλιξη** for related KIMDIS acts; org actions distinct from publications.
- Follow / unfollow / stop monitoring; related-act confirm/dismiss.
- Monitoring continues after recorded submission until award or stop.

### 7.5 Participation checklist (Basic / Pro)

From notice PDF text (deterministic, not AI):

- deadline, guarantee, award criterion, lots, required documents  
- compared to company vault — named gaps: φορολογική / ασφαλιστική ενημερότητα, ΓΕΜΗ  
- unread PDF → «Δεν διαβάστηκε το PDF» + official file link  

### 7.6 Expiring contracts

- Window: contracts ending in **3–9 months**.
- Filter: KAD-suggested CPVs + org regions.
- Free: count only. Basic/Pro: list + **Παρακολούθηση** (counts toward follow limit).
- No competitor ranking or win-rate census.

### 7.7 Price memory (Basic / Pro)

Panel on followed tender: recent same-CPV + same-region awards, optional award/budget ratio when both exist. Thin samples labeled «λίγες κατακυρώσεις».

### 7.8 Company vault & workflow (Basic / Pro)

- Folders, upload, versions, download, expiry metadata (filesystem storage via `SAAS_STORAGE_DIR`).
- Tender workspace: attach docs to a tender.
- Outreach: draft + **record sent** (no send).
- Submission: record method/result; human-gated ledger only.

### 7.9 Διαύγεια

- On the tender screen: ΑΔΑ next to ΑΔΑΜ when known (from KIMDIS contract fields and/or Diavgeia lookup).
- Optional adapter/search when `DIAVGEIA_ENABLED=true` (default off in `.env.example`).
- No Diavgeia inbox or Diavgeia-only saved-search product surface.

### 7.10 TED (EU) — adapter shipped, not core marketing

- TED Search adapter + follow as `TED:{publicationNumber}` when enabled (`TED_ENABLED`, default on in code / document in `.env.example`).
- Watch profiles may include TED/Diavgeia phases via `dataSources` custom filters.
- **Not** a primary landing promise until a customer pulls EU tenders into scope.

### 7.11 Notifications

| Channel | Behavior |
|---------|----------|
| In-app attention | Immediate; not delayed by email cadence |
| Push (Expo) | Immediate; device registration + prefs |
| Free email | Weekly digest when there is new content (outbox job) |
| Basic/Pro email | Digest at chosen Athens hours; optional immediate flags per plan |
| Pro | Deadline radar emails (digest-hour path) + optional immediate high-match (score ≥ 70) |
| Basic + Pro | Optional immediate email on followed-tender developments |
| Transport | Durable **jobs outbox** + processor (retries); Brevo SMTP when `EMAIL_ENABLED` |

Channel policy: `src/saas/services/email-channel-policy.ts`.

### 7.12 Priority monitoring (Pro / trial)

- Entitlement: `priorityMonitoring`. Free and Basic cannot enable it.
- Marks a non-terminal followed tender as priority (manual or from recorded outreach).
- Hot Watch (~2 min) checks related acts for those tenders only. Shared ingest cadence is unchanged.
- Active promo or unexpired trial is treated as Pro for this entitlement.

### 7.13 Integrations (Basic / Pro / trial)

See §6.5. Free sees the connection cards without connect or send. One Slack channel per organization. One Google account per user + organization. Calendar, Drive, and Sheets are separate connections and separate release flags.

### 7.14 Billing

- Stripe Checkout (Basic/Pro, monthly/annual), Customer Portal, webhooks, Pro extra seats.
- Subscription UI: `/app/subscription`.
- Catalog mirrored in API entitlements.

### 7.15 Ops Desk

Internal Electron app (`apps/ops-desk`):

- Stats, health, **pipeline** (outbox / ingest / email / storage / PDF)
- Logs & HTTP request ring buffer, product events
- Users / orgs drills, grant plan, sandbox, impersonate, password rotate, Slack stats notify

---

## 8. Domain model (summary)

| Entity | Role |
|--------|------|
| **User / Session** | Better Auth |
| **Organization / Membership / Invitation** | Tenancy + seats |
| **Subscription / Entitlements** | Plan + Stripe sync |
| **WatchProfile** | Saved search + regions + filters |
| **Opportunity** | Match from ingest / scan |
| **OrganizationTender** | Follow + pipeline stage + workspace |
| **AttentionEvent** | In-app / push / email triggers |
| **VaultDocument** | Company files + versions |
| **Outreach / Submission** | Human-recorded ledgers |
| **JobOutbox** | Durable async email / digest work |
| **Shared ingest state** | Last success / freshness for KIMDIS |

Persistence: **PostgreSQL** (Prisma). Document bytes: local volume (object storage still a launch hardening item).

---

## 9. Non-functional

| Area | Today |
|------|--------|
| Stack | Node 22, Hono, Prisma, Postgres, Better Auth, Stripe, React/Vite, Expo, Electron ops |
| Deploy | Coolify: `Dockerfile.saas-api` + `apps/saas-web` nginx; migrate on boot |
| Config | See [ops-setup.md](./ops-setup.md) |
| Tests | Vitest: entitlements, ingest/outbox, checklist, adapters, vault, scan-access, … |
| Observability | Ops health + pipeline metrics; product events; in-memory API logs |

---

## 10. Launch posture / open gates

Features above are **implemented in code**. Public confidence still depends on ops gates tracked in [release-checklist-status.md](./release-checklist-status.md) and [production-readiness-plan.md](./production-readiness-plan.md), notably:

1. Staging ≈ prod + fresh signup E2E  
2. Postgres backup + **tested restore**  
3. End-to-end product email (digest / weekly) delivery verification  
4. Adversarial cross-org QA  
5. Hardening vault storage beyond single-node disk  

---

## 11. Glossary

| Term | Meaning |
|------|---------|
| **ΚΗΜΔΗΣ / KIMDIS** | Greek Central Electronic Public Procurement Registry (Open Data) |
| **ΑΔΑΜ** | Tender reference |
| **ΑΔΑ** | Diavgeia decision id |
| **REQ / PROC** | Primary request / notice |
| **Watch profile** | Saved search |
| **Shared ingest** | Single cron that feeds all tenants |
| **Outbox** | Durable job table for emails / digests |
| **Ops Desk** | Internal Electron admin UI |

---

## Document control

| Version | Date | Notes |
|---------|------|--------|
| 1.1 | 2026-10-14 | Plan matrix from `catalog.ts`: quotas, email paths, Hot Watch, advanced filters, Slack, Google Calendar / Drive / Sheets. Trial = Pro entitlements |
| 1.0 | 2026-10-11 | Consolidated as-built PRD after Free plan, shared ingest, outbox/pipeline ops, checklist/price/expiring, TED/Diavgeia adapters, web+mobile+ops |

**Supersedes for product overview:** older “SaaS features only” narrative where it conflicts (e.g. TED now has a code adapter; signup defaults to Free not auto-trial). Feature-level competition notes remain in [PRD-saas-features.md](./PRD-saas-features.md).
