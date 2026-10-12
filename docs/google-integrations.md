# Customer Google integrations (ARC Tenders)

Personal Google OAuth for Basic / Pro / active Pro trial. One Google account
per user + organization. Free: description + «Δείτε τα πακέτα» only.

Desktop Electron `GOOGLE_OAUTH_*` is unrelated and must never be reused in Coolify.

## Capabilities (separate release flags)

| Flag | Capability | Scope (minimum) |
| --- | --- | --- |
| `SAAS_GOOGLE_CALENDAR_ENABLED` | Deadline calendar | `openid email` + `calendar.app.created` |
| `SAAS_GOOGLE_DRIVE_ENABLED` | Import + tender folders | `openid email` + `drive.file` |
| `SAAS_GOOGLE_SHEETS_ENABLED` | Watched-tenders sheet | `openid email` + `drive.file` + `spreadsheets` |

Shared OAuth client:

| Variable | Purpose |
| --- | --- |
| `SAAS_GOOGLE_CLIENT_ID` | Google Cloud OAuth client ID (Web) |
| `SAAS_GOOGLE_CLIENT_SECRET` | Client secret (server only) |
| `SAAS_GOOGLE_REDIRECT_URI` | Exact redirect, e.g. `https://arc-tenders.tekia.gr/api/saas/integrations/google/oauth/callback` |
| `SAAS_SECRETS_ENCRYPTION_KEY` | AES-GCM for refresh/access tokens at rest |
| `SAAS_GOOGLE_PICKER_API_KEY` | Browser API key for Google Picker (Drive import only; restrict by HTTP referrer + API) |
| `SAAS_GOOGLE_PICKER_APP_ID` | Google Cloud project **number** (Picker `setAppId`, required for `drive.file` grants) |

Feature stays unavailable unless OAuth + encryption + the capability flag are set.

## Google Cloud setup

1. Create a Google Cloud project (TEKIA-owned — customers never create their own).
2. Enable APIs: **Google Calendar API**, **Google Drive API**, **Google Sheets API**, **Google Picker API** (Drive phases).
3. Configure OAuth consent screen (External). Testing mode for internal QA; production requires verification for sensitive scopes.
4. Create **OAuth client ID** type **Web application**.
5. Authorized redirect URIs: local + production `SAAS_GOOGLE_REDIRECT_URI` values.
6. For Drive Picker: create a **browser API key**, restrict it to *Google Picker API* (and *Google Drive API*) plus HTTP referrers for the ARC web origin(s); set `SAAS_GOOGLE_PICKER_API_KEY`. Set `SAAS_GOOGLE_PICKER_APP_ID` to the project **number**. Add the ARC web origin to the OAuth client's *Authorized JavaScript origins*.

### Scopes justification

- `calendar.app.created` — create a secondary ARC calendar and manage only its events (not primary calendar).
- `drive.file` — files the user opens with Picker or that ARC creates (not full Drive).
- `spreadsheets` — managed “Διαγωνισμοί ARC” sheet only.
- `openid` + `email` — identify the connected Google account.

Do not request Gmail, Contacts, or full calendar/drive access.

## OAuth flow

- Authorization code + PKCE (`S256`) + `access_type=offline` + `include_granted_scopes=true`.
- Single-use state bound to user, organization, capabilities, code_verifier (10 min TTL).
- Server-side code exchange; refresh token encrypted; omit-on-refresh preserves existing refresh token.
- Incremental authorization: Calendar vs Drive/Sheets requested when that feature is connected.
- Pausing Calendar does not revoke Drive. Full disconnect revokes the Google grant and removes the local connection row; Google files/calendars are **not** deleted.

## Calendar behaviour (Phase 1)

- Calendar name: `ARC Tenders — {company}`.
- Syncs followed/monitored tenders with a known `finalSubmissionDate`.
- Date-only (UTC midnight) → all-day event with exclusive end date. Timed → exact `dateTime` (never invent 23:59).
- Initial sync: future/today deadlines only. Updates are idempotent via event link fingerprint.
- Unfollow deletes the managed event. Temporary fetch failures do not delete valid events.
- Pause keeps events but stops updates. Manual «Συγχρονισμός τώρα» is rate-limited.
- If the user deletes the calendar → `NEEDS_RECREATE` and explicit recreate action.

## Drive import (Phase 2)

