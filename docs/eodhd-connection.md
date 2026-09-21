# EODHD connection — US free-plan pilot

In-app entry: Finance → חיבור שוק ארה״ב. Existing Finnhub watchlist remains unchanged.
No brokerage, transactions, automatic scan or recommendations are connected.

## Activate
Set `EODHD_API_KEY` and `EODHD_ALLOWED_USER_IDS` (comma-separated Supabase user IDs)
as server-only environment variables in the deployment host and redeploy. Never
place provider credentials in source, public env vars, chat, client storage or URLs
sent to the browser. No service-role key or database changes required.

GET `/api/market/eodhd` verifies the signed-in authorized user and reports configuration
only, without provider usage. POST accepts `{symbol:"AAPL"}` and performs a real EOD
request for the last 364 days; only success verifies provider access. No demo fallback.
Bearer tokens are verified server-side using Supabase getUser; anonymous/other users
are denied, even if signed in. Owner allowlist fails closed when absent.

## Quota and data semantics
- EODHD free: 20 calls/day; failed symbol requests can count. No retries/polling.
- Process-local cache until UTC day rollover and in-flight dedup. 15 upstream attempts
  per process/day as a secondary guard. This is NOT a durable/global quota ledger;
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
