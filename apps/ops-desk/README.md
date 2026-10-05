# ARC Tenders Ops Desk

Local mini dashboard for ARC Tenders ops (same role as **ARC Ops Desk** for Procurement):

- API health
- Grant trial / basic / pro without Stripe
- Optional password bootstrap

## Install deps

```bash
cd apps/ops-desk
npm install
```

## Dev

```bash
npm run dev                 # browser → http://127.0.0.1:5190
```

Connection sidebar:

- **Prod** API → Coolify sslip host for `saas-api`
- **Local** → `http://127.0.0.1:3000`
- Paste Coolify `ADMIN_TOKEN`, then **Save**

## Mac app

```bash
cd apps/ops-desk
npm install
npm run dist:mac
```

Then open `apps/ops-desk/release/` → install **ARC Tenders Ops** → Applications.

First launch if Gatekeeper blocks: Right-click → Open → Open.
