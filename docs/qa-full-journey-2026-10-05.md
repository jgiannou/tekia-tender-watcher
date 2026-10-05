# QA Report — Full SaaS User Journey

**Date:** 2026-10-05  
**Environment:** Local (`http://127.0.0.1:5174` + API `:3000`)  
**Account:** `johnn.giannousis@gmail.com` / org **TEKIA Local QA** (Pro)  
**Sources of truth compared:** `docs/SAAS_PRODUCT_NORTH_STAR.md` §10 acceptance narrative + dual-product rules; `docs/PRD-current-state.md` (internal baseline — SaaS gaps expected where noted)

**Populate script:** `scripts/qa-populate-local-journey.ts`  
**Assert script:** `scripts/qa-assert-journey.ts` → **26 PASS / 0 FAIL / 1 MISSING**

---

## 0. Populate done (was missing before)

| Artifact | Count / examples |
|----------|------------------|
| Vault folders | 10 (00–09 taxonomy) |
| Company documents | 6 (ΓΕΜΗ VALID, φορολογική EXPIRING_SOON, ασφαλιστική EXPIRED, προφίλ, δήλωση, κατάλογος έργων) |
| Explicit FOLLOW | `26PROC019701809` |
| Outreach SENT + docs | `26REQ019704419` |
| PREPARING + workspace docs (3) | `26PROC019704619` |
| Submission PENDING + 4 snapshots | `26PROC019705854` |
| Submission WON (DB) | `26REQ019714852` |
| Monitoring active | 4 threads |

---

## 1. North Star acceptance narrative (§10)

| # | Promise | Result | Evidence |
|---|---------|--------|----------|
| 1 | Create company + activities | **PASS** | Settings company + 2 ΚΑΔ; onboarding COMPLETED |
| 2 | Define WatchProfile / saved rules | **PASS** | «Web / ιστοσελίδα» COMPLETED · 94 matches |
| 3 | Search KIMDIS and/or monitoring rules | **PASS** | Search page + saved-search scans |
| 4 | Receive relevant opportunities | **PASS** | Overview «Νέες ευκαιρίες» 89; Opportunities 94 |
| 5 | Follow / Με ενδιαφέρει | **PASS** | 5 following; badge «Παρακολουθείται» |
| 6 | Enters monitored pipeline | **PASS** | `/app/monitoring` filters + 5 ενεργά νήματα |
| 7 | Send EOI externally | **N/A (by design)** | App never sends — correct |
| 8 | Record outreach in-app | **PASS** | Detail shows method/date/docs; copy «δεν στέλνει» |
| 9 | Keep checking KIMDIS for related acts | **PARTIAL** | `monitoringActive=true` after follow/outreach/submit; **0 RelatedActLink** in DB (job not proven end-to-end on these ADAMs) |
| 10 | Related PROC → email + in-app | **PARTIAL / unverified** | Digest email works; related-act attention path exists in code, not exercised with live link |
| 11 | Prepare workspace/documents | **PASS** | PREPARING + 3 workspace docs linked from Company Vault |
| 12 | Submit externally | **N/A (by design)** | Correct |
| 13 | Record formal submission | **PASS** | Submissions page + detail timeline; snapshots |
| 14 | Continue monitoring after submit | **PASS** | SUBMITTED + monitoring active; copy «Απόφαση ανάθεσης / σύμβαση» |
| 15 | Notify on new developments | **PARTIAL** | Attention + Brevo digest SENT; related-act notify unproven |
| 16 | Confirm WON / LOST | **FAIL (product gap)** | No SaaS API/UI to set submission result; WON only via DB populate |

---

## 2. Distinct states (North Star §4) — must not collapse

| State | Present in UI/DB | Notes |
|-------|------------------|-------|
| DISCOVERED / Νέα | PASS | Opportunities + Overview |
| FOLLOWING | PASS | Distinct from outreach |
| OUTREACH_SENT | PASS | Assert: no submission leak on outreach-only row |
| PREPARING | PASS | Monitoring filter + stage label |
| SUBMITTED | PASS | Submissions list + detail |
| WON / LOST / COMPLETED | **PARTIAL** | WON visible after DB set; **no user control** to mark WON/LOST; LOST untested in UI |

---

## 3. Page-by-page browser QA

