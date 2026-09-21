import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthenticator, createApiGuard, parseAllowedUserIds, isDemoApiAllowed } from '../lib/server-auth.mjs';
import { createRateLimiter, readJsonBody } from '../lib/api-utils.mjs';
import { createEodhdAuthorizer } from '../lib/eodhd-auth.mjs';

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const req = (headers = {}) => new Request('https://app.test/api/x', { headers });
const bearer = t => ({ authorization: `Bearer ${t}` });
const quiet = () => {};

// createClient מזויף: אין רשת. tokens: מיפוי token -> תוצאת getUser.
function fakeCreateClient(tokens) {
  return () => ({ auth: { getUser: async token => tokens[token] || { data: { user: null }, error: { message: 'SECRET upstream text', status: 401 } } } });
}
const authOf = tokens => createAuthenticator({ createClient: fakeCreateClient(tokens), url: 'https://x.test', anonKey: 'anon' });
const okUser = id => ({ data: { user: { id, email: 'a@example.test' } }, error: null });

test('authenticator: missing / malformed header', async () => {
  const a = authOf({});
  for (const h of [{}, { authorization: 'Basic abc' }, { authorization: 'Bearer' }, { authorization: 'Bearer a b' }, { authorization: 'Bearer ' + 'a'.repeat(5000) }])
    assert.deepEqual(await a(req(h)), { ok: false, reason: 'missing_token' });
});

test('authenticator: invalid, expired, anonymous, throwing, unconfigured', async () => {
  const a = authOf({ expired: { data: { user: null }, error: { message: 'JWT expired' } }, anon: { data: { user: { id: ID_A, is_anonymous: true } }, error: null } });
  assert.equal((await a(req(bearer('nope')))).reason, 'invalid_token');
  assert.equal((await a(req(bearer('expired')))).reason, 'invalid_token');
  assert.equal((await a(req(bearer('anon')))).reason, 'invalid_token');
  const boom = createAuthenticator({ createClient: () => { throw new Error('net'); }, url: 'u', anonKey: 'k' });
  assert.equal((await boom(req(bearer('t')))).reason, 'auth_unavailable');
  const none = createAuthenticator({ createClient: fakeCreateClient({}), url: '', anonKey: '' });
  assert.equal((await none(req(bearer('t')))).reason, 'auth_not_configured');
  const good = await authOf({ t: okUser(ID_A) })(req(bearer('t')));
  assert.deepEqual(good, { ok: true, user: { id: ID_A, email: 'a@example.test' } });
});

test('parseAllowedUserIds keeps only UUID-shaped ids', () => {
  assert.equal(parseAllowedUserIds('').size, 0);
  assert.equal(parseAllowedUserIds(undefined).size, 0);
  assert.deepEqual([...parseAllowedUserIds(` ${ID_A} , junk,${ID_B}`)], [ID_A, ID_B]);
});

test('guard: 401 generic for missing/invalid, body leaks nothing', async () => {
  const guard = createApiGuard({ authenticate: authOf({}), env: {}, log: quiet });
  for (const h of [{}, bearer('bad')]) {
    const gate = await guard(req(h), { scope: 't' });
    assert.equal(gate.ok, false);
    assert.equal(gate.response.status, 401);
    assert.equal(gate.response.headers.get('cache-control'), 'private, no-store');
    const text = await gate.response.text();
    assert.doesNotMatch(text, /SECRET|supabase|SUPABASE|KEY|stack|token/i);
  }
});

test('guard: unconfigured/unavailable auth fails closed with generic 503', async () => {
  const guard = createApiGuard({ authenticate: async () => ({ ok: false, reason: 'auth_not_configured' }), env: {}, log: quiet });
  const gate = await guard(req(bearer('t')), { scope: 't' });
  assert.equal(gate.response.status, 503);
  assert.doesNotMatch(await gate.response.text(), /env|SUPABASE|configured/i);
  const thrower = createApiGuard({ authenticate: async () => { throw new Error('boom'); }, env: {}, log: quiet });
  assert.equal((await thrower(req(bearer('t')), { scope: 't' })).response.status, 503);
});

