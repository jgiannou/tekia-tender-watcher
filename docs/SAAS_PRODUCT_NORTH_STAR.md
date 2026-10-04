# SaaS Product North Star — Continuous Monitoring Lifecycle

**Status:** Product clarification (overrides earlier “migrate & retire Electron” framing)  
**Date:** 2026-10-04  
**Related:** [`PRD-current-state.md`](./PRD-current-state.md) · [`SAAS_ARCHITECTURE.md`](./SAAS_ARCHITECTURE.md) · [`SAAS_MIGRATION_PLAN.md`](./SAAS_MIGRATION_PLAN.md)

---

## 1. Core product differentiator

The SaaS is **not** merely “discover tenders + send email”.

**Core promise:**

> Once you tell the platform that a procurement opportunity matters to you, the platform keeps watching KIMDIS for related developments and alerts you when something new appears.

**Product loop:**

```
DISCOVER → FOLLOW → MONITOR → PREPARE → SUBMIT → MONITOR RESULT
```

Not:

```
SEARCH → EMAIL
```

Monitoring does **not** stop after Follow, Outreach, or Submission.  
It continues until the procurement thread is effectively completed **or** the user explicitly stops monitoring.

---

## 2. Two parallel products (non-negotiable)

### A. Internal TEKIA Operator Tool — permanent

Exists today and **remains operational permanently**:

| Surface | Stack |
|---------|--------|
| Desktop | `apps/desktop` Electron |
| UI | `apps/dashboard` (operator workflow) |
| Persistence | SQLite (`better-sqlite3`, `DATABASE_PATH`) |
| Alerts | Slack (`src/slack/*`) |
| Documents | Google Drive vault (Electron main) |
| Watcher | Existing Coolify/SQLite path |

**Do NOT:**

- remove Electron  
- remove Slack from the internal product  
- force the internal app onto the SaaS architecture  
- break the SQLite watcher  
- delete the Google Drive workflow  
- redesign the internal tool unless explicitly requested  
- treat it as temporary legacy that must disappear  

The owner actively uses it today.

### B. Commercial SaaS Platform — new parallel product

| Concern | SaaS choice |
|---------|-------------|
| UI | Hosted React 19 + Vite + Tailwind + shadcn/ui |
| API | Hono (can share domain modules; own routes/persistence) |
| DB | PostgreSQL + Prisma |
| Auth | Better Auth (orgs/members) |
| Notifications | **Brevo transactional email** (not Slack) |
| Documents | Application-managed document storage / vault |
| Billing | Stripe later |

### Conceptual relationship

```
INTERNAL PRODUCT (permanent)
Electron + SQLite + Slack + Drive
        │
        │ remains operational
        │ shared domain knowledge / pure modules where safe
        ▼
COMMERCIAL SaaS (new)
Web + Postgres + Brevo + App Vault
```

They may share reusable domain modules.  
They do **not** need to share every infrastructure choice.

---

## 3. Internal tool safety rule

Before changing any module used by Electron / SQLite / Slack:

1. Ask: can this break the internal tool?  
2. If yes → prefer **new abstraction / adapter / SaaS repository / new implementation**.  
3. Do **not** destructively replace working internal paths.

Existing personal TEKIA workflow must keep working throughout SaaS development.

**Practical implication for this repo:**

| Internal path | SaaS path |
|---------------|-----------|
| `src/db/database.ts` + `repository.ts` (SQLite) | New Prisma repositories under SaaS modules |
| `src/slack/*` | New `src/saas/notifications/brevo*` (or similar) |
| `apps/desktop` Drive | New app-managed vault for SaaS |
| Shared pure domain | `src/filters/*`, `src/relations/*`, `src/operator/*` helpers — share only when changes stay non-breaking |

---

## 4. Business states (must not collapse)

Distinct journey states:

```
DISCOVERED
  → INTERESTED / FOLLOWING   («Παρακολούθηση» / «Με ενδιαφέρει»)
  → OUTREACH_SENT            (Εκδήλωση Ενδιαφέροντος — early interest)
  → OFFICIAL_NOTICE_FOUND    (related PROC etc.)
  → PREPARING_SUBMISSION
  → SUBMITTED                (formal offer recorded)
  → WON / LOST               (user-confirmed where needed)
```

### Following ≠ Outreach ≠ Submission

| Concept | Greek UX (preferred) | Meaning |
|---------|----------------------|---------|
| **Following** | Παρακολούθηση / Με ενδιαφέρει / Παρακολουθούμενα | User cares; platform monitors related acts |
| **Outreach** | Εκδήλωση Ενδιαφέροντος | Early interest contact recorded — **not** a formal offer |
| **Submission** | Υποβολή | Formal offer submitted externally and recorded |

Recording outreach must **never** auto-set formal `SUBMITTED`.  
Following must **not** imply outreach or submission.

### Pipeline sections (conceptual)

| Section | Greek | Contents |
|---------|-------|----------|
| New | Νέα | Auto-discovered opportunities |
| Following | Παρακολουθούμενα | Explicitly followed |
| Outreach | Εκδήλωση Ενδιαφέροντος | Early interest recorded |
| Preparing | Προετοιμασία | Formal prep in progress |
| Submitted | Υποβληθέντα | Formal submissions |
| Completed | Ολοκληρωμένα | WON / LOST / CLOSED / DISMISSED |

Navigation may differ; **states must remain distinct**.

---

## 5. Active monitoring rules

Monitor related KIMDIS publications for `OrganizationTender` records that are at least:

