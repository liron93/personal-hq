import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEodhdService, usSymbol, normalizeBars } from '../lib/eodhd-service.mjs';
import { createMarketHandler } from '../lib/eodhd-handler.mjs';
const row={date:'2026-09-18',open:100,high:110,low:90,close:105,adjusted_close:104,volume:1000};
const now=()=>Date.parse('2026-09-21T12:00:00Z');
test('US symbols only; invalid payloads rejected',()=>{
  assert.equal(usSymbol('aapl.us'),'AAPL.US');assert.equal(usSymbol('BRK-B'),'BRK-B.US');
  for(const s of ['../secret','AAPL.TA','https://other','AAPL?x=1',''])assert.throws(()=>usSymbol(s));
  assert.equal(normalizeBars([row],'2025-09-22','2026-09-21')[0].adjustedClose,104);
  for(const data of [[],[row,row],[{...row,close:NaN}],[{...row,date:'2026-02-30'}],[{...row,low:200}]])assert.throws(()=>normalizeBars(data,'2025-09-22','2026-09-21'));
});
test('cache and concurrent dedup use one provider call, no token in output',async()=>{
  let calls=0;
  const service=createEodhdService({now,fetcher:async(url)=>{calls++;assert.equal(url.hostname,'eodhd.com');assert.equal(url.searchParams.get('api_token'),'secret-test');return Response.json([row]);}});
  const result=await Promise.all([service('AAPL','secret-test'),service('AAPL','secret-test')]);
  assert.equal(calls,1);assert.equal((await service('AAPL','secret-test')).cached,true);assert.doesNotMatch(JSON.stringify(result),/secret-test/);
});
test('provider errors sanitized; no automatic retries',async()=>{
  for(const status of [401,402,403,404,429,500]){
    let calls=0;const service=createEodhdService({now,fetcher:async()=>{calls++;return new Response('secret-token',{status});}});
    await assert.rejects(service('AAPL','key'),e=>!e.message.includes('secret-token'));assert.equal(calls,1);
  }
});
test('instance guard limits upstream requests to 15',async()=>{
  let calls=0;const service=createEodhdService({now,fetcher:async()=>{calls++;return Response.json([row]);}});
  for(let i=0;i<15;i++)await service(`S${i}`,'key');
  await assert.rejects(service('S16','key'),e=>e.status===429);assert.equal(calls,15);
});
test('auth and configuration gates precede upstream use',async()=>{
  let calls=0;const history=async()=>{calls++;return {bars:[]};};
  const req=()=>new Request('https://app.test/api/market/eodhd',{method:'POST',body:JSON.stringify({symbol:'AAPL'})});
  assert.equal((await createMarketHandler({authorize:async()=>false,configured:()=>true,history})(req())).status,401);
  assert.equal((await createMarketHandler({authorize:async()=>true,configured:()=>false,history})(req())).status,503);
  assert.equal(calls,0);
  const h=createMarketHandler({authorize:async()=>true,configured:()=>true,history});
  const status=await h(new Request('https://app.test/api/market/eodhd'));assert.equal((await status.json()).verified,false);assert.equal(calls,0);
  assert.equal((await h(req())).status,200);assert.equal(calls,1);
});
