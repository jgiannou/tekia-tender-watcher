# SaaS Architecture — TEKIA Tender Watcher

**Document type:** Target architecture grounded in the current repository  
**Baseline:** [`PRD-current-state.md`](./PRD-current-state.md) + codebase as of 2026-10-04  
**Product north star:** [`SAAS_PRODUCT_NORTH_STAR.md`](./SAAS_PRODUCT_NORTH_STAR.md)  
**Status:** Phase 0 audit → Phase 1 foundation (updated for dual-product + continuous monitoring)  
**SaaS runtime target:** Node 22, Hono, React 19 + Vite, PostgreSQL + Prisma, Better Auth, Brevo email, Stripe later

> This document is **not** theoretical. Every KEEP / REFACTOR / REPLACE / DEFER label maps to concrete modules in this monorepo.

---

## 0. Dual-product model (non-negotiable)

This is **not** “migrate Electron to SaaS and retire the internal tool.”

```
A. INTERNAL TEKIA OPERATOR TOOL (permanent)
   Electron + SQLite + Slack + Google Drive
   apps/desktop · apps/dashboard (operator) · src/* SQLite path
        │ remains operational for owner/TEKIA workflow
        │ share pure domain modules only when safe
        ▼
B. COMMERCIAL SaaS PLATFORM (new parallel product)
   Hosted Web + Postgres/Prisma + Better Auth + Brevo + app vault
```

| Concern | Internal tool | SaaS |
|---------|---------------|------|
| Primary UI | Electron + local dashboard | Hosted Vite web |
| DB | SQLite forever | PostgreSQL + Prisma |
| Alerts | Slack | Brevo email (+ in-app state) |
| Documents | Google Drive vault | Application-managed storage |
| Auth | Shared operator/admin tokens | Better Auth sessions/orgs |
| Core loop | Existing operator workflow | DISCOVER→FOLLOW→MONITOR→PREPARE→SUBMIT→MONITOR RESULT |

**Safety rule:** if a change to a shared module can break Electron/SQLite/Slack, prefer a new SaaS adapter/repository instead of destructive replacement.

**SaaS differentiator:** continuous monitoring of followed / outreach / submitted procurement threads for related KIMDIS acts — not search+email alone. Details in the north-star doc.

---

## 1. Current system (as built) — Internal product

```
┌─────────────────────────────────────────────────────────────┐
│ CLOUD WATCHER  src/index.ts                                 │
│  node-cron → jobs/poll-kimdis.ts                            │
│  KIMDIS → filters → pdf → better-sqlite3 → Slack            │
│  HTTP: /health · /admin/* · /api/operator/*                 │
└──────────────────────────▲──────────────────────────────────┘
                           │ X-Operator-Token / X-Admin-Token
┌──────────────────────────┴──────────────────────────────────┐
│ LOCAL OPERATOR                                              │
│  apps/desktop (Electron) + apps/dashboard (React/Vite)      │
│  Google Drive OAuth in Electron main only                   │
└─────────────────────────────────────────────────────────────┘
```

| Layer | Path | Notes |
|-------|------|-------|
| Entrypoint | `src/index.ts` | Loads `.env`, opens SQLite, wires cron + Hono |
| Config | `src/config.ts` | Zod env schema; single-tenant budgets/thresholds/tokens |
| DB open/migrate | `src/db/database.ts` | `better-sqlite3` + imperative `ALTER TABLE` migrations |
| Repository | `src/db/repository.ts` (~1480 LOC) | All persistence + much workflow logic |
| KIMDIS | `src/kimdis/client.ts`, `types.ts` | Official Open Data client |
| Relevance | `src/filters/web-relevance.ts` | Hard gate |
| Scoring | `src/filters/scorer.ts` | Deterministic score after hard gate |
| Keywords/CPVs | `src/filters/keywords.ts`, `cpvs.ts` | TEKIA web/software bias in code |
| Poll job | `src/jobs/poll-kimdis.ts` | Ingest + classify + alert |
| Operator API | `src/routes/operator.ts` | Shared-token auth + CORS allow-list |
| Admin API | `src/routes/admin.ts` | `X-Admin-Token` ops |
| Domain types | `src/operator/types.ts` | Statuses, drafts, settings, checklist |
| Monitoring | `src/operator/outreach-monitoring.ts` | Today: REQ watch largely after outreach SENT — SaaS must also FOLLOW + post-SUBMIT |
| Relations | `src/relations/*` | REQ↔PROC + invitation identity; confirm/dismiss |
| Slack | `src/slack/*` | Internal-only; SaaS uses Brevo instead |
| Security boundary | `src/security/no-external-send.ts` | `CLOUD_EXTERNAL_SENDING_ENABLED = false` |
| Dashboard | `apps/dashboard` | React 19 + Vite, custom CSS (no component library) |
| Desktop | `apps/desktop` | Electron 36, Drive vault, secure token store |
| Deploy | `Dockerfile` | Node 22, volume `/data`, SQLite only |

