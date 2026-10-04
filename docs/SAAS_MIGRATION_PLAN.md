# SaaS Build Plan — Parallel Product (not “retire Electron”)

**Baseline:** [`PRD-current-state.md`](./PRD-current-state.md)  
**Architecture:** [`SAAS_ARCHITECTURE.md`](./SAAS_ARCHITECTURE.md)  
**North star:** [`SAAS_PRODUCT_NORTH_STAR.md`](./SAAS_PRODUCT_NORTH_STAR.md)  

**Principle:** Preserve the internal TEKIA operator tool permanently. Build a commercial SaaS in parallel using shared domain knowledge where safe.

**SaaS differentiator:**  
`DISCOVER → FOLLOW → MONITOR → PREPARE → SUBMIT → MONITOR RESULT`  
(not merely `SEARCH → EMAIL`)

At every phase:

1. Internal Electron + SQLite + Slack path stays runnable  
2. Existing internal tests stay green  
3. Typecheck + build pass  
4. Schema/env changes documented  
5. Prefer additive SaaS modules over destructive replacement  

---

## Phase overview

| Phase | Name | Primary outcome | Status |
|-------|------|-----------------|--------|
| 0 | Repository audit | Architecture + plan | **Done** |
| 1 | SaaS Postgres foundation | Prisma schema + local Postgres; SQLite untouched | **Foundation landed** |
| 1b | Product clarification | Dual-product + monitoring north star | **Done** |
| 2 | SaaS identity & tenancy | Better Auth + orgs + isolation tests | Pending |
| 3 | Canonical tenders + org matches + **Follow** | Tender / OrganizationTender / WatchProfile / following | Pending |
| 4 | **Active monitoring + related acts** | Core differentiator services + events | Pending |
| 5 | Hosted SaaS web UI | Tailwind/shadcn shell + pipeline UX | Pending |
| 6 | Brevo email + in-app notification state | AlertDestination EMAIL + NotificationDelivery | Pending |
| 7 | App-managed document vault | SaaS documents (Drive stays internal) | Pending |
| 8 | Stripe subscription | Entitlements | Pending |

> Phase numbers intentionally reordered vs earlier draft: **monitoring is now before deep UI polish**, because it is the product core.

---

## Area scorecard

| Area | Verdict | Notes |
|------|---------|-------|
| Electron / desktop | **KEEP permanently** | Internal TEKIA tool |
| SQLite + `repository.ts` | **KEEP permanently** for internal | Do not “replace after soak” |
| Slack (`src/slack/*`) | **KEEP** for internal | SaaS does **not** need Slack |
| Google Drive vault | **KEEP** for internal | SaaS uses app-managed storage |
| Operator token API | **KEEP** for internal | |
| KIMDIS / PDF / scorer / web-relevance | **KEEP** (share carefully) | |
| Relations + confirm/dismiss | **KEEP** ideas; **REFACTOR** into SaaS monitoring safely | |
| `outreach-monitoring.ts` | **KEEP** internal SENT semantics; **extend SaaS** for FOLLOW + post-SUBMIT | |
| SaaS DB | **NEW** Prisma/Postgres | |
| SaaS auth | **NEW** Better Auth | |
| SaaS notifications | **NEW** Brevo email | |
| SaaS UI | **NEW** hosted shadcn app | Prefer `apps/saas-web` to avoid breaking Electron UI |
| Next.js / Redis / Kafka / K8s | **DEFER** | |
| Auto authority email / ΕΣΗΔΗΣ submit | **FORBIDDEN** | Brevo → customer only |

---

## PHASE 0 — Audit

Done. Key correction after product clarification:

Earlier docs over-emphasized “cut over SQLite / secondary Electron”.  
**Correct model:** two permanent products; SaaS is additive.

---

## PHASE 1 — SaaS PostgreSQL foundation

### Goal

Postgres/Prisma available for SaaS without touching the live SQLite watcher.

### Status

Landed: `docker-compose.yml`, `prisma/schema.prisma`, migration `saas_foundation`, `src/db/prisma.ts`, scripts.  
Internal `pnpm dev` still uses SQLite.

### Follow-up in Phase 1/3 schema iterations

Add/adjust models for:

- `following` / monitoring fields on `OrganizationTender`  
- `RelatedActLink`  
- `NotificationDelivery`  
- event types including `RELATED_ACT_DISCOVERED` / `FOLLOWED`

---

## PHASE 2 — SaaS identity & tenancy

| # | Task | Verdict |
|---|------|---------|
| 2.1 | Better Auth + org plugin on SaaS routes | NEW |
| 2.2 | `requireSession` / `requireOrgMembership` | NEW |
| 2.3 | Cross-tenant isolation tests | NEW (critical) |
| 2.4 | Do **not** remove operator token routes | KEEP internal |

Exit: signup/login/org membership works; Org A cannot read Org B.

---

## PHASE 3 — Canonical data + Follow

