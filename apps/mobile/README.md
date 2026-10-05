# ARC Tenders Mobile

Expo (React Native) client for the ARC Tenders SaaS product.

## Production (default)

The app points at **prod** by default:

```
EXPO_PUBLIC_SAAS_API_URL=https://arc-tenders.tekia.gr
```

Scheme: `arctenders://`

## Local API (optional)

1. Start API: `pnpm saas:dev:api` (port 3000)
2. Set `EXPO_PUBLIC_SAAS_API_URL` in `apps/mobile/.env` to your machine LAN IP on a physical device (not `127.0.0.1`)
3. Start app: `pnpm mobile:dev`
