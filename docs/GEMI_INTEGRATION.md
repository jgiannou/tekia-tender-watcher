# GEMI OpenData Integration Notes

**Source of truth inspected:** live Swagger 2.0 at  
https://opendata-api.businessportal.gr/api-docs  
(Swagger UI: https://opendata-api.businessportal.gr/opendata/docs/)

**Official portal:** https://opendata.businessportal.gr/  
**Tech docs:** https://opendata.businessportal.gr/techdocs/

---

## Auth

| Item | Value |
|------|--------|
| Mechanism | Header `api_key` |
| Registration | Required — developer form, approved personal key |
| Docs test key | `api-docs-key` (rate-limited, not a production substitute) |
| Env (server only) | `GEMI_API_KEY`, `GEMI_API_BASE_URL` |

Never expose the API key to `apps/saas-web`. Browser → SaaS API → GEMI.

Default base URL from spec:

`https://opendata-api.businessportal.gr/api/opendata/v1`

---

## Endpoints used for company setup

### Search companies

`GET /companies`

Query params (at least one required; AND semantics):

| Param | Notes |
|-------|--------|
| `afm` | exactly 9-digit AFM (leading zeros when shorter; do not exceed 9) |
| `arGemi` | GEMI number (may be a long numeric string, e.g. `195930203000`) |
| `name` | min 3 chars — name/title search (do **not** auto-confirm) |
| `kad` | one or more activity codes (filter criterion) |
| `statuses`, `legalTypes`, `prefectures`, … | optional filters |
| `resultsSize` | max 200 |

**Live response shape (verified against production OpenData):**

```json
{
  "searchMetadata": { "totalCount": 1, "resultsOffset": 0, "resultsSize": 1 },
  "searchResults": [ { "arGemi": "...", "afm": "...", "coNameEl": "...", "activities": [ ... ] } ]
}
```

Do **not** assume a bare JSON array. The adapter reads `searchResults`.

Detail `GET /companies/{arGemi}` returns the company object directly (not wrapped).

### Company detail

`GET /companies/{arGemi}`

Returns full public company record (`Company` definition).

### Activities metadata

`GET /metadata/activities` — catalog of KADs for searchable picker.

### Public documents (future)

`GET /companies/{arGemi}/documents` — do **not** auto-import into Vault in this milestone.

---

## Company fields actually returned (spec)

From `definitions.Company`:

| Field | Description |
|-------|-------------|
| `arGemi` | GEMI number (integer) |
| `afm` | AFM |
| `coNameEl` | Legal name (EL) |
| `coTitlesEl` | Distinctive titles (array) |
| `status` | `{ id, descr }` |
| `gemiOffice` | `{ id, descr }` |
| `legalType` | `{ id, descr }` |
| `incorporationDate` | date |
| `url`, `email` | website / email |
| `street`, `streetNumber`, `zipCode`, `city`, municipality, prefecture | address |
| `objective` | company purpose text |
| **`activities`** | array of `CompanyActivity` |

### CompanyActivity (KAD on detail)

```
activities[].activity.id      — KAD code
activities[].activity.descr   — description
activities[].activity.kadVersion — "2008" | "2026"
activities[].type             — primary/secondary classification string from API
```

**Finding:** KAD/activity data **is available** on company detail when present in the payload.  
Search supports KAD as a **filter**, but setup should prefer detail `activities` after exact AFM/arGemi match + user confirmation.

---

## Matching policy (product)

| Allowed auto-suggest | Not allowed for silent attach |
|----------------------|-------------------------------|
| Exact `afm` | Fuzzy `name` only |
| Exact `arGemi` | Approximate title matches |

User must confirm: «Αυτή είναι η επιχείρησή μου».

---

## Failure / missing credentials

If `GEMI_API_KEY` unset:

- lookup endpoints return `gemi_not_configured`
- UI offers manual company entry
- never fabricate GEMI payloads

---

## Adapter in repo

`src/saas/company-registry/`

- `types.ts` — domain DTOs
- `provider.ts` — `CompanyRegistryProvider`
- `gemi-opendata-provider.ts` — HTTP implementation
- `manual-fallback.ts` — configured=false behavior