---

## 2. Target system (SaaS) — parallel to internal

```
┌──────────────┐     ┌──────────────────────────────────────────┐
│ Hosted Web   │     │ SaaS API / watcher (own deployable)      │
│ (new shell)  │────▶│  Better Auth sessions                    │
│ Tailwind+shadcn│    │  Org-scoped APIs                         │
└──────────────┘     │  Global KIMDIS ingestion                 │
                     │  WatchProfile match                      │
                     │  Active-thread related-act monitoring    │
                     │  Domain events → Brevo email             │
                     │  Stripe webhooks (later)                 │
                     └───────────────┬──────────────────────────┘
                                     │
                     ┌───────────────▼──────────────────────────┐
                     │ PostgreSQL (Prisma)                      │
                     │  Canonical Tender  ≠  OrganizationTender │
                     │  Following + MonitoringState             │
                     │  NotificationDelivery (system of record) │
                     └──────────────────────────────────────────┘

INTERNAL (unchanged path): Electron → Operator API token → SQLite watcher → Slack
```

**SaaS deployables (Coolify/Docker):** `saas-web` · `saas-api` · `postgres`  
**Internal deployable:** existing watcher Docker + SQLite volume — keep running.  
No Kubernetes, no Redis/Kafka for v1.

Domain modules that are safe to share (pure, no SQLite/Slack coupling):  
`src/filters/*`, `src/kimdis/*`, `src/pdf/*`, `src/relations/*`, `src/operator/outreach-monitoring.ts` (extend carefully), approval/decision-trace helpers.

---

## 3. Decision matrix (repository-grounded)

### 3.1 KEEP (reuse with little or no rewrite)

| Area | Concrete modules | Why |
|------|------------------|-----|
| KIMDIS client | `src/kimdis/client.ts`, `types.ts` | Working read-only Open Data integration |
| PDF extract | `src/pdf/extract-text.ts`, `greek-text.ts`, `classify.ts` | `pdf-parse`, no OCR — still correct for SaaS |
| Web relevance gate | `src/filters/web-relevance.ts` | Product core; inject config later |
| Scorer algorithm | `src/filters/scorer.ts` | Keep math; inject thresholds/keywords |
| CPV helpers | `src/filters/cpvs.ts` | Keep classification helpers |
| Keyword lists (as default profile seed) | `src/filters/keywords.ts` | Become default WatchProfile data |
| Slack message formatting | `src/slack/format-message.ts` | Reuse payload builders per destination |
| Slack eligibility | `src/filters/slack-eligibility.ts` | Threshold checks become profile-driven |
| Classification meta | `src/filters/classification-meta.ts` | Version / fingerprint / re-eval |
| REQ↔PROC matching | `src/relations/*` | Domain logic is tenant-agnostic on canonical data |
| Outreach monitoring | `src/operator/outreach-monitoring.ts` | Keep derivation rules |
| Approval snapshot | `src/operator/approval.ts` | Keep pure functions |
| Decision trace | `src/operator/decision-trace.js` path `decision-trace.ts` | UI explainability |
| Domain enums/types | `src/operator/types.ts` | Statuses, draft keys, Greek workflow meaning |
| No auto-send boundary | `src/security/no-external-send.ts`, `apps/desktop/electron/no-auto-send.ts` | Non-negotiable product boundary |
| Tender phase UI helpers | `apps/dashboard/src/lib/tender-phase.ts`, `TenderPhaseCard.tsx` | Preserve 4-phase semantics |
| Greek labels | `apps/dashboard/src/lib/ui-labels.ts` | Operator language |
| Template merge pure logic | `apps/desktop/electron/google/template-merge.ts` (+ tests) | Domain merge rules survive Drive host change |
| Existing Vitest suites | `tests/*.test.ts` | Especially scorer, web-relevance, relations, monitoring, operator-api |
| Electron app package | `apps/desktop/**` | Keep as secondary surface during migration |
| Hono + Zod + node-cron | current stack | Sufficient for MVP SaaS |
| Docker/Coolify posture | `Dockerfile` | Evolve, do not replace with K8s |