| Route | Result | Notes |
|-------|--------|-------|
| Login | PASS | Session OK |
| `/app` Overview | PASS | Attention, new opps, following, expiring docs section, next actions |
| `/app/opportunities` | PASS (prior) | 94 matches |
| `/app/monitoring` | PASS | Filters: Παρακολουθούνται / Ενδιαφέρον / Προετοιμασία / Υποβλήθηκαν / Ολοκληρωμένα |
| `/app/submissions` | PASS | 2 rows; copy «όχι αυτόματη αποστολή»; monitoring badge |
| `/app/documents` | PASS | Full folder taxonomy; upload UI |
| `/app/saved-searches` | PASS (prior) | Scan completed |
| `/app/search` | PASS (prior) | KIMDIS search |
| `/app/subscription` | PASS (prior) | Pro |
| `/app/settings/*` | PASS | Company / Team / Activities / Notifications nav |
| `/app/tenders/REQ/…` outreach | PASS | Timeline KHMΔΗΣ vs Εταιρεία; outreach docs; waiting PROC |
| `/app/tenders/PROC/…` submitted | PASS | Submission recorded; still monitoring awards |
| PDF preview | PASS (prior) | Proxy 200 |
| Team invite | PASS (prior) | Invite emailed |

---

## 4. Gaps vs what we claim (priority)

### P0 — promised by North Star, missing or broken for users

1. **Confirm WON / LOST in SaaS UI**  
   Internal dashboard has buttons; SaaS has neither API route nor UI. User cannot close the journey honestly.

2. **Stop monitoring («Διακοπή παρακολούθησης»)**  
   API `unfollow` exists; **TenderDetailPage has no unfollow control** — only dismiss/hide. North Star §8 requires stop monitoring.

3. **Related-act confirm/dismiss UX**  
   ~~North Star §6: LIKELY/POSSIBLE + Επιβεβαίωση / Δεν σχετίζεται.~~ **DONE 2026-10-05** — local heuristic discovery + API + UI; dismissed links do not resurrect.

4. **Stale 100% scores on existing opportunities**  
   Scoring fix is in code, but stored match reasons still show synonym stacking (`ιστοσελίδα`+`ιστότοπος`+`website` → 100%). **Needs full rescan** to refresh scores/reasons.

### P1 — partial / honesty issues

5. Targeted invites already in opportunities (e.g. Sparti used as PREPARING sample) remain until rescan/reconcile drops them.  
6. Overview «Έγγραφα που λήγουν» section exists; documents in expired/expiring folders need folder click to see (default folder empty).  
7. Company settings form: page loads; values come from API (populate wrote them) — browser `innerText` does not show input values clearly.

### P2 — intentionally different from internal PRD (OK)

| Internal PRD | SaaS |
|--------------|------|
| Slack | Brevo email |
| Google Drive vault | App Company Vault |
| Electron drafts / Drive merge | Workspace links to vault docs (lighter) |
| SQLite operator | Postgres multi-tenant |

These are **by design** (North Star §2), not bugs.

---

## 5. What we *do* deliver correctly (keep)

- Dual product boundary respected (Slack not in SaaS).  
- Follow ≠ Outreach ≠ Submission enforced in domain + UI copy.  
- Monitoring continues after submission.  
- Company Vault upload + expiry statuses + attach to outreach/submission/workspace.  
- Digest email + in-app attention.  
- Team invites + Pro entitlements.  
- «Καταγραφή ≠ αποστολή» copy on outreach/submission dialogs and Submissions page.

---

## 6. Recommended next fixes (order)

1. ~~Rescan watch profile → refresh scores (honest %) + drop targeted invites.~~ **DONE 2026-10-05** (87 matches, top ~86%)
2. ~~Add **WON/LOST** API + buttons on submission detail.~~ **DONE** (`PATCH /api/saas/submissions/:id/result` + UI)
3. ~~Add **Διακοπή παρακολούθησης** (unfollow) on tender detail.~~ **DONE**
4. Run/verify `monitor-followed-threads` against live KIMDIS for followed REQs; then ship confirm/dismiss for possible related acts.
5. Re-send a short digest after rescan to QA email dates + new scores.

---

## 7. Credentials (local only)

- Email: `johnn.giannousis@gmail.com`  
- Password: `TekiaLocal2026!qa`  
- Org: TEKIA Local QA · Pro
