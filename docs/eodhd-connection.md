# EODHD connection — US free-plan pilot

In-app entry: Finance → חיבור שוק ארה״ב. Existing Finnhub watchlist remains unchanged.
No brokerage, transactions, automatic scan or recommendations are connected.

## V1 (Issue #7): status, test-connection, per-user snapshot
Earlier pilot code hardcoded `verified: false` everywhere and only kept the last fetch
in ephemeral React state (lost on reload, only carried across in-app department-tab
switches). That meant the UI could never distinguish "key saved" from "actually works",
and a user who reloaded the page had to re-run the test to see anything again — the
concrete cause behind "entered a key but never sees a useful result". V1 fixes both:

- **Status is a real state machine**, not a cookie/flag guess:
  `not_configured` → `saved_unverified` → `verified` → `needs_renewal`
  (`companies/kesef/market-snapshot.js#connectionStatus`). "verified" only appears after
  a POST actually returned real bars; the UI never shows a connected state from
  `configured`/cookie presence alone — see `tests/market-snapshot.test.mjs`.
- **One explicit test action** ("בדיקת חיבור / בדיקת מניה") triggers exactly one POST.
  Success replaces the stored snapshot; failure keeps the previous snapshot on screen but
  marks it `stale` with the failure reason/time (`markStale`) — it does not disappear.
- **The snapshot persists per user** through the existing `lib/store.js` (`useStore`),
  under its own key (`hq:kesef:market-snapshot:v1`), separate from the shared finance
  model. `company_state` rows are already scoped by `user_id`, so this is per-user by
  construction — verified with an injected fake Supabase client in
  `tests/market-snapshot-store-isolation.test.mjs`. No credential value is ever stored
  in it. Nothing auto-fetches from EODHD on page load — only the explicit test action
  calls the provider.
- **Five failure categories** the UI can tell apart (`lib/eodhd-service.mjs`
  `ERROR_CATEGORIES`/`categorizeUpstreamStatus`, forwarded as `category` in the JSON
  error body by `lib/eodhd-handler.mjs`): key rejected (401), plan/permission (402/403),
  quota/rate-limit (429, including the server's own 15/day guard), invalid symbol (404
  or an empty range), network/timeout (fetch failure). The 401 message used to say "check
  the server configuration" — misleading, since the key is entered per-user in the app,
  not a server setting — now it tells the user to replace the key in the form above.
- **Watchlist stays on Finnhub, on purpose.** Watchlist needs live-ish quote, P/E,
  dividend yield and sector (`app/api/quote/route.js`); the EODHD integration here only
  implements the free-plan end-of-day history endpoint, which has none of those fields.
  Merging Watchlist's per-item "refresh all" loop onto the same EODHD credential would
  also silently starve the 20-calls/day quota this connection depends on. So this isn't
  a "hidden dependency" of the EODHD connection (the EODHD route has zero references to
  `FINNHUB_API_KEY`, and vice versa) — it's a second, intentionally separate integration.
  Revisiting Watchlist's data source is a distinct, larger piece of work, not V1 scope.
- **Research tab is descriptive only**: a price line chart from the same 364-day bars
  the test-connection call already returns (no separate endpoint, no extra quota use),
  plus a link to EODHD's docs. Every card explicitly labels "סוף יום — לא בזמן אמת" and
  missing fields render "לא זמין" — never a fabricated number. No score, confidence
  level or buy/sell instruction anywhere.

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

This route's `authorize()` is still its own inline pre-#99 check (Supabase `getUser` +
`EODHD_ALLOWED_USER_IDS`), not the shared `lib/server-auth.mjs` guard from the
not-yet-merged `asaf/api-auth-hardening` (#99). V1 does not touch `authorize()`. Once
#99 merges, this route picks up the shared hardened guard through the normal merge —
#99 replaces the same lines with `createEodhdAuthorizer({ guard: createApiGuard() })`
returning `{ok, user, response}` instead of a bare user id/false, so the merge/rebase
will need the call site's `if(!userId)…` adjusted to `if(!gate.ok)…`, but no behavior
in this file's V1 additions depends on the shape of `authorize()`'s return value beyond
"truthy user id", so that adjustment is mechanical.

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
`npm test` covers gates, schema/date checks, dedup, cache, quota and sanitized failures,
plus (V1) error-category mapping, snapshot/staleness logic, per-user store isolation and
status-state transitions (`tests/eodhd-error-categories.test.mjs`,
`tests/market-snapshot.test.mjs`, `tests/market-snapshot-store-isolation.test.mjs`,
`tests/market-connection-wiring.test.mjs`). All of this is against injected fakes — no
real EODHD or Supabase credentials are used in tests. Browser verification for V1 also
used a fake session and a fully mocked `/api/market/eodhd` route (invented "DEMO"-style
numbers) in a disposable local copy of the app; **live EODHD was never called**. Live
activation still requires a personal key and authorized user ID; test successful fetch,
bad key, exhausted quota and mobile UI on Preview with a real key before merging.

Sources checked 2026-09-21:
https://eodhd.com/financial-apis/api-for-historical-data-and-volumes
https://supabase.com/docs/reference/javascript/auth-getuser
