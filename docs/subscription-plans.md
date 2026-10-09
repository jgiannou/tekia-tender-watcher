# ARC Tenders — subscription plans

Commercial SaaS only. Does **not** apply to the internal TEKIA Electron / SQLite / Slack / Google Drive tool.

## Public plans (locked)

| | Free | Basic | Pro |
|---|---|---|---|
| Monthly | €0 (no card, no expiry) | €4.99 | €9.99 |
| Yearly (later) | — | €49 | €99 |
| Included seats | 1 | 1 | 3 |
| Extra seats | — | — | €2.49 / user / month |
| Self-service seat cap | 1 | 1 | 20 |
| Active saved searches | 1 | 3 | 15 |
| Active followed tenders | 5 | 20 | 100 |
| Storage | — | 250 MB | 2 GB |
| Ingest speed | Shared (≤5 min) | Shared (≤5 min) | Shared (≤5 min) |
| Email mode | 1 digest / day | DIGEST at chosen hours | IMMEDIATE |
| Region filter | yes | yes | yes |
| Thread screen | yes | yes | yes |
| Vault / outreach / submission | no | yes | yes |
| Participation checklist | no | yes | yes |
| Expiring contracts | count only | list + follow | list + follow |
| Price memory | no | yes | yes |
| Deadline radar email | no | no | yes |

Above 20 Pro seats: show  
`Χρειάζεστε περισσότερους από 20 χρήστες; Επικοινωνήστε μαζί μας.`

## Trial

7 days · Pro-level access · separate «Δοκίμασε Pro» action · does **not** replace Free.

## Code / UI

- Catalog: `src/saas/plans/catalog.ts`
- Shared ingest: `src/saas/jobs/shared-ingest.ts`
- Billing: `src/saas/billing/*` · UI `/app/subscription`
- Scan / seat access: `src/saas/services/scan-access.ts`
- Feature PRD: [PRD-saas-features.md](./PRD-saas-features.md)

## Note

Discovery is the shared KIMDIS ingest for every plan. `periodicScansPerDay` caps digest email hours and legacy per-org waves — it is not the discovery latency.
