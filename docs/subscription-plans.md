# ARC Tenders — subscription packages

Commercial SaaS only. Does **not** apply to the internal TEKIA Electron / SQLite / Slack / Google Drive tool.

## Public packages (locked)

| | Free | Basic | Pro |
|---|---|---|---|
| Monthly | €0 (no card, no expiry) | €4.99 | €9.99 |
| Yearly | — | €49 | €99 |
| Included seats | 1 | 1 | 3 |
| Extra seats | — | — | €2.49 / user / month (€24.90 / year) |
| Self-service seat cap | 1 | 1 | 20 |
| Active saved searches | 1 | 5 | 15 |
| Active followed tenders | 5 | 30 | 100 |
| Storage | — | 250 MB | 2 GB |
| KIMDIS check | every 2 minutes (shared) | same | same |
| Email cadence | ≤1 weekly summary when new | DIGEST hours (≤2/day) or immediate followed developments | DIGEST hours (≤6/day); optional immediate high-match opportunities |
| Region filter | yes | yes | yes |
| Thread screen | yes | yes | yes |
| Company docs / outreach / submission | no | yes | yes |
| Participation checklist | no | yes | yes |
| Expiring contracts | count only | list + follow | list + follow |
| Award history | no | yes | yes |
| Private bid price note | no | yes | yes |
| Upcoming deadlines email | no | no | yes |
| AI | none | none | none |

Prices exclude VAT. Above 20 Pro seats: show  
`Χρειάζεστε περισσότερους από 20 χρήστες; Επικοινωνήστε μαζί μας.`

## Trial

7 days · Pro-level access · separate «Δοκιμάστε το Pro για 7 ημέρες» action · does **not** replace Free. On expiry: Free weekly email policy; pending daily/immediate product emails cancelled.

## Code / UI

- Catalog: `src/saas/plans/catalog.ts`
- Channel policy: `src/saas/services/email-channel-policy.ts`
- Weekly Free: `src/saas/jobs/weekly-free-digest.ts`
- Outbox: `src/saas/jobs/outbox.ts`
- Shared ingest: `src/saas/jobs/shared-ingest.ts`
- Billing: `src/saas/billing/*` · UI `/app/subscription`
- Feature PRD: [PRD-saas-features.md](./PRD-saas-features.md)

## Note

Discovery is the shared KIMDIS ingest for every package. `maxDigestHoursPerDay` (legacy alias `periodicScansPerDay`) caps digest email hours — it is not discovery latency and Free weekly cadence does not use it as a daily email quota.
