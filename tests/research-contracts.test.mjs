import assert from "node:assert/strict";
import test from "node:test";
import { readdir, readFile } from "node:fs/promises";

const contracts = await import("../lib/research/contracts.js");
const fresh = await import("../lib/research/freshness.js");
const signal = await import("../lib/research/signal.js");
const guard = await import("../lib/research/server-guard.js");

const NOW = Date.parse("2026-09-20T12:00:00Z");
const quote = { symbol: "AAPL", price: 200.5, currency: "USD" };

test("contracts reject bad data and never fill in invented values", () => {
  assert.equal(contracts.validateQuote(quote).ok, true);
  assert.equal(contracts.validateQuote(quote).value.change, null);
  assert.equal(contracts.validateQuote({ symbol: "aapl", price: -1, currency: "usd" }).ok, false);
  const bad = contracts.validateCandles({ symbol: "AAPL", interval: "1d", candles: [
    { t: "2026-09-02T00:00:00Z", o: 1, h: 2, l: 0.5, c: 1.5 }, { t: "2026-09-01T00:00:00Z", o: 1, h: 2, l: 0.5, c: 1.5 }] });
  assert.equal(bad.ok, false); // זמנים לא עולים
  assert.equal(contracts.validateNews([{ headline: "x", publishedAt: "2026-09-20T00:00:00Z", url: "http://insecure" }]).ok, false);
  assert.equal(contracts.validateFundamentals({ symbol: "AAPL", peRatio: "12" }).ok, false);
});

test("fresh data is ok, old data is stale, missing data is empty", async () => {
  const ok = await fresh.resolveWithFallback({ kind: "quote", source: "p", maxAgeMs: 60_000, now: NOW, fetch: async () => ({ data: quote, asOf: "2026-09-20T11:59:30Z" }) });
  assert.equal(ok.status, "ok");
  const old = await fresh.resolveWithFallback({ kind: "quote", source: "p", maxAgeMs: 60_000, now: NOW, fetch: async () => ({ data: quote, asOf: "2026-09-19T11:59:30Z" }) });
  assert.equal(old.status, "stale");
  assert.equal(fresh.classify({ data: [], asOf: "2026-09-20T11:59:30Z", maxAgeMs: 1, now: NOW }), "empty");
});

test("provider failure falls back to cached data as stale with its ORIGINAL asOf, or to null", async () => {
  const cached = fresh.envelope({ status: "ok", source: "p", asOf: "2026-09-18T10:00:00Z", data: quote });
  const boom = async () => { throw new Error("503"); };
  const withCache = await fresh.resolveWithFallback({ kind: "quote", source: "p", maxAgeMs: 60_000, now: NOW, fetch: boom, cached });
  assert.equal(withCache.status, "stale");
  assert.equal(withCache.asOf, "2026-09-18T10:00:00Z");
  assert.match(withCache.error, /503/);
  const noCache = await fresh.resolveWithFallback({ kind: "quote", source: "p", maxAgeMs: 60_000, now: NOW, fetch: boom });
  assert.equal(noCache.status, "error");
  assert.equal(noCache.data, null);
  const invalid = await fresh.resolveWithFallback({ kind: "quote", source: "p", maxAgeMs: 60_000, now: NOW, fetch: async () => ({ data: { symbol: "AAPL" }, asOf: "2026-09-20T11:59:59Z" }) });
  assert.equal(invalid.status, "error"); // ספק שהחזיר זבל לא מייצר נתון
});

test("signal reports met / not met / unknown from USER conditions and carries no trading action", () => {
  const conditions = [
    signal.createCondition({ id: "pe", metric: "peRatio", operator: "lt", threshold: 25 }),
    signal.createCondition({ id: "growth", metric: "revenueGrowth", operator: "gte", threshold: 0.1 }),
    signal.createCondition({ id: "div", metric: "dividendYield", operator: "gt", threshold: 0.01 }),
  ];
  const out = signal.evaluateSignal({ symbol: "AAPL", conditions, metrics: { peRatio: 20, revenueGrowth: 0.05 }, thesis: "  שלי  ", now: NOW });
  assert.deepEqual(out.conditionsMet.map(c => c.id), ["pe"]);
  assert.deepEqual(out.conditionsNotMet.map(c => c.id), ["growth"]);
  assert.deepEqual(out.conditionsUnknown.map(c => c.id), ["div"]); // מדד חסר ≠ לא מתקיים
  assert.equal(out.thesis, "שלי");
  assert.equal(out.risks, null);
  assert.equal(signal.validateSignal(out).ok, true);
  assert.equal(signal.validateSignal({ ...out, action: "buy" }).ok, false);
  assert.throws(() => signal.evaluateSignal({ symbol: "AAPL", conditions: [{ ...conditions[0], sell: true }], metrics: {} }));
});

test("provider keys are server-only, never NEXT_PUBLIC, never hardcoded", async () => {
  assert.equal(guard.readProviderKey("FINNHUB_API_KEY", { FINNHUB_API_KEY: " abc " }), "abc");
  assert.equal(guard.readProviderKey("FINNHUB_API_KEY", {}), null);
  assert.throws(() => guard.readProviderKey("NEXT_PUBLIC_FINNHUB_API_KEY", { NEXT_PUBLIC_FINNHUB_API_KEY: "x" }));
  assert.throws(() => guard.readProviderKey("lower", {}));
  assert.deepEqual(guard.findExposedSecrets({ NEXT_PUBLIC_API_KEY: "x", NEXT_PUBLIC_SUPABASE_URL: "u", API_KEY: "y" }), ["NEXT_PUBLIC_API_KEY"]);
  globalThis.window = {};
  try { assert.throws(() => guard.readProviderKey("FINNHUB_API_KEY", { FINNHUB_API_KEY: "x" })); } finally { delete globalThis.window; }
  const patterns = [/AIza[0-9A-Za-z_\-]{20,}/, /\bsk-[A-Za-z0-9]{20,}/, /\bAQ\.[A-Za-z0-9_\-]{20,}/, /Bearer\s+[A-Za-z0-9._\-]{20,}/];
  for (const file of await readdir(new URL("../lib/research/", import.meta.url))) {
    const src = await readFile(new URL(`../lib/research/${file}`, import.meta.url), "utf8");
    for (const p of patterns) assert.doesNotMatch(src, p, `${file} looks like it contains a secret`);
  }
});