| # | Task | Verdict |
|---|------|---------|
| 3.1 | Prisma repos for Tender + OrganizationTender | NEW (SaaS) |
| 3.2 | WatchProfile + default seed from TEKIA filters | NEW |
| 3.3 | **Follow / Unfollow** API + state (`Παρακολούθηση`) | NEW (core) |
| 3.4 | Pipeline listing: Νέα / Παρακολουθούμενα | NEW |
| 3.5 | Keep outreach ≠ submission distinct | KEEP domain rule |
| 3.6 | Optional TEKIA import script (does not delete SQLite) | NEW |

Exit: user can follow a REQ; it appears under Παρακολουθούμενα; canonical ADAM unique.

---

## PHASE 4 — Active monitoring (core differentiator)

| # | Task | Verdict |
|---|------|---------|
| 4.1 | `monitor-followed-threads` job scoped to FOLLOWING / OUTREACH / PREPARING / SUBMITTED | NEW |
| 4.2 | Prefer official KIMDIS relations; fallback confidence LIKELY/POSSIBLE | REUSE `src/relations/*` carefully |
| 4.3 | `RELATED_ACT_DISCOVERED` domain events + RelatedActLink | NEW |
| 4.4 | Confirm / dismiss uncertain relations | REUSE concept from internal |
| 4.5 | Continue monitoring after SUBMITTED for AWRD/SYMV-like acts | NEW |
| 4.6 | Never auto WON/LOST unsafely | KEEP product rule |
| 4.7 | Tests: follow→related PROC event; submit→award event; stop monitoring | NEW |

Exit: followed REQ with later related PROC produces in-app related-act state without claiming WON.

---

## PHASE 5 — Hosted SaaS web UI

| # | Task | Verdict |
|---|------|---------|
| 5.1 | Prefer new `apps/saas-web` (Tailwind + shadcn) | NEW |
| 5.2 | Shell + attention overview («Χρειάζονται προσοχή») | NEW |
| 5.3 | Tender detail: Follow CTA, outreach status line, related-act banner, thread timeline | NEW |
| 5.4 | Distinguish official vs organization events visually | NEW |
| 5.5 | Do not redesign Electron operator UI | KEEP |

Exit: north-star story steps 5–11 visible in UI (even if email comes in Phase 6).

---

## PHASE 6 — Brevo + notification state

| # | Task | Verdict |
|---|------|---------|
| 6.1 | Brevo transactional client | NEW |
| 6.2 | `NotificationDelivery` persistence (system of record) | NEW |
| 6.3 | Templates for related PROC / related update / award-for-submission | NEW |
| 6.4 | Org alert destinations (EMAIL / IN_APP) | NEW |
| 6.5 | Internal Slack untouched | KEEP |

Exit: missing/deleted email still leaves in-app related update.

---

## PHASE 7 — SaaS document vault

| # | Task | Verdict |
|---|------|---------|
| 7.1 | Application-managed storage for SaaS tender workspace | NEW |
| 7.2 | Electron Google Drive workflow unchanged | KEEP |

---

## PHASE 8 — Stripe

| # | Task | Verdict |
|---|------|---------|
| 8.1 | Checkout + portal + webhooks + entitlements | NEW |
| 8.2 | Do not block Phases 2–6 | |

---

## Internal tool safety checklist (every PR)

- [ ] Does this change `database.ts` / SQLite `repository.ts` / Slack / Electron Drive?  
- [ ] If yes: is it necessary for internal, or should it be `src/saas/*` instead?  
- [ ] Do internal Vitest suites still pass?  
- [ ] Can the owner still run Electron + SQLite watcher + Slack as today?

---

## Environment variables

| Variable | Product |
|----------|---------|
| `DATABASE_PATH`, `OPERATOR_API_TOKEN`, `ADMIN_TOKEN`, `SLACK_WEBHOOK_URL` | **Internal** (keep) |
| `DATABASE_URL` | **SaaS** |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | **SaaS** |
| `BREVO_API_KEY`, `BREVO_SENDER_*` | **SaaS** |
| `STRIPE_*` | **SaaS** (later) |

---

## Testing strategy

| Suite | Action |
|-------|--------|
| Existing internal tests | Always green |
| New SaaS isolation tests | Phase 2 |
| Follow + related-act + post-submit monitoring | Phase 4 |
| Brevo delivery idempotency / NotificationDelivery | Phase 6 |
| Entitlements / Stripe webhook | Phase 8 |

Commands:

```bash
pnpm typecheck
pnpm test
pnpm build
```

---

## Immediate next actions

1. Extend Prisma schema for `following`, monitoring fields, `RelatedActLink`, `NotificationDelivery`  
2. Scaffold `src/saas/` without wiring into internal `src/index.ts` yet  
3. Phase 2 Better Auth spike on SaaS entrypoint  
4. Keep local internal app running for daily TEKIA use  

---

## Document control

| Version | Notes |
|---------|-------|
| 0.1 | Initial migrate-oriented plan |
| 0.2 | Rewritten as parallel-product plan; monitoring elevated; Brevo; internal permanence |
