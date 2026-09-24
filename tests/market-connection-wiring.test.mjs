import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// PR #97 lifted marketResult/marketSymbol into Company.jsx so the fetched result
// survived switching finance department tabs, but it was still lost on page reload
// and never distinguished "saved" from "actually verified". V1 replaces that with a
// real per-user persisted snapshot (companies/kesef/market-snapshot.js + lib/store.js),
// which survives both tab switches and reloads, so Company.jsx no longer needs to
// lift any market state at all.
const company = readFileSync(new URL('../companies/kesef/Company.jsx', import.meta.url), 'utf8');
const market = readFileSync(new URL('../companies/kesef/MarketConnection.jsx', import.meta.url), 'utf8');

test('Company.jsx no longer lifts ephemeral market result/symbol state', () => {
  assert.doesNotMatch(company, /marketResult|marketSymbol/);
  assert.match(company, /<MarketConnection\s*\/>/);
});

test('MarketConnection persists its snapshot through the shared per-user store, not local-only React state', () => {
  assert.match(market, /useStore\(STORE_KEY, null\)/);
  assert.match(market, /from '\.\/market-snapshot'/);
});

test('a failed test-connection attempt never clears the previously shown snapshot', () => {
  const body = market.slice(market.indexOf('async function testConnection'), market.indexOf('const connStatus'));
  assert.doesNotMatch(body, /setSnapshot\(null\)/);
  assert.match(body, /markStale/);
});

test('never claims "מחובר" (connected) anywhere in the UI copy', () => {
  assert.doesNotMatch(market, /מחובר/);
});

test('the end-of-day / not-real-time label is shown verbatim as required by the spec', () => {
  assert.match(market, /סוף יום — לא בזמן אמת/);
});
