import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capacity, condition, portfolio } from '../companies/investments/model.mjs';
import { createAdapter } from '../companies/investments/adapter.mjs';
const now=Date.parse('2026-09-14T12:00:00Z');
const q={symbol:'ABC',price:100,currency:'USD',asOf:'2026-09-14T11:00:00Z'};
test('capacity requires explicit current complete approval',()=>{
  const c={amount:1000,currency:'ILS',approved:true,source:'manual',missingItems:[],calculatedAt:'2026-09-14T10:00:00Z',validUntil:'2026-09-15T10:00:00Z'};
  assert.equal(capacity(c,now).amount,1000);
  for(const patch of [{amount:null},{approved:false},{missingItems:['reserve']},{validUntil:'2026-09-13'},{currency:'USD'},{amount:-1}])assert.equal(capacity({...c,...patch},now).status,'blocked');
  assert.equal(capacity(null,now).amount,null);
});
test('missing, stale, future and wrong-currency quotes never trigger conditions',()=>{
  const item={entryBelow:101,exitAbove:120,currency:'USD'};
  assert.equal(condition(item,q,now),'entry');
  assert.equal(condition(item,{...q,price:120},now),'exit');
  for(const invalid of [undefined,{...q,price:0},{...q,asOf:'2020-01-01'},{...q,asOf:'2030-01-01'},{...q,currency:'ILS'}])assert.equal(condition(item,invalid,now),'unknown');
});
test('portfolio keeps currencies separate and flags unpriced holdings',()=>{
  const result=portfolio([{symbol:'ABC',units:2,currency:'USD',sector:'Tech'},{symbol:'XYZ',units:3,currency:'ILS'},{symbol:'NONE',units:1,currency:'USD'}],{ABC:q,XYZ:{...q,symbol:'XYZ',currency:'ILS'}},now);
  assert.deepEqual(result.groups,{USD:200,ILS:300});assert.equal(result.missing,1);
});
test('adapter starts disconnected and rejects malformed responses',async()=>{
  assert.equal((await createAdapter().snapshot()).status,'disconnected');
  await assert.rejects(createAdapter(async()=>({holdings:[],quotes:[{...q,price:NaN}]})).snapshot());
  await assert.rejects(createAdapter(async()=>({holdings:[],quotes:[q,q]})).snapshot());
  const result=await createAdapter(async()=>({holdings:[],quotes:[q]})).snapshot();assert.equal(result.quotes.ABC.price,100);
});
