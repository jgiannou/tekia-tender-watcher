# ARC_PRO_LAUNCH_30 — Ops admin + capacity release notes

**Date:** 2026-10-13  
**Promotion flag in production:** must remain `ARC_PRO_LAUNCH_30_ENABLED=false` until explicit approval.  
**Production deployment in this session:** **NOT performed.**

## What shipped (code)

### Backend
- DB-backed capacity (`promotion_campaign_configs`), seed **25**
- Audit ledger (`promotion_audit_events`)
- Redemption fields: `source`, `slotConsumed`, `slotRestoredAt`, `revoked*`, status `REVOKED`
- Services: `promotion-capacity.ts`, `promotion-admin.ts`; public activate uses DB capacity
- Idempotent slot alerts at remaining **5** and **0** (ops logs + audit)
- Admin APIs (auth: existing `ADMIN_TOKEN` / `X-Admin-Token` on `/admin/*`):
  - `GET /admin/ops/promotions/arc-pro-launch-30/summary`
  - `GET /admin/ops/promotions/arc-pro-launch-30/redemptions`
  - `GET /admin/ops/promotions/arc-pro-launch-30/audit`
  - `POST /admin/ops/promotions/arc-pro-launch-30/grant`
  - `POST /admin/ops/promotions/arc-pro-launch-30/revoke`
  - `POST /admin/ops/promotions/arc-pro-launch-30/restore-slot`
  - `PATCH /admin/ops/promotions/arc-pro-launch-30/capacity`

### Ops Desktop
- Main tab **Promotions**
- Summary counters, grant/revoke/restore, capacity edit, filters, audit table

### Marketing copy
- Uses dynamic `totalSlots` from API; Greek copy uses **λογαριασμούς** (not επιχειρήσεις)
- When Ops changes capacity, public copy follows API; static ads/assets must be revised manually

### Migration
- `prisma/migrations/20261013140000_promotion_capacity_audit`

## Local QA report

| Area | Result | Notes |
|------|--------|-------|
| Automated unit/integration (Postgres) | **PASS 27/27** | `saas-arc-pro-launch.test.ts` + `saas-arc-pro-launch-admin.test.ts` |
| Admin summary / grant / revoke / restore / capacity | **PASS** (automated) | Includes paid protection, idempotency, concurrency |
| Local admin API smoke | **PASS** | `GET …/summary` against local API returned capacity 25 |
| Ops Desktop UI build/typecheck | **PASS** | `tsc --noEmit` |
| Browser E2E signup→verify→activate→expire→Stripe | **Not fully re-run this session** | Prior session covered core promo; re-validate before prod enable |
| Email verification edge cases | **Manual / prior** | Requires real mailbox in safe test config |
| Stripe test upgrade | **Prior / not re-run here** | Use Stripe **test** keys only |
| Mobile UX | **Not re-run this session** | |
| Production deploy | **NOT done** | |
| Production promo enable | **NOT done** — flag must stay **false** | |

### Automated coverage highlights
- Initial capacity 25
- Manual grant consumes one slot; Pro entitlement without Stripe
- Grant blocked when promo disabled unless `forceWhenDisabled`
- Paid plan protection
- Revoke without restore; revoke + restore; double-restore blocked
- Capacity ±; refuse below consumed
- Concurrent grants + public concurrent activates
- Expiration → Free, slot stays consumed
- Public `totalSlots` tracks admin capacity

## Production procedure (Phase B — when you approve deploy)

1. Backup production Postgres.
2. Deploy app + run migration `20261013140000_promotion_capacity_audit`.
3. Confirm env: `ARC_PRO_LAUNCH_30_ENABLED=false`.
4. Confirm `promotion_campaign_configs` row capacity **25**, zero unintended redemptions.
5. From Ops Desktop (prod ADMIN_TOKEN): open **Promotions**, verify summary.
6. Smoke Free/paid paths only — **no** real promo redemptions without authorization.

## Phase C — activation (requires final approval)

1. Set `ARC_PRO_LAUNCH_30_ENABLED=true` and restart.
2. Verify `/pro-30`, remaining slots, public activate.
3. Monitor logs for `promo_slots_low` / `promo_slots_exhausted`.
4. Kill-switch: set enabled=false (existing entitlements keep running until expiry).

## Rollback
- Disable flag immediately.
- Do **not** delete redemption/audit rows.
- Capacity row can stay; optional revert app deploy if needed.
- Revoke individual orgs via Ops if required (option A/B for slot restore).

## Risks
- No staging — first live traffic is production (flag off mitigates).
- Concurrent capacity change + grants: Serializable + retries; still monitor under load.
- Marketing static assets (Ads creatives) won’t auto-update when capacity changes.
- Local `.env` may have promo **enabled** for QA — do not copy that to production.

## Screenshot
- Ops Promotions (local): `docs/screenshots/ops-promotions-arc-pro-launch-30.png`
  (capacity 25, consumed 1, remaining 24 — local QA data only)