### 3.2 REFACTOR (adapt for tenancy / Postgres / config injection)

| Area | Concrete modules | Change |
|------|------------------|--------|
| Pure monitoring helpers | `src/operator/outreach-monitoring.ts` | Extend concepts for FOLLOW + post-SUBMIT without breaking SENT-based internal behavior |
| Pure relation helpers | `src/relations/*` | Prefer official refs; keep confidence + confirm/dismiss |
| Config (SaaS) | new `src/saas/config.ts` (prefer) | Org/watch-profile/Brevo; leave `src/config.ts` for internal |
| Poll for SaaS | new ingest/match/monitor jobs under `src/saas/jobs/` | Do not rewrite internal `poll-kimdis.ts` in place if unsafe |
| SaaS routes | new `src/saas/routes/*` | Session + org context; do not gut internal operator token routes |
| Dashboard for SaaS | new shell or package path preferred | Tailwind/shadcn SaaS UI; keep current operator CSS path for Electron |
| Attention / overview | new SaaS pages | “Χρειάζονται προσοχή” derived from domain events |

> Prefer **additive** SaaS modules over in-place replacement of `repository.ts` / `poll-kimdis.ts` / Slack.

### 3.3 REPLACE — **SaaS product only** (internal keeps its stack)

| Area | SaaS choice | Internal tool |
|------|-------------|---------------|
| Database | PostgreSQL + Prisma | **KEEP** SQLite |
| Customer auth | Better Auth | **KEEP** operator/admin tokens |
| Settings | OrganizationSettings + WatchProfile | **KEEP** `operator_settings` |
| Notifications | Brevo email + in-app NotificationDelivery | **KEEP** Slack webhook |
| Documents | Application-managed vault | **KEEP** Google Drive |
| Hosted UI design system | Tailwind + shadcn | **KEEP** current operator CSS/UX unless asked |

### 3.4 DEFER

| Area | Why defer |
|------|-----------|
| Stripe multi-plan catalog | One plan + trial later |
| Vertical WatchProfile packs UI | Model now; packs later |
| Redis / job queue | In-process cron until scale pressure |
| Microservices | Avoid |
| Next.js / Redux | Not needed |
| WhatsApp / SMS | Out of scope |
| Complex RBAC | OWNER / ADMIN / MEMBER only |
| Auto email-to-authority / ΕΣΗΔΗΣ submit | Forbidden |
| Internal Electron redesign | Only if explicitly requested |
| Hosted Google Drive OAuth | SaaS uses app vault; Drive stays internal |
| OCR / AI classification | Out of scope |
| Retiring Electron / SQLite / Slack | **Never a goal** |

---

## 4. SQLite coupling — **internal keeps it**; SaaS avoids it

SQLite coupling in `database.ts` / `repository.ts` is fine for the **internal product permanently**.

For **SaaS**, build new Prisma repositories instead of forcing a destructive SQLite→Postgres cutover of the internal watcher.

| Coupling | Location | SaaS approach |
|----------|----------|---------------|
| Native module | `better-sqlite3` | **KEEP** for internal; SaaS uses `@prisma/client` |
| File path | `DATABASE_PATH` | **KEEP** for internal; SaaS uses `DATABASE_URL` |
| Sync SQL API | `repository.ts` | **KEEP** for internal; new async SaaS repos |
| Imperative migrations | `database.ts` | **KEEP** for internal; Prisma Migrate for SaaS |
| Operator API tests | temp SQLite | **KEEP**; add separate SaaS/Postgres tests |

**Safe to share:** filters, kimdis, pdf, relations, operator pure helpers (when non-breaking).

---

## 5. Single-tenant assumptions → SaaS fixes (internal unchanged)

| Assumption | Location | SaaS fix | Internal |
|------------|----------|----------|----------|
| One tender row = product state | SQLite `tenders` | Canonical + OrganizationTender + **following/monitoring** | KEEP as-is |
| One Slack webhook | `SLACK_WEBHOOK_URL` | Brevo + NotificationDelivery | KEEP Slack |
| Global thresholds | env budgets/score | WatchProfile | KEEP env |
| Shared operator token | `OPERATOR_API_TOKEN` | Better Auth | KEEP tokens |
| Dashboard Vite token | `VITE_OPERATOR_API_TOKEN` | Session cookies for SaaS web | KEEP for Electron bridge |
| Monitoring starts at outreach SENT | `outreach-monitoring.ts` | Also FOLLOW + post-SUBMIT | KEEP current semantics unless safely extended |
| `organization` column | authority name | `contractingAuthority` | unchanged meaning |

