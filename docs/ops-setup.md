# ARC Tenders — ενιαίο ops / setup checklist

Ό,τι πρέπει να ρυθμίσεις σε **apps, Stripe, server, env, gates** πριν staging/pilot.  
Δεν αφορά το εσωτερικό TEKIA Electron / SQLite / Slack / Google Drive tool.

Σχετικά: [subscription-plans.md](./subscription-plans.md) · [prod-gates.md](./prod-gates.md) · [production-readiness-plan.md](./production-readiness-plan.md)

---

## 0. Γρήγορη εικόνα προϊόντος

| Πλάνο | Μηνιαία | Ετήσια (αργότερα) | Seats |
|---|---|---|---|
| Trial (in-app, 7 ημέρες) | — | — | 1 |
| **Basic** | €4.99 | €49 | 1 |
| **Pro** | €9.99 | €99 | 3 included |
| Pro extra seat (add-on, όχι 3ο πλάνο) | €2.49 / user | €24.90 / user | έως 20 self-service |

Πάνω από 20 Pro seats:  
`Χρειάζεστε περισσότερους από 20 χρήστες; Επικοινωνήστε μαζί μας.` → `contact@tekia.gr`

UI: `/app/subscription` (ίδιο ύφος με ARC Procurement Subscription page).

---

## 1. Περιβάλλον / process

### Local

| Τι | Πώς |
|---|---|
| Postgres | `pnpm db:up` · `DATABASE_URL` στο root `.env` |
| API | `SAAS_ENABLED=true pnpm saas:dev:api` (port 3000) |
| Web | `pnpm saas:dev` (port 5174) |
| Migrations | `pnpm prisma migrate deploy` |

### Production host

| | Production |
|---|---|
| **Public app** | **`https://arc-tenders.tekia.gr`** |
| API | same origin via nginx `/api/*` → `saas-api:3000` (όχι ξεχωριστό public API host) |
| Process | Coolify · `Dockerfile.saas-api` + `apps/saas-web/Dockerfile` |
| DB | managed Postgres (χωριστά από internal watcher SQLite) |
| Docs storage | volume `/app/storage` ή object storage |

Local full stack smoke: `pnpm saas:docker:up` → http://127.0.0.1:8080  

Λεπτομέρειες Coolify: **§9** κάτω.

---

## 2. Env vars (API / server)

### Core SaaS

```bash
SAAS_ENABLED=true
DATABASE_URL=postgresql://…
BETTER_AUTH_SECRET=<long random>
# Same public origin (nginx proxies /api) — cookies + auth redirects
BETTER_AUTH_URL=https://arc-tenders.tekia.gr
SAAS_APP_URL=https://arc-tenders.tekia.gr
SAAS_TRUSTED_ORIGINS=https://arc-tenders.tekia.gr,http://localhost:5174,http://127.0.0.1:5174
GEMI_API_KEY=…
GEMI_API_BASE_URL=https://opendata-api.businessportal.gr/api/opendata/v1
```

### Email (Brevo SMTP) — auth + opportunity alerts

```bash
EMAIL_ENABLED=true
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USERNAME=…
SMTP_PASSWORD=…
EMAIL_FROM=contact@tekia.gr
EMAIL_FROM_NAME=ARC Tenders
EMAIL_LOCALE=el
```

Χωρίς `EMAIL_ENABLED=true` → auto-verify στο signup (μόνο για tests/dev).

### Stripe (ίδιος λογαριασμός με ARC Procurement)

Χρησιμοποιούμε το **ίδιο Stripe account / secret key** με ARC Procurement.  
Τα **products/prices είναι νέα** για ARC Tenders (τα δημιουργείς εσύ στο Dashboard).