Copies selected Drive files into the company vault (**Έγγραφα**). Not a live sync:
the vault copy never changes when the Drive file changes, and ARC never modifies
the Drive file. Copy shown in UI: «Θα αποθηκευτεί αντίγραφο του αρχείου στα
Έγγραφα του ARC. Το αρχείο στο Google Drive δεν συγχρονίζεται και δεν τροποποιείται.»

**Availability** — all of: `SAAS_GOOGLE_DRIVE_ENABLED`, OAuth + encryption key,
Basic / Pro / active Pro trial (`googleDrive` + `companyVault`), verified email,
org membership, an `ACTIVE` Drive connection that holds `drive.file`.
`pickerConfigured` (API key + app id) is a separate view field: Connections still
works without it, but the Documents import button is shown disabled with a
message. Free: description + «Δείτε τα πακέτα» on the Connections card only.

**Flow**

1. Connections → *Google Drive* card → connect (scope `drive.file` only), or the
   dialog on Documents offers connect/reconnect.
2. `POST …/drive/picker-token` returns the user's short-lived access token plus
   `pickerApiKey` + `appId`. The browser keeps it **in memory only** (never
   localStorage / sessionStorage / cookies) and drops it when the Picker closes.
   Refresh tokens never leave the server. Response is `Cache-Control: no-store`.
3. Browser loads `https://apis.google.com/js/api.js`, opens `google.picker.PickerBuilder`
   (`ViewId.DOCS`, multi-select, max 10, `setOAuthToken` / `setDeveloperKey` / `setAppId`).
4. `POST …/drive/preview` — server re-reads authoritative metadata (name, type,
   size) and returns the import plan per file. No content is downloaded.
5. User picks the target ARC vault folder → `POST …/drive/import` creates one
   `GoogleDriveImportRecord` per file and one outbox job per supported file
   (`GOOGLE_DRIVE_IMPORT`). Job payload = IDs only (`importRecordId`,
   `connectionId`, `userId`, `organizationId`) — never tokens, names or bytes.
6. UI polls `GET …/drive/import/status?ids=…` and shows a per-file result;
   «Επανάληψη για τα αρχεία που απέτυχαν» re-submits only the retryable failures.

**Type mapping**

| Drive type | Result |
| --- | --- |
| `application/pdf` | copied as `.pdf` |
| `…wordprocessingml.document` (DOCX) | copied as `.docx` |
| Google Docs | exported as **PDF** («Θα εξαχθεί ως PDF») |
| `application/msword` (.doc), Sheets, Slides, folders, other | unsupported, clear Greek reason, nothing stored |