---

## 6. Electron coupling — permanent internal surface

| Concern | Location | Stance |
|---------|----------|--------|
| Drive OAuth / vault | `apps/desktop/electron/google/*` | **KEEP forever** for internal |
| IPC / deep link / secure token | Electron main | **KEEP** |
| Packaging / DMG | desktop scripts | **KEEP** |
| SaaS documents | — | Application-managed vault (separate workstream) |

Do **not** redesign Electron unless explicitly requested.

---

## 7. Configuration ownership

| Config | Internal | SaaS |
|--------|----------|------|
| Budgets / score / keywords / CPVs | env + code | WatchProfile |
| Slack webhook | env | N/A (Brevo instead) |
| Brevo API key / sender | N/A | env + org alert destinations |
| Company profile | `operator_settings` | OrganizationSettings |
| Drive URLs | settings + Electron | N/A (app vault) |
| Poll interval / KIMDIS URL | env | SaaS global env (separate process OK) |
| Auth | tokens | Better Auth + Stripe secrets later |

---

## 8. Target Prisma schema (proposed)

Exact Prisma file: `prisma/schema.prisma` (introduced in Phase 1 foundation).

### 8.1 Identity & tenancy

```
User                 — Better Auth compatible fields
Session / Account / Verification — Better Auth tables
Organization         — workspace / billing customer
OrganizationMember   — userId, organizationId, role: OWNER|ADMIN|MEMBER
Invitation           — email, org, role, token, expires
```

> Better Auth organization plugin can own User/Session/Member/Invitation tables; app-owned tables hang off `Organization.id`.

### 8.2 Billing

```
Subscription
  organizationId @unique
  stripeCustomerId
  stripeSubscriptionId?
  status: TRIALING|ACTIVE|PAST_DUE|CANCELED|INCOMPLETE
  planKey                 — internal plan, not price ID in business logic
  stripePriceId?
  trialEndsAt?
  currentPeriodEnd?
  cancelAtPeriodEnd
```

Entitlement helper: `canUseFeature(org, feature)` reads `Subscription` + plan config map — **never** scatter Stripe price IDs in domain code.

### 8.3 Watch configuration

```
WatchProfile
  organizationId
  name
  enabled
  presetKey?              — e.g. WEB_DIGITAL_AGENCY (optional)
  keywords Json           — string[]
  negativeKeywords Json
  cpvs Json
  minBudget Float?
  maxBudget Float?
  scoreThreshold Int
  alertScoreThreshold Int
  categories Json?
  notificationThreshold Int?
  customFilters Json?
```

**Default seed:** TEKIA current web/software configuration from `keywords.ts`, `cpvs.ts`, `config.ts` defaults.

### 8.4 Canonical procurement data

```
Tender                          — ONE row per ADAM (global)
  id
  referenceNumber @unique       — ΑΔΑΜ
  recordType                    — REQ|PROC
  title
  contractingAuthority          — was tenders.organization
  submissionDate
  signedDate
  finalSubmissionDate
  budgetWithoutVat
  budgetWithVat
  cpvs Json
  stage?
  targetedSupplier
  nonInvitedOffersRejected
  pdfTextStatus
  pdfText?                      — extracted text (optional large field / side table later)
  officialPdfUrl
  publicKimdisUrl
  rawJson Json?
  sourceFingerprint?
  classificationVersion?
  firstSeenAt
  lastSeenAt
  parentTenderId?               — REQ↔PROC graph on canonical side where public
  … relation candidate fields that are public/link facts may live here or on match
```

**Rule:** Do **not** duplicate full KIMDIS tender rows per customer.

### 8.5 Organization-specific product state