```bash
# Ίδιο secret με ARC Procurement (Test mode μέχρι staging pass)
STRIPE_SECRET_KEY=sk_test_…

# ΝΕΟ webhook endpoint για ARC Tenders API (μην ξαναχρησιμοποιήσεις το Procurement whsec)
STRIPE_WEBHOOK_SECRET=whsec_…

# Price IDs — άδεια μέχρι να δημιουργήσεις προϊόντα (βλ. §3)
STRIPE_PRICE_TENDERS_BASIC_MONTHLY=price_…
STRIPE_PRICE_TENDERS_BASIC_ANNUAL=price_…
STRIPE_PRICE_TENDERS_PRO_MONTHLY=price_…
STRIPE_PRICE_TENDERS_PRO_ANNUAL=price_…
STRIPE_PRICE_TENDERS_EXTRA_SEAT_MONTHLY=price_…
STRIPE_PRICE_TENDERS_EXTRA_SEAT_ANNUAL=price_…

STRIPE_SUCCESS_URL=https://arc-tenders.tekia.gr/app/subscription?checkout=success
STRIPE_CANCEL_URL=https://arc-tenders.tekia.gr/app/subscription?checkout=cancel
```

Frontend: δεν χρειάζεται publishable key (Checkout είναι server-created).

---

## 3. Stripe Dashboard — τι να δημιουργήσεις

### 3.1 Κοινά

1. https://dashboard.stripe.com → **Test mode** πρώτα  
2. Tax: **Enable Stripe Tax** · origin Greece · prices **Exclusive** (ΦΠΑ έξω)  
3. Checkout στο app έχει `automatic_tax.enabled = true` + tax ID collection  

### 3.2 Προϊόντα (ακριβώς 6 prices)

Μην δημιουργήσεις Trial στο Stripe (το trial είναι in-app).

| # | Product name | Product ID | Amount | Interval | Env var (Price ID) |
|---|---|---|---|---|---|
| 1 | ARC Tenders Basic monthly | `prod_VNi0J6xFRqKv7m` | **4.99** EUR | Monthly | `STRIPE_PRICE_TENDERS_BASIC_MONTHLY` = `price_1UMwagHxyfydbJuNoKqSTacp` |
| 2 | ARC Tenders Basic yearly | `prod_VNi1vYW4Ee54iX` | **49.00** EUR | Yearly | `STRIPE_PRICE_TENDERS_BASIC_ANNUAL` = `price_1UMwb3HxyfydbJuNYX7g08ok` |
| 3 | ARC Tenders Pro monthly | `prod_VNi1uBl2iGSMYJ` | **9.99** EUR | Monthly | `STRIPE_PRICE_TENDERS_PRO_MONTHLY` = `price_1UMwbMHxyfydbJuNRUpWEwDT` |
| 4 | ARC Tenders Pro yearly | `prod_VNi1lHqfVHtM0T` | **99.00** EUR | Yearly | `STRIPE_PRICE_TENDERS_PRO_ANNUAL` = `price_1UMwbeHxyfydbJuNNV18daxd` |
| 5 | ARC Tenders Extra seat monthly | `prod_VNi2S6Lsi94gZ8` | **2.49** EUR | Monthly | `STRIPE_PRICE_TENDERS_EXTRA_SEAT_MONTHLY` = `price_1UMwbyHxyfydbJuNGyFa4Q7l` |
| 6 | ARC Tenders Extra seat yearly | `prod_VNi2CYrDpvtkDo` | **24.90** EUR | Yearly | `STRIPE_PRICE_TENDERS_EXTRA_SEAT_ANNUAL` = `price_1UMwcFHxyfydbJuN554w8g8h` |

> Το app χρειάζεται **Price IDs** (`price_…`), όχι Product IDs (`prod_…`). Τα παραπάνω `price_` τραβήχτηκαν από το Stripe account για τα products που έδωσες.

Για κάθε προϊόν:

1. Product catalog → **+ Add product**  
2. Pricing: Recurring · EUR · Exclusive tax · **no** free trial on the price  
3. Optional metadata: `arc_product=tenders`, `arc_plan=basic|pro|extra_seat`  
4. Copy **Price ID** (`price_…`) → Coolify / `.env`  

Annual = 10× monthly (2 μήνες δώρο) — ίδια λογική με ARC Procurement.

### 3.3 Webhook (νέο destination)

1. Developers → Webhooks → **Add endpoint**  
2. URL: `https://arc-tenders.tekia.gr/api/saas/billing/webhook`  
3. Events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy signing secret → `STRIPE_WEBHOOK_SECRET`  
5. **Μην** δείξεις το ίδιο endpoint στο ARC Procurement webhook  

