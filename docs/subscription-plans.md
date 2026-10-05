# ARC Tenders — subscription plans

Commercial SaaS only. Does **not** apply to the internal TEKIA Electron / SQLite / Slack / Google Drive tool.

## Public plans (locked)

| | Basic | Pro |
|---|---|---|
| Monthly | €4.99 | €9.99 |
| Yearly (later) | €49 | €99 |
| Included seats | 1 | 3 |
| Extra seats | — | €2.49 / user / month (add-on, not a 3rd plan) |
| Self-service seat cap | 1 | 20 |
| Active saved searches | 3 | 15 (provisional) |
| Active followed tenders | 20 | 100 (provisional) |
| Storage | 250 MB | 2 GB (provisional) |
| Periodic scans / day | 2 | 6 |
| Email mode | DIGEST — related-act updates **1×/day** grouped | IMMEDIATE — related-act update emailed **right away** |
| Advanced watch filters | no | yes (provisional) |

Above 20 Pro seats: show  
`Χρειάζεστε περισσότερους από 20 χρήστες; Επικοινωνήστε μαζί μας.`

## Trial

7 days · Basic-level access · **1** periodic scan / day · requires verified email for profile scans.

## Code / UI

- Catalog: `src/saas/plans/catalog.ts`
- Billing: `src/saas/billing/*` · UI `/app/subscription`
- Scan / seat access: `src/saas/services/scan-access.ts`
- Enforcement: `entitlements.ts`, `follow.ts`, `organizations.ts` (members)
- Schema: `Subscription.extraSeats`, `planKey` ∈ `trial|basic|pro`
- **Ops checklist (Stripe products, env, gates):** [ops-setup.md](./ops-setup.md)

## Note

Pro feature numbers marked provisional were filled after the product message was truncated mid-Basic entitlements. Reconcile when the full Pro block arrives — do **not** add a Business/Enterprise plan.
