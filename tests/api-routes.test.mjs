import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBriefingHandler, createChatHandler, LIMITS } from '../lib/jarvis-handler.mjs';
import { createQuoteHandler } from '../lib/quote-handler.mjs';
import { createMarketHandler } from '../lib/eodhd-handler.mjs';

const denyGuard = status => async () => ({ ok: false, response: Response.json({ error: 'x' }, { status }) });
const allowGuard = async () => ({ ok: true, user: { id: 'u1' } });
const post = (body, url = 'https://app.test/api/jarvis', headers = {}) => new Request(url, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers });
const LEAK = /SECRET|GEMINI|FINNHUB|stack|at .*\.mjs|upstream-body/i;

function gemini(status = 200, text = '{"headline":"h","subtext":"s"}') {
  const calls = [];
  const fetcher = async (url, init) => { calls.push({ url: String(url), init }); return status === 200 ? Response.json({ candidates: [{ content: { parts: [{ text }] } }] }) : new Response('upstream-body SECRET', { status }); };
  return { calls, fetcher };
}
const sleep = async () => {};

const briefingBody = { urgentActions: [{ text: 'a' }], openTasks: 2, greeting: 'שלום', money: { income: 1 }, wellbeing: { load: 'low' } };
const chatBody = { messages: [{ role: 'user', text: 'מה המצב?' }], context: { money: { income: 1 } } };

for (const [name, make, body] of [['briefing', createBriefingHandler, briefingBody], ['chat', createChatHandler, chatBody]]) {
  test(`${name}: guard first - 401/403/429 never touch key, body or Gemini`, async () => {
    for (const status of [401, 403, 429]) {
      const g = gemini();
      let keyReads = 0;
      const h = make({ guard: denyGuard(status), getApiKey: () => { keyReads++; return 'k'; }, fetcher: g.fetcher, sleep });
      const res = await h(post('not even json'));
      assert.equal(res.status, status);
      assert.equal(g.calls.length, 0);
      assert.equal(keyReads, 0);
    }
  });

  test(`${name}: missing key -> generic 503; bad JSON 400; oversized 413`, async () => {
    const g = gemini();
    let res = await make({ guard: allowGuard, getApiKey: () => undefined, fetcher: g.fetcher, sleep })(post(body));
    assert.equal(res.status, 503);
    assert.doesNotMatch(await res.text(), LEAK);
    const h = make({ guard: allowGuard, getApiKey: () => 'k', fetcher: g.fetcher, sleep });
    assert.equal((await h(post('{oops'))).status, 400);
    assert.equal((await h(post('x'.repeat(200 * 1024)))).status, 413);
    assert.equal(g.calls.length, 0);
  });

  test(`${name}: 200 happy path, no-store, key only in header`, async () => {
    const g = gemini(200, name === 'briefing' ? '{"headline":"h","subtext":"s"}' : 'תשובה');
    const res = await make({ guard: allowGuard, getApiKey: () => 'test-key', fetcher: g.fetcher, sleep })(post(body));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'private, no-store');
    assert.equal(g.calls.length, 1);
    assert.equal(g.calls[0].init.headers['x-goog-api-key'], 'test-key');
    assert.ok(g.calls[0].init.signal, 'timeout signal set');
    assert.doesNotMatch(JSON.stringify(await res.json()), /test-key/);
  });

  test(`${name}: upstream 503 retried once; other errors sanitized`, async () => {
    let n = 0;
    const flaky = async () => (++n === 1 ? new Response('x', { status: 503 }) : Response.json({ candidates: [{ content: { parts: [{ text: name === 'briefing' ? '{"headline":"h","subtext":"s"}' : 'ok' }] } }] }));
    assert.equal((await make({ guard: allowGuard, getApiKey: () => 'k', fetcher: flaky, sleep })(post(body))).status, 200);
    assert.equal(n, 2);
    for (const status of [500, 400, 403]) {
      const g = gemini(status);
      const res = await make({ guard: allowGuard, getApiKey: () => 'k', fetcher: g.fetcher, sleep })(post(body));
      assert.equal(res.status, 502);
      assert.doesNotMatch(await res.text(), LEAK);
    }
    assert.equal((await make({ guard: allowGuard, getApiKey: () => 'k', fetcher: gemini(429).fetcher, sleep })(post(body))).status, 429);
    const throwing = async () => { throw new Error('SECRET network'); };
    const res = await make({ guard: allowGuard, getApiKey: () => 'k', fetcher: throwing, sleep })(post(body));
    assert.equal(res.status, 502);
    assert.doesNotMatch(await res.text(), LEAK);
  });
}

test('briefing: shape and length validation -> 400', async () => {
  const g = gemini();
  const h = createBriefingHandler({ guard: allowGuard, getApiKey: () => 'k', fetcher: g.fetcher, sleep });
  const bad = [
    [], { urgentActions: 'x' }, { ...briefingBody, greeting: 'x'.repeat(LIMITS.greeting + 1) }, { ...briefingBody, openTasks: 'many' },
    { ...briefingBody, money: [1, 2] }, { ...briefingBody, home: { blob: 'x'.repeat(LIMITS.contextPartBytes + 1) } },
    { ...briefingBody, urgentActions: Array(LIMITS.urgentActions * 5 + 1).fill({}) },
  ];
  for (const b of bad) assert.equal((await h(post(b))).status, 400, JSON.stringify(b).slice(0, 60));
  assert.equal(g.calls.length, 0);
  // הקטנת urgentActions ל-6 נשמרת
  const ok = await h(post({ ...briefingBody, urgentActions: Array(10).fill({ text: 'a' }) }));
  assert.equal(ok.status, 200);
  assert.equal(JSON.parse(g.calls[0].init.body).contents[0].parts[0].text.match(/"text": "a"/g).length, 6);
});

