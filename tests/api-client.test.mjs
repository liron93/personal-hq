import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authHeaders, apiFetch, apiErrorMessage } from '../lib/api-client.mjs';

test('authHeaders: Bearer from session, empty without session or on failure', async () => {
  assert.deepEqual(await authHeaders(async () => ({ access_token: 'tok123' })), { Authorization: 'Bearer tok123' });
  assert.deepEqual(await authHeaders(async () => null), {});
  assert.deepEqual(await authHeaders(async () => ({ access_token: '' })), {});
  assert.deepEqual(await authHeaders(async () => { throw new Error('x'); }), {});
});

test('apiFetch attaches Authorization and preserves other headers/options', async () => {
  let seen;
  const fetcher = async (url, init) => { seen = { url, init }; return new Response('{}'); };
  await apiFetch('/api/quote?symbol=A', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }, { getSession: async () => ({ access_token: 'tok' }), fetcher });
  assert.equal(seen.url, '/api/quote?symbol=A');
  assert.equal(seen.init.headers.Authorization, 'Bearer tok');
  assert.equal(seen.init.headers['content-type'], 'application/json');
  assert.equal(seen.init.method, 'POST');
  await apiFetch('/api/x', {}, { getSession: async () => null, fetcher });
  assert.equal(seen.init.headers.Authorization, undefined);
});

test('apiErrorMessage: short Hebrew messages for 401/403/413/429', () => {
  assert.match(apiErrorMessage(401, 'raw'), /התחבר/);
  assert.match(apiErrorMessage(403, 'raw'), /הרשאה/);
  assert.match(apiErrorMessage(413), /גדולה/);
  assert.match(apiErrorMessage(429), /בקשות/);
  assert.equal(apiErrorMessage(502, 'הודעה'), 'הודעה');
  assert.equal(apiErrorMessage(500, undefined, 'ברירת מחדל'), 'ברירת מחדל');
});
