# ARC Tenders — κατάσταση checklist (κώδικας + QA)

Ημερομηνία: 2026-10-04 · HEAD τοπικό `main` (μετά `bcbb726`).  
Σκοπός: για κάθε σημείο «υλοποιημένο / μερικό / λείπει» με στοιχεία, ώστε να μην ξαναφτιάξουμε ό,τι υπάρχει.

Κατάσταση:
- **Υλοποιημένο** = υπάρχει στον κώδικα και έχει (τουλάχιστον μερικό) browser/unit evidence
- **Μερικό** = υπάρχει σημαντικά, αλλά λείπει coverage / verification / edge cases
- **Λείπει** = δεν υπάρχει ή είναι ρητά απενεργοποιημένο / unverified gate

---

## 0. Timeouts σάρωσης + retry χρήστη

| Σημείο | Κατάσταση | Στοιχεία |
|---|---|---|
| Hard timeout ενεργής σάρωσης | **Υλοποιημένο** | `SCAN_HARD_TIMEOUT_MS = 3 λεπτά` στο `runWatchProfileScan` · αποτυχία με `scan_timeout` |
| Orphan RUNNING μετά restart | **Υλοποιημένο** | `STALE_SCAN_MS = 5 λεπτά` + reclaim στο boot (`createSaasApp`) και στο `listWatchProfiles` · δεν αγγίζει in-flight jobs |
| Retry χρήστη | **Υλοποιημένο** | Banner «Επανάληψη» για FAILED · per-card rescan · Greek μήνυμα για timeout/interrupted |

---

## 1. Αναζητήσεις και σάρωση

| Σημείο | Κατάσταση | Στοιχεία |
|---|---|---|
| Ταξινόμηση πριν σελιδοποίηση / honesty ascending | **Μερικό** | Upstream sort + local sort μόνο όταν ολόκληρο το σύνολο χωράει σε 1 σελίδα (`sortItemsIfCompletePage`). Warning στο UI όταν multi-page + `date_asc`. Browser QA στο 083982a είχε ακόμα λάθος σειρά σε date-range· χρειάζεται επανέλεγχος στο τρέχον `main`. |
| Saved Search matches = date range (reconcile) | **Μερικό** | `reconcileStaleProfileMatches` μετά επιτυχές μη-partial scan. Κώδικας υπάρχει· browser QA 083982a το έδειξε ακόμα broken πριν το merge· χρειάζεται επανέλεγχος μετά `8516081`+. |
| ΚΑΔ κατασκευαστικές / union retrieval | **Μερικό** | Mapping στο `kad-to-watch.ts` (41.xx → κατασκευή keywords/CPV). `buildScanFilterVariants` = union ανά keyword/CPV. Recall vs manual «κατασκευή» ακόμα ανοιχτό (P1-A3). |
| Καταστάσεις pending / running / failed / completed + μήνυμα + retry | **Υλοποιημένο** | Ξεχωριστά banners στο Saved Searches · `scanLabel` · human errors · Επανάληψη |

---

## 2. Επισκόπηση

| Σημείο | Κατάσταση | Στοιχεία |
|---|---|---|
| HTTP 500 Overview (QA org) | **Υλοποιημένο (fix)** | Αιτία: stale Prisma client χωρίς `OPPORTUNITY_DIGEST` → `/attention` 500 → compose Overview έπεφτε. Fix: `prisma generate` + soft-fail attention + restart. Επαληθεύτηκε στο browser για QA Gate org. |
| Νέες ευκαιρίες 3/page + pagination | **Υλοποιημένο** | Overview card · `usePaginatedList` pageSize 3 |
| Metrics σημασιολογία (unfollowed) | **Υλοποιημένο** | Browser pass στο re-QA |

---

## 3. Ειδοποιήσεις in-app

| Σημείο | Κατάσταση | Στοιχεία |
|---|---|---|
| Τίτλοι + προορισμοί NEW_OPPORTUNITY / DIGEST / SUBMISSION | **Υλοποιημένο** | `attention-content.ts` + routing · browser pass `0c19c77` |
| Mark as read (item + όλα) | **Υλοποιημένο** | Bell ✓ · Notifications page · mark-all |
| Επίσημη εξέλιξη (RELATED_*) content + click | **Μερικό** | View-model + monitor job υπάρχουν · **browser-unverified** σε πραγματικό RELATED_PROC/AWRD fixture |
| Διπλότυπα / unread count / bell badge | **Μερικό** | Dedupe keys υπάρχουν · χρειάζεται ρητός regression pass |
| Focus σε συγκεκριμένη ιστορική υποβολή από notification | **Λείπει** | Click ανοίγει tender detail, όχι deep-link σε συγκεκριμένο submission event |

---

## 4. Email

| Σημείο | Κατάσταση | Στοιχεία |
|---|---|---|
| Brevo/SMTP αποστολή ARC SaaS | **Μερικό** | `src/saas/mail/mail.ts` + `EMAIL_ENABLED` · verify/reset wired · opportunity digests ακόμα in-app only |
| User prefs immediate vs digest χωρίς spam | **Μερικό** | Settings `emailEnabled` + thresholds UI · χωρίς πραγματική παράδοση digests |
| Retry failed deliveries + error log | **Λείπει** | Μοντέλο status υπάρχει · digest worker αποστολής όχι |
| Auth verify-email / password reset email | **Υλοποιημένο** | better-auth hooks + Forgot/Reset pages + EmailVerificationBanner · unverified = manual ΚΗΜΔΗΣ only |

---

## 5. Procurement workflow

