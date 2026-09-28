# Investments API handoff

The investments module is currently disconnected. User-entered holdings, watchlist,
goals and conditions use the existing authenticated company store. No broker data is
imported, no quotes are fabricated, and no financial action is available.

## Required before enabling a provider

- Provider name, official API documentation, sandbox, account eligibility and prices.
- Read-only OAuth scopes for positions. No trading, withdrawal or transfer scope.
- Authenticated same-origin server proxy; secrets in server environment only.
- Per-user authorization, token encryption/rotation/revocation, timeout, rate limits,
  pagination, retry/backoff and audit policy. Never send provider tokens to the browser.
- Unique instrument identifier including exchange, symbol, currency, quantity,
  asset class, sector and snapshot time; distinguish zero holdings from partial data.
- Quote price, currency, timestamp, source, market session and delay. Map provider
  identifiers before calling createAdapter(transport).snapshot({signal}).
- FX source and timestamp before any consolidated ILS valuation. Until then totals
  are per currency and incomplete valuations are labelled. No return calculation yet.

The adapter accepts {holdings: [{symbol,units,currency,sector}],
quotes: [{symbol,price,currency,asOf}], asOf}. It validates basic numeric/schema
requirements and rejects ambiguous duplicate quote symbols. This is an injection
boundary, not a completed provider integration. Provider-specific security and
pagination remain required before enabling it.

## Finance contract (confirmed with finance owner)

Read coreFacts.investmentCapacity only:
{amount: number|null, currency:'ILS', approved:boolean, calculatedAt:string|null,
validUntil:string|null, source:'manual'|'finance-adapter'|null, missingItems:string[]}.
No explicit, complete, unexpired approval means blocked. Assets and expected buyer
payments never substitute for approval. The investments UI does not edit this field.

## Conditions and safety

User-defined entryBelow / exitAbove are inclusive price thresholds, not orders or
recommendations. Missing, future-dated, older-than-24h, nonpositive or currency-mismatched
quotes produce unknown, never a trigger. 24h is a conservative initial freshness
policy, not a real-time promise; replace with provider/session rules on integration.
Conditions evaluate when data is loaded; no background monitoring or push alerts.
Concentration is sector share within each currency, not global portfolio risk.

## Verification

Run npm test and npm run build. Full authenticated preview journey must cover desktop
and mobile, adding/editing/deleting each entity, cancel/back navigation, reload
persistence, sync failure and keyboard focus. Do not deploy until preview checks pass.
