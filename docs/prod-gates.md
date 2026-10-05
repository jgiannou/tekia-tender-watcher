# Production gates (pilot)

Checklist πριν staging sign-off / pilot invite. Συμπληρώνει [production-readiness-plan.md](./production-readiness-plan.md).

## 1. Multi-org isolation

| Έλεγχος | Πώς |
|---|---|
| Δύο οργανισμοί, δύο users | Signup A + Signup B · διαφορετικά `organizationId` |
| Cross-org read | Με cookie A και `X-Organization-Id` του B → 403 |
| Cross-org write | Follow / vault / watch-profile στο ξένο org → 403 |
| Active org switch | `/api/saas/organizations/active` αλλάζει μόνο memberships του user |

Αυτοματοποίηση: `tests/saas-isolation.test.ts`.

## 2. Signup / auth

| Έλεγχος | Αναμενόμενο |
|---|---|
| Fresh signup | User + org + `Subscription` TRIALING (7 ημέρες) |
| Email verify (EMAIL_ENABLED=true) | `emailVerified=false` μέχρι click · banner στο app · περιοδικές σαρώσεις κλειδωμένες |
| Χωρίς verify | Login OK · χειροκίνητη ΚΗΜΔΗΣ OK · profile scan / periodic blocked |
| Password reset | `/forgot-password` → Brevo → `/reset-password?token=` |
| EMAIL_ENABLED=false (tests/dev) | Auto-verify στο create hook |

## 3. Scan gating

| Κατάσταση | Periodic | Manual profile scan | Manual ΚΗΜΔΗΣ |
|---|---|---|---|
| Unverified | 0 | 0 | OK |
| Trial (7d) | 1/ημέρα | έως 10/ημέρα | OK |
| Trial expired | 0 | 0 | OK |
| Basic (€4.99) | 2/ημέρα | έως 10/ημέρα | OK |
| Pro (€9.99) | 6/ημέρα | έως 20/ημέρα | OK |

Cron: `15 */4 * * *` (~6 waves/day)· το quota κόβει ανά πλάνο.

Πλήρες checklist (Stripe products, env, seats): [ops-setup.md](./ops-setup.md).

## 4. Backup / restore

| Στοιχείο | Απαίτηση πριν pilot |
|---|---|
| Postgres | Managed backup + δοκιμασμένο restore σε staging |
| Document storage | Object storage backup ή volume snapshot |
| Secrets | Ξεχωριστό prod `.env` · ποτέ στο git |
| Rollback | Προηγούμενο deploy image σε <15′ |
| Migrations | `prisma migrate deploy` στο release pipeline |

## 5. Workflow copy gate

UI πρέπει να λέει ρητά: **καταγραφή ≠ αποστολή** σε outreach, submission dialog, Submissions list.