test('chat: shape and length validation -> 400', async () => {
  const g = gemini(200, 'ok');
  const h = createChatHandler({ guard: allowGuard, getApiKey: () => 'k', fetcher: g.fetcher, sleep });
  const u = text => ({ role: 'user', text });
  const bad = [
    {}, { messages: [] }, { messages: 'x' }, { messages: [{ role: 'system', text: 'x' }] }, { messages: [{ role: 'user', text: 5 }] },
    { messages: [u('x'.repeat(LIMITS.messageText + 1))] }, { messages: Array(LIMITS.messages + 1).fill(u('a')) },
    { messages: [{ role: 'model', text: 'hi' }] }, { messages: [u('a')], context: 'str' },
    { messages: [u('a')], context: { blob: 'x'.repeat(LIMITS.chatContextBytes + 1) } },
  ];
  for (const b of bad) assert.equal((await h(post(b))).status, 400, JSON.stringify(b).slice(0, 60));
  assert.equal(g.calls.length, 0);
  const long = Array.from({ length: 30 }, (_, i) => (i % 2 ? { role: 'model', text: 'm' } : u('q')));
  long.push(u('last'));
  assert.equal((await h(post({ messages: long }))).status, 200);
  assert.equal(JSON.parse(g.calls[0].init.body).contents.length, 2 + LIMITS.history);
});

test('quote: guard first; no key read, no upstream on 401/403/429', async () => {
  for (const status of [401, 403, 429]) {
    let calls = 0, keys = 0;
    const h = createQuoteHandler({ guard: denyGuard(status), getApiKey: () => { keys++; return 'k'; }, fetcher: async () => { calls++; return Response.json({}); } });
    assert.equal((await h(new Request('https://app.test/api/quote?symbol=AAPL'))).status, status);
    assert.equal(calls + keys, 0);
  }
});

test('quote: 400 for missing/invalid symbol, 503 without key (generic), 200 with header token', async () => {
  const seen = [];
  const fetcher = async (url, init) => {
    seen.push({ url: String(url), init });
    if (String(url).includes('/quote')) return Response.json({ c: 100, pc: 99 });
    if (String(url).includes('profile2')) return Response.json({ finnhubIndustry: 'Tech' });
    return Response.json({ metric: { peTTM: 20 } });
  };
  const url = s => new Request(`https://app.test/api/quote?symbol=${encodeURIComponent(s)}`);
  const h = createQuoteHandler({ guard: allowGuard, getApiKey: () => 'fh-test', fetcher });
  assert.equal((await h(new Request('https://app.test/api/quote'))).status, 400);
  for (const s of ['../x', 'A B', 'AAPL&token=1', 'A'.repeat(40)]) assert.equal((await h(url(s))).status, 400);
  assert.equal(seen.length, 0);
  const noKey = await createQuoteHandler({ guard: allowGuard, getApiKey: () => undefined, fetcher })(url('AAPL'));
  assert.equal(noKey.status, 503);
  assert.doesNotMatch(await noKey.text(), /FINNHUB|env|key/i);
  const ok = await h(url('aapl'));
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('cache-control'), 'private, no-store');
  const data = await ok.json();
  assert.equal(data.price, 100);
  assert.equal(data.peRatio, 20);
  assert.equal(seen.length, 3);
  for (const c of seen) { assert.ok(!c.url.includes('fh-test')); assert.equal(c.init.headers['X-Finnhub-Token'], 'fh-test'); assert.ok(c.init.signal); }
});

test('quote: upstream errors sanitized (502/404/429)', async () => {
  const mk = fetcher => createQuoteHandler({ guard: allowGuard, getApiKey: () => 'k', fetcher });
  const req = () => new Request('https://app.test/api/quote?symbol=AAPL');
  const bodyLeak = async () => new Response('upstream-body SECRET', { status: 500 });
  const r1 = await mk(bodyLeak)(req());
  assert.equal(r1.status, 502);
  assert.doesNotMatch(await r1.text(), LEAK);
  const r2 = await mk(async () => { throw new Error('SECRET dns'); })(req());
  assert.equal(r2.status, 502);
  assert.doesNotMatch(await r2.text(), LEAK);
  assert.equal((await mk(async () => new Response('x', { status: 429 }))(req())).status, 429);
  assert.equal((await mk(async () => Response.json({ c: 0, pc: 0 }))(req())).status, 404);
  const r3 = await mk(async () => new Response('<html>SECRET', { status: 200 }))(req());
  assert.equal(r3.status, 502);
  assert.doesNotMatch(await r3.text(), LEAK);
});

test('eodhd handler: POST body capped at 1KB (413) and bad JSON (400)', async () => {
  let calls = 0;
  const h = createMarketHandler({ authorize: async () => true, configured: () => true, history: async () => { calls++; return { bars: [] }; } });
  const mk = b => new Request('https://app.test/api/market/eodhd', { method: 'POST', body: b });
  assert.equal((await h(mk('x'.repeat(5000)))).status, 413);
  assert.equal((await h(mk('{bad'))).status, 400);
  assert.equal(calls, 0);
  assert.equal((await h(mk('{"symbol":"AAPL"}'))).status, 200);
});
