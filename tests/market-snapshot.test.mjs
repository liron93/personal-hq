import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STORE_KEY, buildSnapshot, markStale, clearStale, connectionStatus, STATUS, errorCategoryLabel,
} from '../companies/kesef/market-snapshot.js';

const history = {
  symbol: 'AAPL.US', provider: 'EODHD', asOf: '2026-09-18', fetchedAt: '2026-09-21T12:00:00.000Z',
  bars: [
    { date: '2026-09-16', open: 98, high: 101, low: 97, close: 99, adjustedClose: 99, volume: 900 },
    { date: '2026-09-17', open: 99, high: 103, low: 98, close: 100, adjustedClose: 100, volume: 950 },
    { date: '2026-09-18', open: 100, high: 110, low: 99, close: 105, adjustedClose: 104, volume: 1000 },
  ],
};

test('buildSnapshot computes change vs previous close, keeps source/timestamp/EOD fields, trims bars', () => {
  const snap = buildSnapshot(history);
  assert.equal(snap.symbol, 'AAPL.US');
  assert.equal(snap.provider, 'EODHD');
  assert.equal(snap.mode, 'end-of-day');
  assert.equal(snap.close, 105);
  assert.equal(snap.previousClose, 100);
  assert.equal(snap.changeAbs, 5);
  assert.equal(snap.changePct, 5);
  assert.equal(snap.asOf, '2026-09-18');
  assert.equal(snap.fetchedAt, '2026-09-21T12:00:00.000Z');
  assert.equal(snap.verifiedAt, snap.fetchedAt);
  assert.equal(snap.volume, 1000);
  assert.equal(snap.adjustedClose, 104);
  assert.equal(snap.stale, false);
  assert.deepEqual(snap.bars, [{ date: '2026-09-16', close: 99 }, { date: '2026-09-17', close: 100 }, { date: '2026-09-18', close: 105 }]);
  // לא בודים שדות של OHLC מלא בסדרה השמורה — רק תאריך+סגירה
  assert.equal(snap.bars[0].open, undefined);
});

test('buildSnapshot never fabricates: missing/short history yields explicit nulls, not guesses', () => {
  const oneBar = buildSnapshot({ symbol: 'X.US', fetchedAt: 't', bars: [{ date: '2026-09-18', close: 10, volume: 5 }] });
  assert.equal(oneBar.previousClose, null);
  assert.equal(oneBar.changeAbs, null);
  assert.equal(oneBar.changePct, null);
  assert.equal(oneBar.adjustedClose, null);
  const empty = buildSnapshot({ symbol: 'X.US', fetchedAt: 't', bars: [] });
  assert.equal(empty.close, null);
  assert.equal(empty.asOf, null);
  assert.deepEqual(empty.bars, []);
});

test('markStale keeps the previous data and verifiedAt, only flags staleness with a reason/time', () => {
  const snap = buildSnapshot(history);
  const stale = markStale(snap, { message: 'הספק דחה את המפתח', category: 'key_rejected', at: '2026-09-22T08:00:00.000Z' });
  assert.equal(stale.close, snap.close); // הנתון עצמו לא נמחק
  assert.equal(stale.verifiedAt, snap.verifiedAt); // עדיין מתי אומת בפועל לאחרונה
  assert.equal(stale.stale, true);
  assert.equal(stale.staleReason, 'הספק דחה את המפתח');
  assert.equal(stale.staleCategory, 'key_rejected');
  assert.equal(stale.staleSince, '2026-09-22T08:00:00.000Z');
  assert.equal(markStale(null), null);
});

test('clearStale is the only way back from needs_renewal, and only resets the stale flag', () => {
  const stale = markStale(buildSnapshot(history), { message: 'x', category: 'quota_rate_limit', at: 't2' });
  const cleared = clearStale(stale);
  assert.equal(cleared.stale, false);
  assert.equal(cleared.staleReason, null);
  assert.equal(cleared.staleCategory, null);
  assert.equal(cleared.staleSince, null);
  assert.equal(cleared.close, stale.close);
  assert.equal(clearStale(null), null);
});

test('connectionStatus never reports "verified" from configuration/cookie state alone', () => {
  assert.equal(connectionStatus({ configured: false, snapshot: null }), STATUS.NOT_CONFIGURED);
  assert.equal(connectionStatus({ configured: true, snapshot: null }), STATUS.SAVED_UNVERIFIED);
  const verified = buildSnapshot(history);
  assert.equal(connectionStatus({ configured: true, snapshot: verified }), STATUS.VERIFIED);
  // configured=true בלי snapshot אמיתי לעולם לא "מאומת" — זה בדיוק המקרה שאסור
  // להציג "מחובר" רק כי יש דגל/עוגייה.
  assert.notEqual(connectionStatus({ configured: true, snapshot: null }), STATUS.VERIFIED);
});

test('connectionStatus: needs_renewal after a failed refresh, even if the key is still saved', () => {
  const stale = markStale(buildSnapshot(history), { message: 'x', category: 'network_timeout', at: 't' });
  assert.equal(connectionStatus({ configured: true, snapshot: stale }), STATUS.NEEDS_RENEWAL);
});

test('full lifecycle: not configured → saved, unverified → verified → needs renewal', () => {
  let snapshot = null, configured = false;
  assert.equal(connectionStatus({ configured, snapshot }), STATUS.NOT_CONFIGURED);
  configured = true;
  assert.equal(connectionStatus({ configured, snapshot }), STATUS.SAVED_UNVERIFIED);
  snapshot = buildSnapshot(history);
  assert.equal(connectionStatus({ configured, snapshot }), STATUS.VERIFIED);
  snapshot = markStale(snapshot, { message: 'הספק דחה את המפתח', category: 'key_rejected', at: 't3' });
  assert.equal(connectionStatus({ configured, snapshot }), STATUS.NEEDS_RENEWAL);
});

test('errorCategoryLabel maps all five product categories to Hebrew labels, with a safe fallback', () => {
  for (const c of ['key_rejected', 'plan_permission', 'quota_rate_limit', 'invalid_symbol', 'network_timeout']) {
    assert.ok(errorCategoryLabel(c).length > 0);
  }
  assert.equal(errorCategoryLabel('made-up'), errorCategoryLabel('unknown'));
});

test('STORE_KEY is its own per-user key, separate from the shared finance company key', () => {
  assert.equal(STORE_KEY, 'hq:kesef:market-snapshot:v1');
});
