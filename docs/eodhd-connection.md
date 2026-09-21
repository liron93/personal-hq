# EODHD connection — US free-plan pilot

In-app entry: Finance → חיבור שוק ארה״ב. Existing Finnhub watchlist remains unchanged.
No brokerage, transactions, automatic scan or recommendations are connected.

## Activate
Set `EODHD_COOKIE_SECRET` (32 cryptographically random bytes, hex encoded) and
`EODHD_ALLOWED_USER_IDS` (comma-separated Supabase user IDs) as server-only environment
variables and redeploy. The password field stays disabled until encryption is ready.
Enter the provider key in the app, not in deployment settings or chat.
No service-role key or database changes required. No environment-provider-key fallback.

PUT accepts `{key: "..."}` and saves an AES-256-GCM encrypted HttpOnly, SameSite=Strict
cookie scoped to the API path, Secure in production, for 30 days. The authenticated
user ID is authenticated additional data; another user cannot decrypt this cookie.
The key exists briefly in the password input and request body, then only ciphertext
persists in the browser. Never log request bodies or cookies in infrastructure.
DELETE expires the cookie; it does not revoke the provider key or other devices.
Cookies are device-specific, not synced account storage. Rotation of the server secret
invalidates all saved cookies. Revoke a compromised API key at EODHD; a previously
copied cookie remains usable with the same user's valid login until expiry/revocation.
Ordinary company data still uses lib/store.js; credentials intentionally do not enter
that store, its exports, localStorage or database backups.

GET `/api/market/eodhd` verifies the signed-in authorized user and reports configuration
only, without provider usage. POST accepts `{symbol:"AAPL"}` and performs a real EOD
request for the last 364 days; only success verifies provider access. No demo fallback.
Bearer tokens are verified server-side using Supabase getUser; anonymous/other users
are denied, even if signed in. Owner allowlist fails closed when absent.

## Quota and data semantics
- EODHD free: 20 calls/day; failed symbol requests can count. No retries/polling.
- Process-local cache until UTC day rollover and in-flight dedup. 15 upstream attempts
  per credential/process/day as a secondary guard. Cache and in-flight requests are
  isolated by a server-side credential hash. This is NOT a durable/global quota ledger;
  serverless cold starts, deployments and other applications may consume more calls.
  EODHD remains the authority. Do not use paid keys without revisiting quotas.
- Only US EOD endpoint, fixed host, strict symbol validation, 12s timeout, no redirects.
- Provider response bodies/errors/URLs never logged or returned. Clean OHLCV only.
- Raw close and adjusted close remain separate. No claimed live prices or forecast.
- Status date, fetch time, source and cache use visible in-app. No stored personal data.

## Validation
`npm test` covers gates, schema/date checks, dedup, cache, quota and sanitized failures.
Live activation requires a personal key and authorized user ID; test successful fetch,
bad key, exhausted quota and mobile UI on Preview before merging.

Sources checked 2026-09-21:
https://eodhd.com/financial-apis/api-for-historical-data-and-volumes
https://supabase.com/docs/reference/javascript/auth-getuser
