# ARC Tenders — Production readiness plan

Ημερομηνία: 2026-10-04  
Σειρά: **feature freeze v1 → prod env → security/reliability → legal/UX → staging QA → pilot → public launch**

Σχετικά: [release-checklist-status.md](./release-checklist-status.md) · **[ops-setup.md](./ops-setup.md)** (Stripe products, env, gates, scan frequencies)

---

## 1. Κλείδωμα πρώτης έκδοσης (feature freeze)

### Απόφαση προϊόντος (προτεινόμενη)

**Πιλοτικό με προσκλήσεις.** Όχι self-serve billing από την ημέρα 1.

| Στο v1 pilot | Εκτός v1 (αργότερα) |
|---|---|
| Signup + email verify · org isolation · Saved Searches · Opportunities · Monitoring · Vault · attention | Public marketing site polish beyond essentials |
| Manual-record outreach/submission (χωρίς auto-send) | Αυτόματη αποστολή προσφορών / ΕΣΗΔΗΣ submit |
| Brevo verify + password reset · gated periodic scans | Πλούσια marketing email digests |
| Plans UI `/app/subscription` + Stripe checkout (Test mode) | Live Stripe + public self-serve launch |

**Stop shipping νέες λειτουργίες** εκτός: P0, P1 που μπλοκάρουν τη βασική διαδρομή, staging/prod plumbing, legal pages, security fixes.

### Βασική διαδρομή που πρέπει να είναι πράσινη

`Signup/login → org/company setup → Saved Search scan → Opportunities → Follow → Outreach/Prepare/Submit (καταγραφή) → Monitoring/attention → Vault PDF`

---

## 2. Περιβάλλον παραγωγής

| Στοιχείο | Απαίτηση | Σήμερα |
|---|---|---|
| Domain + HTTPS | `app.` + API πίσω από TLS | Dev localhost μόνο |
| Frontend (saas-web) | Static/host + proxy `/api` | Vite dev |
| API (`SAAS_ENABLED`) | Process manager / container | Local `tsx watch` |
| PostgreSQL | Managed prod DB, χωριστά από QA | Local/shared |
| Document storage | Object storage (όχι μόνο local disk) | Local filesystem provider |
| Email | Brevo/SMTP ή ρητή απόφαση off | **Wired** via `EMAIL_ENABLED` + Brevo SMTP (verify + reset) · digests ακόμα όχι |
| Αυτόματες σαρώσεις | Scheduler/worker που επιζεί restart | Cron `15 */4 * * *` + quota (trial 1/day, paid 6/day) · orphan reclaim · persistent queue **όχι** |
| Secrets | Ξεχωριστά `.env` prod · ποτέ commit | Dev secrets local |
| Εσωτερικό TEKIA tool | Ανεξάρτητο (desktop/operator/Slack) | Παραμένει χωριστό |

---

## 3. Ασφάλεια και αξιοπιστία

| Έλεγχος | Στόχος πριν staging sign-off |
|---|---|
| Cross-org access | Δεν διαβάζει/γράφει άλλη εταιρεία (adversarial QA) |
| Private vault docs | Μόνο members του org · signed download path |
| Rate limits | API + scan budgets (hard timeout 3′ υπάρχει) |
| Error logging | Structured logs / alerting σε αποτυχίες scan & API 5xx |
| Backups | DB + object storage · δοκιμασμένο restore |
| Rollback | Προηγούμενο deploy image/release επαναφέρεται σε <15′ |

---

## 4. Απαραίτητα για χρήστες

- Όροι χρήσης + πολιτική απορρήτου (ελληνικά)
- Στοιχεία υποστήριξης (email)
- ~~Διαγραφή λογαριασμού / δεδομένων (διαδικασία ή self-serve)~~ — self-serve: Ρυθμίσεις → Προφίλ → `DELETE /api/saas/me`
- In-product copy: τι παρακολουθεί το ARC · τι κάνει ο χρήστης στο ΚΗΜΔΗΣ/ΕΣΗΔΗΣ · καταγραφή ≠ αποστολή (ήδη μερικό στο UI)

---

## 5. Staging + acceptance

Περιβάλλον ≈ παραγωγή. Checklist:

1. Νέος λογαριασμός (όχι QA seed)
2. Δύο οργανισμοί / εταιρείες — μηδενική διαρροή
3. Πλήρες procurement flow σε πραγματικά ή staging KIMDIS data
4. Email παραλαβή **αν** email in-scope · αλλιώς τεκμηριωμένο skip
5. PDF λήψη + vault version σε submission
6. Scan → restart API → orphan δεν μένει RUNNING · retry δουλεύει
7. Καμία μεταφορά QA fixtures στην παραγωγή

**«Έτοιμο για deploy»** = κανένα ανοιχτό P0 · κανένα P1 στη βασική διαδρομή · staging QA πράσινο · scans (+ email αν in-scope) · backup restore OK.

---

## 6. Πιλοτικό → δημόσιο

1. 3–10 εταιρείες με πρόσκληση  
2. Μετρικά: scan failures, opportunity quality, confusion points  
3. Fix μόνο blockers / UX που μπλοκάρουν χρήση  
4. Δημόσιο launch (+ billing αν αποφασιστεί τότε)

---

## Τρέχουσα φάση

Ολοκληρώθηκαν: Email/Brevo verify+reset, workflow copy «καταγραφή ≠ αποστολή», prod-gates, verification + gated scans, Basic/Pro catalog + `/app/subscription` + Stripe wiring (ίδιο account, νέα Tenders prices).

**Επόμενο:** δημιούργησε Stripe products (δες [ops-setup.md](./ops-setup.md) §3) · staging env · multi-org QA · backup restore.

Δες [prod-gates.md](./prod-gates.md) + [ops-setup.md](./ops-setup.md). Δεν ανοίγουμε δημόσιο launch χωρίς staging acceptance.
