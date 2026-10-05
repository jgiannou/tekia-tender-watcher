# QA Report — Full SaaS Features (re-run)

**Date:** 2026-10-05 (afternoon re-QA)  
**Environment:** Local `http://127.0.0.1:5174` + API `:3000`  
**Account:** `johnn.giannousis@gmail.com` · org **TEKIA Local QA** · Pro/active  
**Compared to:** `docs/SAAS_PRODUCT_NORTH_STAR.md` §4/§6/§8/§10 · prior `docs/qa-full-journey-2026-10-05.md`

**Assert:** `pnpm exec tsx scripts/qa-assert-full-features.ts`  
→ **35 PASS · 1 PARTIAL · 0 FAIL · 0 MISSING**

**HTTP matrix (with `X-Organization-Id`):** all core `/api/saas/*` routes **200** (settings, entitlements, billing, members, opportunities=89, watch-profiles=1, monitoring, submissions=4, vault folders=10/docs=6, attention=8, kimdis record).

---

## Verdict

**Ship-ready for local Pro journey.** North Star DISCOVER→FOLLOW→MONITOR→PREPARE→SUBMIT→RESULT is closed. Previous P0 gaps (WON/LOST, unfollow, related-act confirm/dismiss, honest scoring) are **PASS** in this run. One PARTIAL is expected (OUTREACH_SENT row already advanced).

---

## 1. Assert matrix (API / DB)

| Area | Checks | Result |
|------|--------|--------|
| Auth | emailVerified | PASS |
| Settings | company, activities=2, onboarding COMPLETED, notifications | PASS |
| Billing | pro/active | PASS |
| Team | members=1, invites=1 | PASS |
| Discover | saved-search COMPLETED · 87 matches · opportunities 94 | PASS |
| Scoring | max=86 (not 100); targeted reason present; live adam score 86 | PASS |
| Follow / Unfollow | following; unfollow API clears following+monitoring | PASS |
| Monitor | monitoringActive=3 | PASS |
| Outreach | sent=1; OUTREACH ≠ submission | PASS |
| Vault | 10 folders · 6 docs · statuses NO_EXPIRY/EXPIRED/EXPIRING_SOON/VALID | PASS |
| Prepare | workspace docs=3 | PASS |
| Submit | submissions with snapshots · WON/LOST data | PASS |
| Result | confirm LOST API → stage LOST, monitoring off | PASS |
| Related acts | CONFIRMED + DISMISSED links; confirm API | PASS |
| Workflow | PREPARING / WON / LOST labels; OUTREACH_SENT PARTIAL (advanced) | PASS/PARTIAL |
| Notifications | attention=8 · Brevo SENT=3 | PASS |

---

## 2. North Star §10 acceptance narrative

| # | Promise | Result | Evidence |
|---|---------|--------|----------|
| 1 | Company + activities | **PASS** | Settings company TEKIA ΙΚΕ · 2 ΚΑΔ · COMPLETED |
| 2 | WatchProfile / saved rules | **PASS** | «Web / ιστοσελίδα» · 87 matches |
| 3 | Search KIMDIS / rules | **PASS** | `/app/search` + saved-search scans |
| 4 | Relevant opportunities | **PASS** | Overview 87 νέες · Opportunities ~89–94 |
| 5 | Follow | **PASS** | Monitoring 2 ενεργά · unfollow control on detail |
| 6 | Monitored pipeline | **PASS** | Filters + stages |
| 7 | Send EOI externally | **N/A** | By design |
| 8 | Record outreach | **PASS** | Assert + UI copy «δεν στέλνει» |
| 9 | Related acts on followed | **PASS** | Paranestio REQ→PROC links discovered |
| 10 | Related → in-app | **PASS** | «Νέα εξέλιξη» + Επιβεβαιωμένη badges |
| 11 | Prepare workspace | **PASS** | Sparti PROC · 3 vault docs linked |
| 12 | Submit externally | **N/A** | By design |
| 13 | Record formal submission | **PASS** | Submissions page · 4 rows |
| 14 | Monitor after submit | **PASS** | Until WON/LOST closes monitoring |
| 15 | Notify developments | **PASS** | Attention 8 · email deliveries SENT |
| 16 | Confirm WON / LOST | **PASS** | UI Ανεπιτυχές/Επιτυχία · API LOST |

---

## 3. Browser page sweep

| Route | Result | Notes |
|-------|--------|-------|
| `/login` | PASS | Session OK |
| `/app` Overview | PASS | Καλημέρα John · 87 νέες · 2 παρακολουθούμενα · next actions · expiring docs |
| `/app/opportunities` | PASS | 87 υψηλή συνάφεια · match reasons · follow/hide |
| `/app/monitoring` | PASS | 2/2 ενεργά · stage filters |
| `/app/tenders/REQ/26REQ019856981` | PASS | Related «Νέα εξέλιξη» · Επιβεβαιωμένη · unfollow · start prepare |
| `/app/tenders/PROC/26PROC019704619` (Sparti) | PASS | Προετοιμασία · workspace 3 docs · καταγραφή υποβολής · unfollow · deadline 7/9/2026 |
| `/app/submissions` | PASS | 4 υποβολές · 2 Επιτυχία · 2 Ανεπιτυχές · monitoring inactive after close |
| `/app/documents` | PASS | 10 folders · tax EXPIRING_SOON after folder select (brief async lag OK) |
| `/app/saved-searches` | PASS | 1/15 · 87 matches · partial-scan note (KIMDIS throttle) |
| `/app/subscription` | PASS | Basic/Pro catalog · manage billing · Pro entitlements |
| `/app/settings/company` | PASS | TEKIA ΙΚΕ · ΓΕΜΗ · email/phone |
| `/app/settings/team` | PASS | 2/5 seats · pending invite |
| `/app/notifications` | PASS | 8 events · mark-read |
| `/app/search` | PASS | Route loads (session) |

---

## 4. Distinct states (§4) — must not collapse

| State | Result |
|-------|--------|
| DISCOVERED | PASS |
| FOLLOWING | PASS |
| OUTREACH_SENT | PASS (assert: no submission leak) · journey row may be advanced |
| PREPARING | PASS (Sparti UI) |
| SUBMITTED | PASS |
| WON / LOST | PASS (UI + API) |

---

## 5. Scoring honesty

| Check | Result |
|-------|--------|
| No 100% synonym stacking | **PASS** · max score **86** |
| Targeted invite reason | **PASS** in match reasons (assert) |
| Live profile match sample | adam `26REQ019741467` score 86 · not targeted |

---

## 6. Remaining notes (not blockers)

1. Saved-search UI may show «μερική σάρωση» when KIMDIS rate-limits — expected locally.  
2. Documents folder list updates heading immediately; document list catches up after fetch (cosmetic).  
3. Assert script’s confirm path may flip a previously DISMISSED link to CONFIRMED when re-running QA — use caution when interpreting dismiss persistence after assert. Product dismiss-guard itself was validated earlier.  
4. Dual-product boundary (no Slack / Drive / Electron in SaaS) still respected.

---

## 7. Credentials (local only)

- Email: `johnn.giannousis@gmail.com`  
- Password: `TekiaLocal2026!qa`  
- Org: TEKIA Local QA · Pro · `cmuv1sf220002yo2peeazviua`

## 8. How to re-run

```bash
pnpm exec tsx scripts/qa-assert-full-features.ts
# Browser: http://127.0.0.1:5174  · API :3000
```