Local test: `stripe listen --forward-to localhost:3000/api/saas/billing/webhook`

### 3.4 Customer portal

Settings → Billing → Customer portal: ενεργό για ενημέρωση κάρτας / ακύρωση στο τέλος περιόδου.

---

## 4. Συχνότητες σαρώσεων (product gates)

| Κατάσταση | Periodic waves / ημέρα | Manual profile scans / ημέρα | Χειροκίνητη ΚΗΜΔΗΣ |
|---|---|---|---|
| Email unverified | 0 | 0 | ✅ |
| Trial (7d, verified) | **1** | 10 | ✅ |
| Basic | **2** | 10 | ✅ |
| Pro | **6** | 20 | ✅ |
| Trial expired / inactive | 0 | 0 | ✅ |

Cron στο API process: `15 */4 * * *` (~6 slots/day)· το quota κόβει ανά πλάνο.

Hard timeout ενεργής σάρωσης: **3 λεπτά** (Promise.race + cancel flag + page budget) · orphan RUNNING (χωρίς live worker / μετά από restart): reclaim σε **~8 δευτ.** · boot: force reclaim όλων των RUNNING. Override tests/ops: `SAAS_SCAN_HARD_TIMEOUT_MS`.

In-app attention events: **max 25 / org** (παλιότερα διαγράφονται).

---

## 5. Entitlement gates (κώδικας)

| Πόρος | Basic | Pro | Enforcement |
|---|---|---|---|
| Active saved searches | 3 | 15* | `assertCanActivateWatchProfile` |
| Active followed tenders | 20 | 100* | `assertCanFollowTender` |
| Seats | 1 | 3 + extra (≤20) | `assertCanAddOrganizationMember` |
| Storage | 250 MB | 2 GB* | catalog (enforce upload αργότερα αν λείπει) |
| Advanced filters | off | on* | catalog flag |

\*Pro feature numbers provisional μέχρι να έρθει πλήρες Pro block.

Κώδικας: `src/saas/plans/catalog.ts` · `src/saas/billing/*` · `src/saas/services/scan-access.ts`

---

## 6. Prod gates QA (χειροκίνητα)

Δες και [prod-gates.md](./prod-gates.md).

- [ ] Fresh signup → org + trial subscription  
- [ ] Verify email → unlock profile scans  
- [ ] Multi-org: cookie A + `X-Organization-Id` B → 403  
- [ ] Basic/Pro checkout (Test mode) → webhook → `Subscription.status=ACTIVE`  
- [ ] Pro + extra seats quantity στο checkout  
- [ ] Portal cancel → `cancelAtPeriodEnd` · πρόσβαση μέχρι period end  
- [ ] Attention list ≤ 25  
- [ ] Backup/restore Postgres + object storage σε staging  

---

## 7. Apps / secrets inventory

| App / service | Secrets / config |
|---|---|
| SaaS API (`Dockerfile.saas-api`) | §2 · `SAAS_ENABLED=true` |
| saas-web (`apps/saas-web/Dockerfile`) | `API_UPSTREAM=saas-api:3000` (Coolify private hostname) |
| Brevo | SMTP user/pass · verified sender `EMAIL_FROM` |
| Stripe | secret + tenders price IDs + tenders webhook secret |
| GEMI OpenData | `GEMI_API_KEY` |
| Internal TEKIA desktop / watcher `Dockerfile` | **ξεχωριστό** · μην μπλέξεις Google OAuth στο SaaS |

---

## 8. Μετά που θα δημιουργήσεις τα Stripe products

1. Πάστα Price IDs στο Coolify / `.env`  
2. Restart API  
3. `GET https://arc-tenders.tekia.gr/api/saas/billing/catalog` → `configured: true`  
4. Από UI `/app/subscription` → Basic checkout (Test card `4242…`)  
5. Επιβεβαίωση webhook στο Stripe Dashboard (200)  
6. Έλεγχος DB `subscriptions.planKey` / `extraSeats`  

Live mode: επανάλαβε προϊόντα + webhook + keys `sk_live_` / `whsec_` μόνο αφού περάσει staging.

---

