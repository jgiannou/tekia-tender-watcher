# Customer Slack notifications (ARC Tenders)

Official Slack OAuth + incoming webhooks for Basic / Pro / active Pro trial.
One connected channel per organization. Free: no connect or send.

Internal ops `SLACK_WEBHOOK_URL` is unrelated and must not be reused for customers.

## Delivery semantics

Delivery is **at-least-once**, not exactly-once. If Slack accepts a webhook POST
but the HTTP client times out before ARC records success, a retry may post a
duplicate message. Jobs are deduped by connection + event (or batch window).

## Environment

| Variable | Purpose |
| --- | --- |
| `SAAS_SLACK_NOTIFICATIONS_ENABLED` | Feature flag (`true` to enable). Default off. |
| `SAAS_SLACK_CLIENT_ID` | Slack app Client ID |
| `SAAS_SLACK_CLIENT_SECRET` | Slack app Client Secret |
| `SAAS_SLACK_REDIRECT_URI` | Exact OAuth redirect, e.g. `https://arc-tenders.tekia.gr/api/saas/integrations/slack/oauth/callback` |
| `SAAS_SECRETS_ENCRYPTION_KEY` | 32-byte AES-GCM key (64 hex chars). Encrypts webhook URLs at rest. |
| `VITE_SAAS_SLACK_NOTIFICATIONS_ENABLED` | Optional; shows Slack on marketing pricing UI |

All of the server vars above must be set together or the feature stays disabled
(`isSaasSlackNotificationsConfigured()`).

Generate encryption key:

```bash
openssl rand -hex 32
```

Rotate carefully: existing ciphertext cannot be decrypted with a new key; admins
must reconnect Slack after a hard key rotation.

## Create the Slack app

1. Open [Slack API apps](https://api.slack.com/apps) → **Create New App** → From scratch (or from manifest: `docs/slack-app-manifest.json`).
2. **OAuth & Permissions**
   - Bot Token Scopes: only `incoming-webhook` (channel pick happens in Slack).
   - Redirect URL: the same value as `SAAS_SLACK_REDIRECT_URI`.
3. **Incoming Webhooks**: enable.
4. **Manage Distribution** → activate distribution so other workspaces can install
   (Marketplace listing is **not** required for v1). Workspace admins may still
   need to approve installs under their enterprise policies.
5. Copy Client ID / Client Secret into the env vars above.
6. Set `SAAS_SLACK_NOTIFICATIONS_ENABLED=true` and restart the SaaS API.
7. Optionally set `VITE_SAAS_SLACK_NOTIFICATIONS_ENABLED=true` and rebuild `saas-web`
   so pricing/marketing lists include Slack.

Do not request message history, files, or user list scopes.

## Operator checklist (no production deploy from this task)

1. Create Slack app + enable Incoming Webhooks + OAuth redirect.
2. Set secrets in the host env (never commit them).
3. Run Prisma migrate (`organization_slack_connections`, `slack_oauth_states`).
4. Confirm `/api/saas/integrations/slack` returns `configured: true` for a Basic org.
5. Connect from **Ρυθμίσεις → Συνδέσεις**, save preferences, send a test message.
6. Verify Free orgs see the upgrade CTA and cannot start OAuth.

## API surface

- `GET /api/saas/integrations/slack`
- `POST /api/saas/integrations/slack/oauth/start`
- `GET /api/saas/integrations/slack/oauth/callback`
- `PUT /api/saas/integrations/slack/preferences`
- `POST /api/saas/integrations/slack/pause`
- `POST /api/saas/integrations/slack/test`
- `POST /api/saas/integrations/slack/disconnect`

Responses never include webhook URLs, authorization codes, or tokens.