```
OrganizationTender              — “what this tender means for this customer”
  organizationId
  tenderId
  watchProfileId?

  # Discovery match fields
  relevanceStatus / score / scoreReasons / webRelevant / matchedKeywords / matchedCpvs …

  # Explicit interest (SaaS differentiator entry point)
  following Boolean             — user clicked Παρακολούθηση / Με ενδιαφέρει
  followedAt DateTime?
  followedByUserId?

  # Active monitoring (first-class; may also be derived)
  monitoringActive Boolean
  monitoringReason?             — USER_FOLLOWING | OUTREACH_SENT | SUBMISSION_RECORDED
  monitoringStartedAt?
  monitoringStoppedAt?          — explicit Διακοπή παρακολούθησης
  lastRelatedCheckAt?
  latestRelatedActAt?
  lastMonitoringNotificationAt?

  operationalStatus             — NEW|REVIEW|READY|SUBMITTED|WON|LOST (formal workflow)
  # NOTE: FOLLOWING is not the same as operationalStatus=SUBMITTED
  pipelineStage?                — optional denormalized: FOLLOWING|OUTREACH|PREPARING|SUBMITTED|COMPLETED

  notifiedAt?                   — discovery alert dedupe (distinct from related-act alerts)
  assignedMemberId?
  notes?
  contact* / submission prep fields
  documentChecklist / drafts / approval*
  relation* operator decisions (confirm/dismiss)
  createdAt / updatedAt

  @@unique([organizationId, tenderId])
```

### 8.6 Workflow ledgers (org-scoped)

```
Submission          — formal offer record (≠ outreach)
TenderEvent         — org-scoped audit (FOLLOWED, OUTREACH_SENT, RELATED_ACT_DISCOVERED, …)
OutreachLedger      — early interest only
RelatedActLink      — source↔related tender, confidence, detectionMethod, confirmed/dismissed
NotificationDelivery — in-app + Brevo delivery state (system of record for “what happened”)
DraftPackage / ApprovalSnapshot — JSON OK for v1
```

`RELATED_ACT_DISCOVERED` is a domain event first; Brevo is a downstream channel.

### 8.7 Settings & alerts (SaaS)

```
OrganizationSettings  — company profile + app-vault document metadata
AlertDestination
  organizationId
  channel: EMAIL | IN_APP     — SaaS; Brevo for EMAIL
  enabled
  config Json                 — e.g. { toEmails } / Brevo list ids later
```

Internal Slack remains on the SQLite watcher env (`SLACK_WEBHOOK_URL`) and is **not** required for SaaS.

### 8.8 Global ingestion ops

```
IngestionMeta / PollRun
  lastPollAt, success, error, bootstrapDone, counters
```

Not tenant-owned.

### 8.9 Field mapping from current SQLite `tenders`

| SQLite column | Canonical Tender | OrganizationTender |
|---------------|------------------|--------------------|
| `reference_number` | ✓ | via tenderId |
| `record_type`, title, dates, budgets, cpvs, urls, pdf_*, raw_json | ✓ | |
| `organization` (authority) | `contractingAuthority` | |
| `score`, `score_reasons`, `web_*`, `relevance_*` | optional cache | ✓ source of truth for product |
| `notified_at` | | ✓ per org |
| `current_status`, contacts, drafts, checklist, approval | | ✓ |
| `parent_tender_id` / relation / invitation | public link facts → Tender; operator confirm/dismiss → OrganizationTender | split carefully in Phase 3 |
| outreach_ledger | | org-scoped OutreachLedger |

---

## 9. Target folder / module structure

Monorepo, **additive SaaS modules** — do not deprecate SQLite paths.

```
prisma/                         — SaaS DB only
src/
  index.ts                      — KEEP internal composition root
  config.ts                     — KEEP internal env
  db/database.ts                — KEEP SQLite
  db/repository.ts              — KEEP internal persistence
  db/prisma.ts                  — SaaS client
  kimdis/ filters/ pdf/ relations/ operator/  — shared pure domain (careful edits)
  slack/                        — KEEP internal
  jobs/poll-kimdis.ts           — KEEP internal watcher
  routes/operator.ts admin.ts health.ts — KEEP internal API

  saas/                         — NEW parallel product code
    config.ts
    auth/                       — Better Auth
    repositories/               — Prisma
    jobs/
      ingest-canonical.ts
      match-watch-profiles.ts
      monitor-followed-threads.ts   — CORE differentiator
      notify-brevo.ts
    monitoring/
      related-acts.ts
      confidence.ts
    notifications/
      evaluate.ts
      delivery.ts
      brevo.ts
    billing/                    — Stripe later
    routes/                     — /api/saas/* or /api/app/*
    vault/                      — application-managed documents

apps/
  dashboard/                    — KEEP for Electron/internal; evolve carefully
  desktop/                      — KEEP permanent internal
  saas-web/                     — NEW hosted SaaS UI (preferred) OR clear /app SaaS mode

docs/
  SAAS_PRODUCT_NORTH_STAR.md
  SAAS_ARCHITECTURE.md
  SAAS_MIGRATION_PLAN.md
```

**SaaS layering:**

```
HTTP Route → Auth/Org context → Application service → Domain function → Prisma repository
Related-act domain event → notification evaluation → NotificationDelivery → Brevo
```