| Σημείο | Κατάσταση | Στοιχεία |
|---|---|---|
| DISCOVER → FOLLOW → MONITOR → PREPARE → SUBMIT → MONITOR RESULT | **Μερικό** | Pipeline + UI actions υπάρχουν · end-to-end με πραγματικά AWRD/SYMV **όχι** browser-verified |
| REQ ↔ PROC association | **Μερικό** | `relatedActLink` + monitor job · χρειάζεται real fixture pass |
| Copy: καταγραφή ≠ αυτόματη αποστολή | **Υλοποιημένο** | Outreach + submission dialogs + Submissions list · ρητά «δεν στέλνει/υποβάλλει αυτόματα» |

---

## 6. PDF και Company Vault

| Σημείο | Κατάσταση | Στοιχεία |
|---|---|---|
| PDF blank-panel UX | **Υλοποιημένο** | Validated size + download / νέα καρτέλα / ΚΗΜΔΗΣ / opt-in embed |
| Πραγματική λήψη/ανάγνωση PDF | **Μερικό / gate** | Automation δεν ολοκλήρωσε download · χρειάζεται ανθρώπινο Chrome verify |
| Vault εκδόσεις + λήξεις + picker | **Μερικό** | Versions API/UI · expiry badges · picker «έκδ. N» · όχι πλήρες multi-version regression |
| Submission κρατά έκδοση εγγράφων | **Υλοποιημένο** | `submission.ts` snapshot `documentVersionId` / version / storageKey · immutable timeline note |

---

## 7. Πριν παραγωγή

| Σημείο | Κατάσταση | Στοιχεία |
|---|---|---|
| Απομόνωση org δεδομένων | **Μερικό** | `requireOrgMembership` σε SaaS routes · χρειάζεται adversarial QA cross-org |
| Ρόλοι/δικαιώματα χρηστών | **Μερικό** | Membership roles στο schema · λεπτομερές RBAC UI περιορισμένο |
| Scans μετά restart | **Μερικό** | Reclaim orphan RUNNING · **δεν** υπάρχει persistent job queue· pending δεν ξαναρχίζουν μόνα τους μετά restart (χρήστης/retry) |
| Backup/restore, migrations, error logging | **Μερικό** | Prisma migrations υπάρχουν · checklist στο [prod-gates.md](./prod-gates.md) · restore ακόμα unverified σε staging |
| Fresh signup + multi-org QA | **Μερικό** | Signup → trial subscription · isolation tests υπάρχουν · adversarial browser QA ακόμα ανοιχτό |
| Verification + scan gating | **Υλοποιημένο** | Unverified/trial/paid quotas · cron periodic waves |
| Commercial plans Basic/Pro + seats | **Μερικό** | Catalog locked (`docs/subscription-plans.md`) · Pro feature matrix provisional (spec truncated) · Stripe UI όχι |
| In-app attention retention | **Υλοποιημένο** | Max 25 events/org · prune on write + list |

---

## 8. Πηγές TED / Διαύγεια + Phase 2/3 (2026-10-10)

| Σημείο | Κατάσταση | Στοιχεία |
|---|---|---|
| TED Search API (χωρίς API key) | **Υλοποιημένο (opt-in)** | `TED_ENABLED=true` · πραγματικό `POST /v3/notices/search` · fixtures + unit tests · routes `/api/saas/sources/ted/*` · follow → `TED:{publicationNumber}` tender. **Δεν** είναι ακόμα μέρος της κύριας Discover/ΚΗΜΔΗΣ ροής ούτε shared-ingest. |
| Διαύγεια ADA + search | **Μερικό** | `DIAVGEIA_ENABLED=true` για adapter routes · ADA fetch + luminapi search · enrichment ADAM→ADA παραμένει ενεργό και χωρίς flag. **Δεν** υπάρχει πλήρης συλλογή νέων πράξεων / saved search / inbox. |
| Credentials blocker | **Λάθος (διορθώθηκε)** | Δεν περιμένουμε TED/Diavgeia credentials για δημόσια αναζήτηση/ανάγνωση. |
| Checklist παραπομπές σελίδας | **Υλοποιημένο (fix)** | Χωρίς page splits → `page: null` (όχι ψεύτικη «σελίδα 1») · λήξη vault vs σήμερα **και** vs προθεσμία υποβολής. |
| Ιστορικό κατακυρώσεων / price memory | **Μερικό** | Panel στο followed tender από τοπικά KIMDIS AWRD · `coverage.complete=false` + ελληνικό disclaimer. Όχι πλήρες δημόσιο ιστορικό TED/Διαύγεια. |
| Πλήρης ροή πριν production | **Λείπει verification** | Weekly Free email, zero-news, outbox retries χωρίς διπλότυπα, plan change, trial expiry, πραγματικό PDF + storage μετά restart · μετά migrate/deploy. |

---

## Προτεινόμενη σειρά (ενημερωμένη)

1. **Ανοιχτά bugs / επανέλεγχος** — ascending sort date-range, reconcile matches, construction recall  
2. **Timeouts/retry** — ✅ hard 3′ + orphan 5′ + UI Επανάληψη  
3. **Πλήρες workflow + επίσημες RELATED ειδοποιήσεις** — πραγματικά fixtures  
4. **Email** — ✅ verify/reset Brevo · digests αργότερα  
5. **PDF human verify + vault versions**  
6. **Production gates** — [prod-gates.md](./prod-gates.md) · staging restore + adversarial multi-org  
7. **Plans/Stripe** — placeholders μόνο · UI αργότερα (€4.99 / €10)
8. **TED/Diavgeia product surfacing** — opt-in adapters έτοιμα · ένταξη σε Discover/ingest + end-to-end QA πριν production

Πηγή ιστορικού QA: [ARC-Tenders-ReQA-083982a.md](/Users/johngiannousis/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an/outputs/ARC-Tenders-ReQA-083982a.md)
