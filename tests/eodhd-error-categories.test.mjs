import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEodhdService, categorizeUpstreamStatus, ERROR_CATEGORIES } from '../lib/eodhd-service.mjs';
import { createMarketHandler } from '../lib/eodhd-handler.mjs';

const now = () => Date.parse('2026-09-21T12:00:00Z');
const row = { date: '2026-09-18', open: 100, high: 110, low: 90, close: 105, adjusted_close: 104, volume: 1000 };

test('categorizeUpstreamStatus maps the actual EODHD status codes to the five product categories', () => {
  assert.equal(categorizeUpstreamStatus(401), ERROR_CATEGORIES.KEY_REJECTED);
  assert.equal(categorizeUpstreamStatus(402), ERROR_CATEGORIES.PLAN_PERMISSION);
  assert.equal(categorizeUpstreamStatus(403), ERROR_CATEGORIES.PLAN_PERMISSION);
  assert.equal(categorizeUpstreamStatus(429), ERROR_CATEGORIES.QUOTA_RATE_LIMIT);
  assert.equal(categorizeUpstreamStatus(404), ERROR_CATEGORIES.INVALID_SYMBOL);
  assert.equal(categorizeUpstreamStatus(500), ERROR_CATEGORIES.UNKNOWN);
});

test('service attaches the right category to each upstream failure (wrong key, plan, quota, invalid symbol)', async () => {
  const cases = [
    [401, ERROR_CATEGORIES.KEY_REJECTED],
    [402, ERROR_CATEGORIES.PLAN_PERMISSION],
    [403, ERROR_CATEGORIES.PLAN_PERMISSION],
    [429, ERROR_CATEGORIES.QUOTA_RATE_LIMIT],
    [404, ERROR_CATEGORIES.INVALID_SYMBOL],
    [500, ERROR_CATEGORIES.UNKNOWN],
  ];
  for (const [status, category] of cases) {
    const service = createEodhdService({ now, fetcher: async () => new Response('upstream body', { status }) });
    await assert.rejects(service('AAPL', 'key'), e => e.category === category && !e.message.includes('upstream body'));
  }
});

test('a network failure/timeout from the fetcher is categorized as network_timeout, not a generic error', async () => {
  const service = createEodhdService({ now, fetcher: async () => { throw new Error('ETIMEDOUT'); } });
  await assert.rejects(service('AAPL', 'key'), e => e.category === ERROR_CATEGORIES.NETWORK_TIMEOUT);
});

test('a malformed upstream body (bad JSON, bad shape) is categorized as unknown, not silently swallowed', async () => {
  const badJson = createEodhdService({ now, fetcher: async () => new Response('not json', { status: 200 }) });
  await assert.rejects(badJson('AAPL', 'key'), e => e.category === ERROR_CATEGORIES.UNKNOWN);

  const badShape = createEodhdService({ now, fetcher: async () => Response.json({ not: 'an array' }) });
  await assert.rejects(badShape('AAPL', 'key'), e => e.category === ERROR_CATEGORIES.UNKNOWN);
});

test('an unknown/missing symbol with no data in range is categorized as invalid_symbol', async () => {
  const service = createEodhdService({ now, fetcher: async () => Response.json([]) });
  await assert.rejects(service('ZZZZ', 'key'), e => e.category === ERROR_CATEGORIES.INVALID_SYMBOL && e.status === 404);
});

test('the server’s own 15/day protective guard is categorized as quota_rate_limit', async () => {
  const service = createEodhdService({ now, fetcher: async () => Response.json([row]) });
  for (let i = 0; i < 15; i++) await service(`S${i}`, 'key');
  await assert.rejects(service('S16', 'key'), e => e.category === ERROR_CATEGORIES.QUOTA_RATE_LIMIT && e.status === 429);
});

test('a missing key is categorized as not_configured', async () => {
  const service = createEodhdService({ now, fetcher: async () => Response.json([row]) });
  await assert.rejects(service('AAPL', ''), e => e.category === ERROR_CATEGORIES.NOT_CONFIGURED);
  await assert.rejects(service('AAPL', 'demo'), e => e.category === ERROR_CATEGORIES.NOT_CONFIGURED);
});

test('the route handler forwards the category in the JSON error body for a real fake-injected failure', async () => {
  const service = createEodhdService({ now, fetcher: async () => new Response('', { status: 401 }) });
  const handler = createMarketHandler({ authorize: async () => true, configured: () => true, history: symbol => service(symbol, 'wrong-key') });
  const req = () => new Request('https://app.test/api/market/eodhd', { method: 'POST', body: JSON.stringify({ symbol: 'AAPL' }) });
  const res = await handler(req());
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.category, ERROR_CATEGORIES.KEY_REJECTED);
});

test('a successful call returns real data with no category field and no credential leakage', async () => {
  const service = createEodhdService({ now, fetcher: async () => Response.json([row]) });
  const handler = createMarketHandler({ authorize: async () => true, configured: () => true, history: symbol => service(symbol, 'secret-key') });
  const req = () => new Request('https://app.test/api/market/eodhd', { method: 'POST', body: JSON.stringify({ symbol: 'AAPL' }) });
  const res = await handler(req());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.category, undefined);
  assert.doesNotMatch(JSON.stringify(body), /secret-key/);
});

test('an unexpected non-MarketError failure still gets a safe generic category, never a raw error message', async () => {
  const handler = createMarketHandler({ authorize: async () => true, configured: () => true, history: async () => { throw new TypeError('boom: internal stack trace detail'); } });
  const req = () => new Request('https://app.test/api/market/eodhd', { method: 'POST', body: JSON.stringify({ symbol: 'AAPL' }) });
  const res = await handler(req());
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.equal(body.category, ERROR_CATEGORIES.UNKNOWN);
  assert.doesNotMatch(body.error, /boom|stack trace/);
});