## 9. Coolify deploy — `https://arc-tenders.tekia.gr`

Ίδιο μοτίβο με ARC Procurement: **μόνο το web είναι public**. Το nginx κάνει proxy το `/api/*` και `/health` στο ιδιωτικό `saas-api` στο ίδιο Docker network. Cookies + Better Auth δουλεύουν same-origin.

```
Internet → Cloudflare/DNS → Coolify Traefik → saas-web:80 (nginx)
                                              └─ /api/*, /health → saas-api:3000
                                                                    └─ Postgres
                                                                    └─ volumes /data + /app/storage
```

### 9.0 Προϋποθέσεις

- [ ] Repo στο GitHub/GitLab (branch π.χ. `main`) με τα Dockerfiles αυτού του commit  
- [ ] Coolify server online + domain `arc-tenders.tekia.gr` στο DNS (A/AAAA ή CNAME προς τον server / Cloudflare)  
- [ ] Stripe products/prices έτοιμα (§3) — μπορείς να ξεκινήσεις με `sk_test_`  
- [ ] Brevo SMTP credentials + verified sender `contact@tekia.gr`  
- [ ] `GEMI_API_KEY` αν χρησιμοποιείς ΓΕΜΗ στο setup  
- [ ] Τοπικό smoke (προαιρετικό): `pnpm saas:docker:up` → http://127.0.0.1:8080  

**Μην** χρησιμοποιήσεις το root `Dockerfile` (internal SQLite watcher). Μόνο:

| Service | Dockerfile | Build context | Listen |
|---|---|---|---|
| `saas-api` | `Dockerfile.saas-api` | **repo root** `/` | `3000` |
| `saas-web` | `apps/saas-web/Dockerfile` | **repo root** `/` | `80` |
| Postgres | Coolify Database | — | `5432` |

---

### 9.1 Βήμα 1 — Postgres στο Coolify

1. Coolify → **Project** (νέο ή υπάρχον TEKIA) → **+ New** → **Database** → **PostgreSQL** (16+)  
2. Name: `arc-tenders-db` (ή παρόμοιο)  
3. Database name: `arc_tenders`  
4. Deploy · περίμενε Healthy  
5. Άνοιξε το resource → **Connect** / connection string  
   - Χρησιμοποίησε το **internal** URL (όχι public), π.χ.  
     `postgresql://USER:PASS@arc-tenders-db:5432/arc_tenders?schema=public`  
   - Το hostname είναι το Coolify service name στο private network  
6. Ενεργοποίησε **automatic backups** αν είναι διαθέσιμο  

Κράτα το `DATABASE_URL` για το API.

---

### 9.2 Βήμα 2 — `saas-api` (ιδιωτικό)

1. **+ New** → **Application** → **Dockerfile** (ή Private Git + Dockerfile)  
2. Source: σύνδεσε το git repo · branch `main`  
3. Build settings:
   - **Base Directory / Context:** `/` (ρίζα repo)  
   - **Dockerfile Location:** `/Dockerfile.saas-api`  
   - **Port:** `3000`  
4. **Domains:** άφησε **κενό** (χωρίς public FQDN). Το API δεν εκτίθεται απευθείας.  
5. **Network:** ίδιο Docker network με το Postgres (και αργότερα με το web).  
   - Στο Coolify: βεβαιώσου ότι API + DB είναι στο ίδιο project / predefined network.  
6. **Persistent storage (volumes):**

   | Container path | Σκοπός |
   |---|---|
   | `/data` | SQLite side-file του watcher (`DATABASE_PATH`) |
   | `/app/storage` | Vault / ανεβασμένα αρχεία org |

7. **Healthcheck** (αν το Coolify δεν διαβάζει το Dockerfile HEALTHCHECK):  
   - Path: `/health` · Port `3000` · start period ≥ 40s  
8. **Environment Variables** — επικόλλησε το block §9.4 (όλα τα secrets)  
9. Deploy  

**Startup:** το entrypoint τρέχει `prisma migrate deploy` και μετά `node dist/index.js`.  
Στα logs πρέπει να δεις:

```
[saas-api] prisma migrate deploy…
[saas-api] starting node dist/index.js …
saas API: enabled (/api/auth/* , /api/saas/*)
http listening on :3000
```