Binary files over 25 MB are rejected from metadata; the size is re-checked after
download/export (Google Docs report no size up front; Drive's export cap is ~10 MB).

**Records & versions** — each record keeps `googleFileId`, name, MIME type,
`googleModifiedTime`, `googleMd5Checksum`, Drive `version`, `exportMimeType`,
`importedAt`, `status` (`PENDING|SUCCEEDED|FAILED`) and a safe `errorSafe` code.
Vault documents are created with `source = IMPORTED`. Re-importing the same Drive
file always creates a **new** vault document — nothing is overwritten.

**Limits & safety**

- Max 10 files per request; one active batch per user + org connection
  (`409 google_drive_import_in_progress`; a `PENDING` batch older than 15 min no
  longer blocks). Starts are serialised with a Postgres advisory lock.
- The job re-checks flag, membership, plan (`googleDrive` + `companyVault`),
  connection status and scope before each file, then enforces `uploadDocument`
  rules (25 MB, PDF/DOCX, `assertVaultStorageBudget` → `quota_exceeded`).
- Transient Google/storage errors retry (max 3 attempts) and then fail the record;
  `401`/insufficient scope marks the connection `NEEDS_RECONNECT`.
- Disconnecting Drive cancels queued import jobs and fails their pending records
  (`connection_stopped`). Calendar pause/disconnect never touches import jobs.
- Records are visible only to their own user within their own organization.

## Drive tender participation folder (Phase 3)

Button **«Δημιουργία φακέλου στο Drive»** on the tender detail page (shown when the
Drive flag is on and the tender is in the org's workspace; Free sees the plans hint
instead). Same flag as import: `SAAS_GOOGLE_DRIVE_ENABLED`. Needs `googleDrive`
(Basic / Pro / active Pro trial), an `ACTIVE` Drive connection and `drive.file`.
The company vault (`companyVault`) is only required when vault documents are
attached; the checklist summary additionally needs `participationChecklist`.

**Snapshot, not sync.** A folder is a point-in-time copy in the *user's* Google
account. ARC never edits it afterwards, never shares/invites anyone, and never
overwrites files the user edited. A new snapshot is a separate explicit action: it
creates a **new** `GoogleDriveFolderLink` row and a **new** Drive folder.

**Before creating** the dialog (`POST …/drive/folders/preview`, no Google calls) shows:
destination Google email, editable folder name (default `{ΑΔΑΜ} — {σύντομος τίτλος}`,
max 120 chars), the official documents with what will really happen
(«Θα αντιγραφεί το PDF αν είναι διαθέσιμο» / «Μόνο σύνδεσμος στη σύνοψη»), an optional
vault picker (`CompanyDocumentPicker`, max 20 docs), the optional checklist summary,
the existing snapshots for this tender, and the copy/snapshot hints.

**Structure**

```
{folder name}/
  Σύνοψη διαγωνισμού.md                 title, authority, deadline, source, ARC link, official link
  01 — Έγγραφα διαγωνισμού/             official KIMDIS PDF(s) when bytes are available
  02 — Δικαιολογητικά/                  selected vault documents (copies)
  03 — Προετοιμασία προσφοράς/          «Έλεγχος δικαιολογητικών (ενδεικτικός).md» (optional)
```

- **Official documents.** For KIMDIS REQ/PROC with an `officialPdfUrl` the job
  downloads the attachment through the KIMDIS client (must start with `%PDF`, ≤ 25 MB).
  No bytes (404, non-PDF, too large, TED/Διαύγεια, no client) → item `SKIPPED/link_only`
  and the summary carries the official link and says «μόνο σύνδεσμος — δεν αντιγράφηκε
  αρχείο PDF». The summary is written *after* the official PDFs so it only claims a copy
  that exists; if a PDF download failed it waits (`dependency_failed`) for the retry.
- **Checklist summary.** Only offered when the plan has `participationChecklist` **and**
  `loadParticipationChecklist` produced a readable analysis. It reuses the existing
  fields/document lines and the existing `matchDisclaimerEl` / zero-rules limitation
  text, and states it is not a complete participation package. No readable analysis →
  no file (nothing is invented); the item ends `SKIPPED/checklist_unavailable`.
- **Vault documents** are copied as stored (PDF/DOCX, ≤ 25 MB) from the latest version.

**Idempotency & retries**

- `snapshotKey` (client request id) is unique per connection + tender: a double submit
  returns the same snapshot. One active (`PENDING`, < 15 min) snapshot per tender and
  connection → `409 google_drive_folder_in_progress`; starts are serialised with an
  advisory lock.
- Every Drive object ARC creates carries `appProperties.arcKey = "{linkId}:{itemKey}"`.
  Before creating the root folder or a file the job looks that key up, so a crash after
  creation but before the DB write cannot duplicate anything. Sub-folders are reused by
  name under the root. Outbox `deliveryKey = GDRIVE_FOLDER:{linkId}:{jobEpoch}`.
- Per-item rows (`GoogleDriveFolderItem`: `PENDING|SUCCEEDED|FAILED|SKIPPED`) persist
  progress. Transient Drive/KIMDIS errors return `retry` (outbox backoff, max 4 attempts)
  and resume where they stopped; the last attempt records the item as failed.
- Link status: `PENDING` → `SUCCEEDED` | `PARTIAL` (folder exists, something failed or is
  unfinished) | `FAILED` (no root folder / stopped). The UI lists every file with ✓/✗,
  keeps «Άνοιγμα φακέλου» for partial results and offers
  «Επανάληψη για τα αρχεία που απέτυχαν» (`POST …/retry`): resets only retryable
  `FAILED`/`PENDING` items, bumps `jobEpoch` (older queued jobs `skip`) and re-enqueues.
  Non-retryable: `vault_file_missing`, `file_too_large`, `file_empty`, `plan_locked`,
  `account_changed`.
- Success: «Ο φάκελος δημιουργήθηκε στο Google Drive.» + «Άνοιγμα φακέλου» and
  «Ο φάκελος περιέχει αντίγραφα των εγγράφων που επιλέξατε. Ελέγξτε τις απαιτήσεις της
  διακήρυξης πριν από την υποβολή.»

**Stale jobs.** The job payload/link carry `connectionId`, `userId`, `organizationId`,
`googleAccountId` and `jobEpoch`. Before any Drive call the job re-checks flag,
membership, plan, connection status/scope and that the connection still points at the
same Google account. An OAuth account switch cancels queued Drive jobs and fails
pending links (`account_changed`); a Drive-only disconnect cancels
`GOOGLE_DRIVE_IMPORT` and `GOOGLE_DRIVE_CREATE_FOLDER` jobs (`connection_stopped`).
Retrying a snapshot that belongs to another account is refused
(`google_drive_folder_account_changed`) — create a new snapshot instead. Old snapshots
stay listed with the Google account they were created in. Calendar pause/disconnect
never touches Drive jobs.

**Data.** `GoogleDriveFolderLink` (+ `organizationId`, `createdByUserId`,
`googleAccountId`, `googleEmail`, `snapshotKey`, `status`, `errorSafe`, `options`,
`jobEpoch`, `completedAt`; `folderId` nullable until the root exists) and
`GoogleDriveFolderItem`. Only IDs/booleans/safe codes are stored; never tokens or raw
Google bodies. Snapshots are visible only to the user + organization that created them.

**Upload.** ≤ 5 MB → multipart; larger → resumable session. Needs the outbox worker to
receive the KIMDIS client (`runSaasOutboxWorker(prisma, { kimdis })`, wired in
`src/index.ts`).

## Sheets (later phase)

- Phase 4: Managed spreadsheet «Διαγωνισμοί ARC» (one-way ARC → Sheets).

## Operator checklist (no production deploy from this task)

1. Create Google Cloud OAuth client + enable APIs.
2. Set env vars; run migration `20261012190000_google_integrations`.
3. Enable only flags for ready capabilities.
4. Confirm `GET /api/saas/integrations/google` returns `calendar.featureAvailable: true` for Basic when Calendar flag is on.
5. Connect from **Ρυθμίσεις → Συνδέσεις** with a test Google account in OAuth testing mode.
6. Drive import: run migration `20261012193000_google_drive_imports`, set the Picker key + app id, ensure the outbox worker runs, then import a PDF, a DOCX and a Google Doc from **Έγγραφα**.
7. Drive folders: run migration `20261012194500_google_drive_folder_jobs`, ensure the outbox worker runs (it needs the KIMDIS client for official PDFs), follow a tender and use **Δημιουργία φακέλου στο Drive** with a test Google account.

## API

- `GET /api/saas/integrations/google`
- `POST /api/saas/integrations/google/oauth/start`
- `GET /api/saas/integrations/google/oauth/callback`
- `POST /api/saas/integrations/google/calendar/pause`
- `POST /api/saas/integrations/google/calendar/sync`
- `POST /api/saas/integrations/google/calendar/recreate`
- `POST /api/saas/integrations/google/drive/picker-token`
- `POST /api/saas/integrations/google/drive/preview` — `{ files: [{ id, name?, mimeType?, sizeBytes? }] }`
- `POST /api/saas/integrations/google/drive/import` — `{ folderId, files: [{ googleFileId, name? }] }` → `202`
- `GET /api/saas/integrations/google/drive/import/status?ids=a,b,c`
- `GET /api/saas/integrations/google/drive/folders?tenderId=` — existing snapshots for the tender (this user + org)
- `POST /api/saas/integrations/google/drive/folders/preview` — `{ tenderId, vaultDocumentIds? }`
- `POST /api/saas/integrations/google/drive/folders` — `{ tenderId, folderName?, vaultDocumentIds?, includeOfficialDocs?, includeChecklistSummary?, clientRequestId? }` → `202 { folder }`
- `GET /api/saas/integrations/google/drive/folders/jobs/:linkId` — poll one snapshot (`linkId` = batch id)
- `POST /api/saas/integrations/google/drive/folders/:linkId/retry` — retry failed/unfinished items only → `202`
- `POST /api/saas/integrations/google/disconnect`

Responses never include tokens, authorization codes, or client secrets (the only exception is `picker-token`, which returns the short-lived browser access token for the Picker, uncached).