test('guard: allowlist off = any authenticated user; on = only listed (403 generic)', async () => {
  const authenticate = authOf({ a: okUser(ID_A), b: okUser(ID_B) });
  const open = createApiGuard({ authenticate, env: {}, log: quiet });
  assert.equal((await open(req(bearer('b')), { scope: 't' })).ok, true);
  const listed = createApiGuard({ authenticate, env: { API_ALLOWED_USER_IDS: ID_A }, log: quiet });
  assert.equal((await listed(req(bearer('a')), { scope: 't' })).ok, true);
  const denied = await listed(req(bearer('b')), { scope: 't' });
  assert.equal(denied.response.status, 403);
  assert.doesNotMatch(await denied.response.text(), new RegExp(`${ID_A}|${ID_B}|API_ALLOWED`));
  // רשימה שהוגדרה אך לא תקינה נכשלת סגור
  const broken = createApiGuard({ authenticate, env: { API_ALLOWED_USER_IDS: 'garbage' }, log: quiet });
  assert.equal((await broken(req(bearer('a')), { scope: 't' })).response.status, 403);
});

test('demo bypass: only outside production AND with explicit flag; never with a bad token', async () => {
  assert.equal(isDemoApiAllowed({ NODE_ENV: 'development', ALLOW_DEMO_API: '1' }), true);
  assert.equal(isDemoApiAllowed({ ALLOW_DEMO_API: '1' }), true);
  assert.equal(isDemoApiAllowed({ NODE_ENV: 'production', ALLOW_DEMO_API: '1' }), false);
  assert.equal(isDemoApiAllowed({ NODE_ENV: 'development' }), false);
  assert.equal(isDemoApiAllowed({ NODE_ENV: 'development', ALLOW_DEMO_API: 'true' }), false);
  assert.equal(isDemoApiAllowed({ NODE_ENV: 'development', ALLOW_DEMO_API: '1', VERCEL_ENV: 'preview' }), false);
  const mk = env => createApiGuard({ authenticate: authOf({}), env, log: quiet });
  assert.equal((await mk({ NODE_ENV: 'development', ALLOW_DEMO_API: '1' })(req(), { scope: 't' })).user.demo, true);
  assert.equal((await mk({ NODE_ENV: 'production', ALLOW_DEMO_API: '1' })(req(), { scope: 't' })).response.status, 401);
  // טוקן שגוי לא הופך לדמו
  assert.equal((await mk({ NODE_ENV: 'development', ALLOW_DEMO_API: '1' })(req(bearer('bad')), { scope: 't' })).response.status, 401);
  // allowDemo:false (EODHD)
  assert.equal((await mk({ NODE_ENV: 'development', ALLOW_DEMO_API: '1' })(req(), { scope: 't', allowDemo: false })).response.status, 401);
});

test('guard: per-user rate limit 429 with Retry-After, isolated per user', async () => {
  let t = 0;
  const limiter = createRateLimiter({ now: () => t });
  const guard = createApiGuard({ authenticate: authOf({ a: okUser(ID_A), b: okUser(ID_B) }), env: {}, limiter, log: quiet });
  const opt = { scope: 's', limit: 2, windowMs: 1000 };
  assert.equal((await guard(req(bearer('a')), opt)).ok, true);
  assert.equal((await guard(req(bearer('a')), opt)).ok, true);
  const limited = await guard(req(bearer('a')), opt);
  assert.equal(limited.response.status, 429);
  assert.ok(Number(limited.response.headers.get('retry-after')) >= 1);
  assert.equal((await guard(req(bearer('b')), opt)).ok, true);
  t = 1001;
  assert.equal((await guard(req(bearer('a')), opt)).ok, true);
});

test('readJsonBody: 413 by header and by streamed size, 400 for invalid JSON', async () => {
  const post = (body, headers = {}) => new Request('https://app.test/x', { method: 'POST', body, headers });
  assert.equal((await readJsonBody(post('{"a":1}'), 100)).value.a, 1);
  assert.equal((await readJsonBody(post('x'.repeat(50), { 'content-length': '5000' }), 100)).response.status, 413);
  assert.equal((await readJsonBody(post(JSON.stringify({ a: 'x'.repeat(500) })), 100)).response.status, 413);
  assert.equal((await readJsonBody(post('{bad'), 100)).response.status, 400);
});

test('eodhd authorizer: EODHD allowlist fails closed; demo never applies', async () => {
  const guard = createApiGuard({ authenticate: authOf({ a: okUser(ID_A) }), env: { NODE_ENV: 'development', ALLOW_DEMO_API: '1' }, log: quiet });
  const missing = createEodhdAuthorizer({ guard, env: {} });
  assert.equal((await missing(req(bearer('a')))).response.status, 403);
  const listed = createEodhdAuthorizer({ guard, env: { EODHD_ALLOWED_USER_IDS: ID_A } });
  assert.equal((await listed(req(bearer('a')))).ok, true);
  assert.equal((await listed(req())).response.status, 401);
});