10. Σημείωσε το **internal hostname** του API όπως φαίνεται στο Coolify  
    (π.χ. `saas-api`, `arc-tenders-api`, ή `xxx-saas-api`).  
    Θα το βάλεις στο web ως `API_UPSTREAM=<hostname>:3000`.

---

### 9.3 Βήμα 3 — `saas-web` (public)

1. **+ New** → **Application** → **Dockerfile** · ίδιο git repo / branch  
2. Build settings:
   - **Context:** `/` (**όχι** `apps/saas-web` — χρειάζεται workspace root)  
   - **Dockerfile:** `/apps/saas-web/Dockerfile`  
   - **Port:** `80`  
3. **Domain:** `arc-tenders.tekia.gr`  
   - Enable HTTPS (Coolify Let's Encrypt) **ή** Cloudflare Full (strict) μπροστά  
4. **Ίδιο network** με `saas-api`  
5. **Environment:**

```bash
API_UPSTREAM=<coolify-saas-api-hostname>:3000
```

Παράδειγμα: αν το API service λέγεται `arc-tenders-api` → `API_UPSTREAM=arc-tenders-api:3000`  
(Χωρίς `https://`, χωρίς path — μόνο `host:port`.)

6. Deploy  

Το nginx template αντικαθιστά το `__API_UPSTREAM__` στο boot (`apps/saas-web/docker/entrypoint.sh`).

---

### 9.4 Production env — πλήρες block για `saas-api`

Γέννησε secret:

```bash
openssl rand -base64 48
```

```bash
# --- core ---
NODE_ENV=production
PORT=3000
SAAS_ENABLED=true
DATABASE_URL=postgresql://USER:PASS@arc-tenders-db:5432/arc_tenders?schema=public
DATABASE_PATH=/data/tenders.db

BETTER_AUTH_SECRET=<openssl-rand-output>
BETTER_AUTH_URL=https://arc-tenders.tekia.gr
SAAS_APP_URL=https://arc-tenders.tekia.gr
SAAS_TRUSTED_ORIGINS=https://arc-tenders.tekia.gr

# --- Kimdis / watcher (τρέχει στο ίδιο process· κράτα ήσυχο poll) ---
KIMDIS_BASE_URL=https://cerpp.eprocurement.gov.gr
POLL_INTERVAL_MINUTES=60
BOOTSTRAP_SEND_ALERTS=false
ADMIN_TOKEN=<random>
OPERATOR_API_TOKEN=<random>

# --- email (Brevo) ---
EMAIL_ENABLED=true
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USERNAME=<brevo-login>
SMTP_PASSWORD=<brevo-smtp-key>
EMAIL_FROM=contact@tekia.gr
EMAIL_FROM_NAME=ARC Tenders
EMAIL_LOCALE=el

# --- Stripe (test μέχρι go-live· μετά sk_live_ + live prices + νέο whsec) ---
STRIPE_SECRET_KEY=sk_test_…
STRIPE_WEBHOOK_SECRET=whsec_…
STRIPE_PRICE_TENDERS_BASIC_MONTHLY=price_1UMwagHxyfydbJuNoKqSTacp
STRIPE_PRICE_TENDERS_BASIC_ANNUAL=price_1UMwb3HxyfydbJuNYX7g08ok
STRIPE_PRICE_TENDERS_PRO_MONTHLY=price_1UMwbMHxyfydbJuNRUpWEwDT
STRIPE_PRICE_TENDERS_PRO_ANNUAL=price_1UMwbeHxyfydbJuNNV18daxd
STRIPE_PRICE_TENDERS_EXTRA_SEAT_MONTHLY=price_1UMwbyHxyfydbJuNGyFa4Q7l
STRIPE_PRICE_TENDERS_EXTRA_SEAT_ANNUAL=price_1UMwcFHxyfydbJuN554w8g8h
STRIPE_SUCCESS_URL=https://arc-tenders.tekia.gr/app/subscription?checkout=success
STRIPE_CANCEL_URL=https://arc-tenders.tekia.gr/app/subscription?checkout=cancel

# --- GEMI (setup company lookup) ---
GEMI_API_KEY=…
GEMI_API_BASE_URL=https://opendata-api.businessportal.gr/api/opendata/v1
```

**Μετά το πρώτο επιτυχές deploy του domain**, βάλε Stripe webhook (§3.3):

`https://arc-tenders.tekia.gr/api/saas/billing/webhook`

και επικόλλησε το `whsec_…` στο API · Redeploy/Restart.

---

### 9.5 Βήμα 4 — DNS / TLS

1. Cloudflare (ή registrar): `arc-tenders.tekia.gr` → IP Coolify server (proxied ή DNS-only)  
2. Στο Coolify domain του `saas-web`: Generate SSL  
3. Αν Cloudflare orange-cloud: SSL mode **Full (strict)**  
4. Έλεγχοι από browser / curl:

```bash
curl -fsS https://arc-tenders.tekia.gr/health
curl -fsS https://arc-tenders.tekia.gr/api/saas/billing/catalog
# SPA:
curl -fsSI https://arc-tenders.tekia.gr/ | head
```

Αναμενόμενα: health JSON `status:ok` · catalog JSON με `configured: true` όταν τα price IDs είναι σωστά.

---

### 9.6 Βήμα 5 — Post-deploy QA

- [ ] `/` φορτώνει login/signup  
- [ ] Signup → email verification από Brevo  
- [ ] Login · cookie στο `arc-tenders.tekia.gr` (Application → Cookies)  
- [ ] Δημιουργία αποθηκευμένης αναζήτησης · σάρωση ολοκληρώνεται (όχι αιώνιο RUNNING)  
- [ ] `/app/subscription` · Basic checkout με test card `4242…`  
- [ ] Stripe Dashboard → webhook deliveries **200**  
- [ ] DB: `subscriptions` row `ACTIVE` / σωστό `planKey`  
- [ ] Volumes παραμένουν μετά από Redeploy  
- [ ] Postgres backup δοκιμασμένο  

---

### 9.7 Συχνά λάθη

| Σύμπτωμα | Αιτία / fix |
|---|---|
| Web 502 στο `/api` | Λάθος `API_UPSTREAM` ή API/web σε διαφορετικό network |
| Build web fails / missing workspace | Context δεν είναι repo root |
| Auth redirect σε `localhost` | `BETTER_AUTH_URL` / `SAAS_APP_URL` όχι `https://arc-tenders.tekia.gr` |
| Cookies δεν κάθονται | Public API ξεχωριστό domain αντί same-origin nginx |
| `configured: false` στο catalog | Λείπουν monthly Basic/Pro **Price** IDs (`price_…` όχι `prod_…`) |
| Webhook 400 signature | Λάθος `whsec` ή παλιό endpoint από άλλο app |
| Signup χωρίς email | `EMAIL_ENABLED` όχι `true` ή λάθος SMTP |
| Migrations fail on boot | Λάθος `DATABASE_URL` / DB όχι στο ίδιο network |
| Χάνονται uploads | Δεν έχεις volume στο `/app/storage` |
| Χρησιμοποιήθηκε root `Dockerfile` | Ξαναστήσε με `Dockerfile.saas-api` |

---

### 9.8 Εναλλακτικό: ένα Docker Compose resource

Αν προτιμάς **ένα** Coolify resource αντί για δύο apps:

1. New → **Docker Compose** · repo root · compose file `docker-compose.yml`  
2. Profile / services: `postgres`, `saas-api`, `saas-web` (όπως τοπικά με `--profile saas`)  
3. Public domain **μόνο** στο `saas-web` · μην εκθέσεις `3000` public  
4. `API_UPSTREAM=saas-api:3000` (το compose service name)  
5. Env από §9.4 στο `saas-api` service  

Τοπικό ισοδύναμο: `pnpm saas:docker:up` → http://127.0.0.1:8080

---

### 9.9 Τι **δεν** μπαίνει στο Coolify SaaS

- `apps/desktop` / Google Drive OAuth  
- `apps/dashboard` (operator local UI)  
- Slack webhook του internal TEKIA watcher (εκτός αν το θες ρητά)  
- Root `Dockerfile` (legacy SQLite-only image)
