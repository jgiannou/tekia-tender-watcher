# QA Report — Full SaaS Features (re-run)

**Date:** 2026-10-05 (evening re-QA)  
**Environment:** Local `http://127.0.0.1:5174` + API `:3000`  
**Account:** `johnn.giannousis@gmail.com` · org **TEKIA Local QA** · Pro/active  
**Compared to:** `docs/SAAS_PRODUCT_NORTH_STAR.md` · prior `docs/qa-full-features-2026-10-05.md`

---

## Verdict

**PASS — ship-ready for local Pro journey.**  
Full-features assert **39/39 PASS**, journey assert **27/27 PASS**, vitest notify+workflow **21/21 PASS** (`NODE_ENV=test`). No FAIL / MISSING.

New product pieces covered in this run:
- Outreach draft **without** prior Follow
- Record outreach → **auto-follow + monitoring**
- Company profile DOCX generate (vault folder 08)
- UI: outreach CTA before follow, «Ιστορικό αιτήματος/διαγωνισμού», prominent budget

---

## 1. Assert totals

| Suite | Command | Result |
|-------|---------|--------|
| Full features | `pnpm exec tsx scripts/qa-assert-full-features.ts` | **39 PASS · 0 PARTIAL · 0 FAIL** |
| Journey | `pnpm exec tsx scripts/qa-assert-journey.ts` | **27 PASS · 0 PARTIAL · 0 FAIL** |
| Vitest | `NODE_ENV=test pnpm exec vitest run tests/notify-email.test.ts tests/saas-workflow.test.ts tests/saas-scan-variants.test.ts` | **21 PASS** |
| Repair helper | `pnpm exec tsx scripts/qa-repair-local-state.ts` | used to seed PREPARING workspace + SUBMITTED+monitor + DISMISSED related-act |

---

## 2. Full-features matrix

| Area | Checks | Result |
|------|--------|--------|
| Auth | emailVerified | PASS |
| Settings | company TEKIA ΙΚΕ · activities=2 · onboarding COMPLETED · notifications | PASS |
| Billing | pro/active | PASS |
| Team | members=1 invites=1 | PASS |
| Discover | saved-search COMPLETED · 87 matches · opportunities ~97 | PASS |
| Scoring | max=86 (honest) · targeted reason · live score | PASS |
| Follow / Unfollow | following; unfollow clears following+monitoring | PASS |
| Monitor | monitoringActive · SUBMITTED+monitoring=1 | PASS |
| Outreach | sent≥1 · OUTREACH ≠ submission | PASS |
| Outreach draft no-follow | getDraft leaves `following=false` | PASS |
| Outreach record auto-follow | record → following+monitoring+SENT | PASS |
| Documents | 10 folders · 7 docs · expiry statuses | PASS |
| Company profile | generate DOCX COMPANY_PROFILE | PASS |
| Prepare | workspace docs≥2 | PASS |
| Submit / Result | WON/LOST data · confirm LOST API | PASS |
| Related acts | CONFIRMED + DISMISSED · confirm API | PASS |
| Workflow | OUTREACH_SENT / PREPARING / SUBMITTED / WON / LOST labels | PASS |
| Notifications | attention events · Brevo SENT | PASS |

---

## 3. Journey matrix

All 27 checks PASS, including:
- preparing + workspace-docs
- monitor-after-submit (SUBMITTED+monitoring)
- workflow-SUBMITTED / OUTREACH_SENT / PREPARING / WON
- outreach-neq-submission (no leak into formal submission)

---

## 4. HTTP matrix (cookie + `X-Organization-Id`)

| Route | Status |
|-------|--------|
| `/health` | 200 |
| `/api/saas/me` | 200 |
| `/api/saas/settings` | 200 |
| `/api/saas/billing/catalog` | 200 |
| `/api/saas/entitlements` | 200 |
| `/api/saas/organizations/members` | 200 |
| `/api/saas/opportunities` | 200 |
| `/api/saas/watch-profiles` | 200 |
| `/api/saas/monitoring/state` | 200 |
| `/api/saas/submissions` | 200 |
| `/api/saas/vault/folders` | 200 |
| `/api/saas/vault/documents` | 200 |
| `/api/saas/attention` | 200 |
| `/api/saas/kimdis/records/REQ/26REQ019856981` | 200 |
| `/api/saas/tenders/:id/workflow` | 200 |
| `/api/saas/tenders/:id/outreach-draft` | 200 |
| `POST /api/saas/vault/company-profile/generate` | 200 |

---

## 5. Browser sweep (`:5174`)

| Route | Result | Notes |
|-------|--------|-------|
| `/app` Overview | PASS | Session TEKIA Local QA |
| `/app/opportunities` | PASS | Match list loads |
| `/app/monitoring` | PASS | Active pipeline |
| `/app/tenders/REQ/26REQ019783955` (not followed) | PASS | Primary CTA **Προετοιμασία Εκδήλωσης Ενδιαφέροντος** + outline **Παρακολούθηση**; amount **3.000 € χωρίς ΦΠΑ** large; **Ιστορικό αιτήματος** under next action |
| `/app/tenders/REQ/26REQ019856981` (Paranestio) | PASS | Related acts · prepare path · history wording |
| `/app/submissions` | PASS | WON/LOST/PENDING rows |
| `/app/documents` | PASS | **Δημιουργία εταιρικού προφίλ** |
| `/app/saved-searches` | PASS | Web / ιστοσελίδα |
| `/app/subscription` | PASS | Catalog |
| `/app/settings/notifications` | PASS | Email prefs / digest copy |

---

## 6. North Star §10 acceptance

| # | Promise | Result |
|---|---------|--------|
| 1–6 | Company, watch rules, opportunities, follow, monitor | PASS |
| 7 | Send EOI externally | N/A (by design) |
| 8 | Record outreach | PASS (+ auto-follow) |
| 9–10 | Related acts discover / in-app | PASS (CONFIRMED + DISMISSED) |
| 11 | Prepare workspace | PASS |
| 12 | Submit externally | N/A |
| 13–14 | Record submission · monitor after submit | PASS |
| 15 | Notify developments | PASS (attention + SENT emails) |
| 16 | Confirm WON/LOST | PASS |

---

## 7. Known / non-blocking

- Assert scripts are **mutating** (unfollow round-trip, outreach record on unused REQs, LOST confirm, company-profile version bump). Local QA org expected to accumulate history.
- Vitest mail hooks require `NODE_ENV=test` (fails if `.env` overrides to something else without re-export).
- SPA `history.pushState` alone is unreliable for React Router smoke; prefer real navigations (used for critical tender/detail screenshots).

---

## 8. How to re-run

```bash
pnpm exec tsx scripts/qa-repair-local-state.ts
pnpm exec tsx scripts/qa-assert-full-features.ts
pnpm exec tsx scripts/qa-assert-journey.ts
NODE_ENV=test pnpm exec vitest run tests/notify-email.test.ts tests/saas-workflow.test.ts tests/saas-scan-variants.test.ts
```
