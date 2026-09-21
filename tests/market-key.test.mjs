import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sealKey,openKey,keyCookie,encryptionReady,KEY_TTL} from '../lib/market-key.mjs';
import {createEodhdService} from '../lib/eodhd-service.mjs';
const secret='ab'.repeat(32);
test('encrypted credentials are user bound, expire and reject tampering',()=>{
  const sealed=sealKey('private-test-token','owner',secret,1000);
  assert.ok(!sealed.includes('private-test-token'));
  assert.equal(openKey(sealed,'owner',secret,1001),'private-test-token');
  assert.equal(openKey(sealed,'other-user',secret,1001),null);
  assert.equal(openKey(sealed,'owner','cd'.repeat(32),1001),null);
  assert.equal(openKey(sealed,'owner',secret,1000+KEY_TTL*1000),null);
  assert.equal(openKey('bad'+sealed,'owner',secret,1001),null);
  assert.equal(encryptionReady('short'),false);
  assert.match(keyCookie(sealed),/HttpOnly; SameSite=Strict/);
  assert.match(keyCookie(sealed),/; Secure$/);
  assert.match(keyCookie(''),/Max-Age=0/);
});
test('new credential never reuses another credential cache',async()=>{
  let calls=0;
  const service=createEodhdService({now:()=>Date.parse('2026-09-21'),fetcher:async()=>{calls++;return Response.json([{date:'2026-09-18',open:1,high:2,low:1,close:2,volume:10}]);}});
  await service('AAPL','first');await service('AAPL','second');
  assert.equal(calls,2);await service('AAPL','second');assert.equal(calls,2);
});