- `FOLLOWING`
- `OUTREACH_SENT`
- `PREPARING`
- `SUBMITTED`

Do **not** run expensive relation monitoring for every irrelevant search hit.

### Monitoring continues after submission

```
PROC → record SUBMITTED → keep watching → AWRD/SYMV → notify → user confirms WON/LOST
```

Do **not** auto-infer WON/LOST unless official data reliably identifies the organization.  
Otherwise show “Δημοσιεύτηκε απόφαση ανάθεσης” and require review.

### What triggers monitoring (reasons)

- `USER_FOLLOWING`
- `OUTREACH_SENT`
- `SUBMISSION_RECORDED`

Stop only when thread completed or user chooses **Διακοπή παρακολούθησης**.

---

## 6. Related publication detection

**Preferred:** official KIMDIS relation/reference data.

**Fallback:** existing domain intelligence (authority, CPV, title, ADAM in PDF, budget, dates, etc.) with confidence:

| Confidence | UX |
|------------|-----|
| `CONFIRMED` | Treat as related |
| `LIKELY` / `POSSIBLE` | «Πιθανή σχετική δημοσίευση» + [Επιβεβαίωση] / [Δεν σχετίζεται] |

Preserve confirm/dismiss semantics already present in the internal tool (`confirmProcRelation` / `dismissProcRelation` in `src/db/repository.ts`, relations in `src/relations/*`).

### Three distinct concepts (implemented)

| Concept | Scope | Role |
|---------|-------|------|
| `RelatedActLink` | Canonical Tender↔Tender | Procurement relation (once globally) |
| `OrganizationAttentionEvent` | Per organization | System of record for “needs attention” |
| `NotificationDelivery` | Transport only | Brevo/email attempt later — **not** source of truth |

Pipeline:

```
RelatedActLink (canonical)
  → OrganizationAttentionEvent (per affected org, idempotent dedupeKey)
  → (later) notification policy → NotificationDelivery → Brevo
```

Email is **not** the system of record. In-app state must remain if email is missed/deleted.

---

## 7. Notifications (SaaS = Brevo email)

SaaS does **not** need Slack.

Example subjects:

- «Νέα πρόσκληση για διαγωνισμό που παρακολουθείτε»
- «Νέα εξέλιξη σε αίτημα που παρακολουθείτε»
- «Νέα απόφαση ανάθεσης για υποβολή σας» (without claiming WON)

Internal product keeps Slack unchanged.

---

## 8. Tender detail UX requirements (SaaS)

### Not following yet

Primary action: **[ Παρακολούθηση ]**

### Following

Show **Παρακολουθείται** and (only if implemented):

- Καταγραφή Εκδήλωσης Ενδιαφέροντος  
- Προετοιμασία φακέλου  
- Σημειώσεις  
- Ανάθεση σε μέλος  
- Διακοπή παρακολούθησης  

### After outreach

Clear status: **Έχει σταλεί Εκδήλωση Ενδιαφέροντος** (+ date/method/notes)  
and the value line:

> «Παρακολουθούμε το ΚΗΜΔΗΣ για σχετική πρόσκληση.»

### Related act found

Prominent **Νέα εξέλιξη** + link to related PROC/AWRD.

### Procurement thread

Mix official KIMDIS events and organization events on one timeline, with **distinct visual treatment** so org actions never look like government publications.

---

## 9. Overview / attention center

Overview answers: **What needs my attention?**

- New opportunities  
- New related publications  
- Upcoming deadlines  
- Followed requests waiting for PROC  
- Submitted tenders with new developments  
- Expiring company documents  

Lightweight «Χρειάζονται προσοχή» can be derived from domain events — not a second notification product.

---

## 10. North star user story (acceptance narrative)

1. Create company + define activities  
2. Define what opportunities to care about (WatchProfile / saved rules)  
3. Search KIMDIS and/or let monitoring rules run  
4. Receive relevant opportunities  
5. Open one → **Με ενδιαφέρει / Παρακολούθηση**  
6. Item enters monitored pipeline (**Παρακολουθούμενα**)  
7. Optionally send Expression of Interest externally  
8. Record outreach in-app  
9. Platform keeps checking KIMDIS for related acts  
10. Related PROC → email + in-app update  
11. Prepare tender workspace/documents  
12. Submit externally  
13. Record formal submission  
14. Continue monitoring awards/contracts/related acts  
15. Notify again on new developments  
16. Confirm WON / LOST when appropriate  

---

## 11. Mapping to existing internal code (reuse ideas, don’t break)

| SaaS need | Existing internal seed |
|-----------|------------------------|
| REQ↔PROC relation | `src/relations/*`, `apply-proc-relation.ts` |
| Confirm/dismiss | `repository.confirmProcRelation` / `dismissProcRelation` |
| Monitoring after outreach | `src/operator/outreach-monitoring.ts` (`watchForRelatedProc` today implies SENT) |
| Outreach ≠ submission | Already enforced in domain comments/types |
| Timeline events | `TenderEvent` / `TENDER_EVENT_TYPES` |
| Filters for monitored/formal/closed | `OpportunityFilter` in `repository.ts` |

**SaaS gap vs today:** internal monitoring largely starts at **outreach SENT**. SaaS must also start monitoring on explicit **FOLLOW** and continue after **SUBMITTED** through award-like acts.

Share pure detection helpers when safe; extend SaaS-specific monitoring services rather than forcing Electron onto the new model.

---

## Document control

| Version | Notes |
|---------|-------|
| 1.0 | Dual-product + continuous monitoring differentiator |