---

## 10. Auth decision: Better Auth

**Verdict: ADOPT Better Auth** for customer-facing auth.

| Criterion | Assessment |
|-----------|------------|
| Hono support | First-class handler mount (`/api/auth/*`) |
| Prisma + PostgreSQL | Official adapter |
| Organizations / roles | Organization plugin → OWNER/ADMIN/MEMBER |
| Sessions | Server-side sessions (cookie) — matches requirement |
| Fit with Vite SPA | Credentials CORS + cookie sessions documented |
| Node 22 | Compatible; no need to upgrade Node for auth |

**Keep separate:** `ADMIN_TOKEN` (or future internal admin) for Coolify ops (`/admin/run`, reevaluate, etc.).

**Do not** trust `organizationId` from the client. Active org comes from session (active organization / membership check in `org-context.ts`).

---

## 11. Watcher architecture (logical separation)

```
KIMDIS Open Data
    → ingest-canonical (global, one cron)
    → Tender upsert by ADAM
    → match-watch-profiles → OrganizationTender (discovery)
    → monitor-followed-threads (FOLLOWING | OUTREACH_SENT | PREPARING | SUBMITTED)
         prefer official relations; fallback fuzzy with confidence
    → RELATED_ACT_DISCOVERED domain events
    → notification evaluation → NotificationDelivery → Brevo
```

- **One** global ingest cron, not one per org.  
- Monitoring work is scoped to **actively followed/pipeline** items, not every search hit.  
- Matching/monitoring isolated so a worker can wrap them later.  
- Internal Coolify SQLite poll job remains a separate running path.

---

## 12. API evolution

| Surface | Path |
|---------|------|
| Internal | KEEP `/api/operator/*` + tokens; KEEP `/admin/*` |
| SaaS | NEW session routes: auth, follow/unfollow, outreach, submission, monitored pipeline, related acts, settings, Brevo-backed alerts |
| SaaS later | billing, watch-profiles UI, team |

SaaS frontend routes (when built):

```
/login /signup
/app                    — attention / overview
/app/opportunities      — Νέα
/app/following          — Παρακολουθούμενα
/app/tenders/:referenceNumber
/app/submitted
/app/settings
```

---

## 13. Frontend architecture

| Surface | Approach |
|---------|----------|
| Internal operator UI (Electron) | **KEEP** current UX/CSS unless explicitly redesigned |
| SaaS hosted UI | Tailwind + shadcn; pipeline states distinct |
| Auth | Better Auth cookies (SaaS only) |
| Greek terminology | Παρακολούθηση, Εκδήλωση Ενδιαφέροντος, Υποβολή, Νέα εξέλιξη |

**Do not** introduce Next.js.  
**Do not** force Electron onto the SaaS shell.

---

## 14. Observability

- stdout structured logs with `requestId`, `organizationId`, `userId`, `tenderId`, `adam`, `watchProfileId` when present  
- Persist product/audit via `TenderEvent`, not every HTTP request  
- Never log auth tokens, OAuth tokens, Stripe secrets  
- Health endpoint must not spam poll logs

---

## 15. Human approval boundary (unchanged)

Preserve forever:

- No automatic email/contact **to procurement authorities**  
- No automatic ΕΣΗΔΗΣ / portal submission  
- No automatic economic offer sending  
- Outreach + formal submission remain **human-recorded**

Allowed for SaaS: transactional email **to the customer** via Brevo (related-act alerts, etc.).

Enforced today for authority contact by `CLOUD_EXTERNAL_SENDING_ENABLED = false` and desktop `DESKTOP_EXTERNAL_SENDING_ENABLED`.

---

## 16. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Breaking internal Electron/SQLite/Slack | Additive `src/saas/*`; never “cut over” internal away |
| Collapsing FOLLOW / OUTREACH / SUBMIT | Explicit schema + UX + tests |
| Stopping monitoring after outreach/submit | `monitor-followed-threads` continues until stop/complete |
| Auto WON/LOST from AWRD | Require review unless identity is reliable |
| Email as only record | `NotificationDelivery` + in-app attention center |
| Per-tenant KIMDIS duplication | Canonical ADAM uniqueness tests |
| Cross-tenant leaks | Membership-scoped queries + isolation tests |

---

## Document control

| Version | Notes |
|---------|-------|
| 0.1 | Phase 0 audit + target schema/structure |
| 0.2 | Dual-product permanence + continuous monitoring differentiator + Brevo |
