import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mapEnvelopeCategory, isIncomeEnvelope, summarizeEnvelopes,
  isSameAsLastSnapshot, buildSyncedSnapshot, markSyncFailed,
  RISEUP_STORE_KEY, RISEUP_INIT,
} from "../companies/kesef/riseup-sync-model.js";
import { BUDGET_CATS_DEFAULT } from "../companies/kesef/model.js";

test("category mapping: documented decisions", () => {
  assert.equal(mapEnvelopeCategory({ type: "riseupGoal" }), "חיסכון");
  assert.equal(mapEnvelopeCategory({ type: "fixed" }), "אחר");
  assert.equal(mapEnvelopeCategory({ type: "trackingCategory" }), "אחר");
  assert.equal(mapEnvelopeCategory({ type: "variable" }), "אחר");
  assert.equal(mapEnvelopeCategory({ type: "variableIncome" }), null); // הכנסה - לא קטגוריית הוצאה
  assert.equal(isIncomeEnvelope({ type: "variableIncome" }), true);
  assert.equal(isIncomeEnvelope({ type: "fixed" }), false);
});

test("unknown/unrecognized type never crashes, falls back to אחר", () => {
  assert.equal(mapEnvelopeCategory({ type: "somethingNewFromRiseup" }), "אחר");
  assert.equal(mapEnvelopeCategory({}), "אחר");
  assert.equal(mapEnvelopeCategory(null), "אחר");
});

test("summarizeEnvelopes: income excluded from expense totals, amounts absolute, never crashes on bad input", () => {
  const envelopes = [
    { id: "1", type: "fixed", originalAmount: -500, balancedAmount: -480 },
    { id: "2", type: "riseupGoal", originalAmount: -200, balancedAmount: -200 },
    { id: "3", type: "variableIncome", originalAmount: 10000, balancedAmount: 9500 },
    { id: "4", type: "weirdUnknownType", originalAmount: -50, balancedAmount: -60 },
    { id: "5" }, // חסר type/amounts לגמרי
    null, // רשומה פגומה
  ];
  const summary = summarizeEnvelopes(envelopes);
  assert.equal(summary.byCategory["אחר"].planned, 500 + 50 + 0); // fixed + unknown + missing(0)
  assert.equal(summary.byCategory["אחר"].actual, 480 + 60 + 0);
  assert.equal(summary.byCategory["חיסכון"].planned, 200);
  assert.equal(summary.income.planned, 10000);
  assert.equal(summary.income.actual, 9500);
  // fixed/riseupGoal/variableIncome לא "לא מוכרים" - הם ידועים ומטופלים במפורש; type חסר לגמרי (רשומה 5) כן מדווח.
  assert.deepEqual(summary.unmappedTypes, ["weirdUnknownType", "(ללא סוג)"]);
  for (const cat of BUDGET_CATS_DEFAULT) assert.ok(cat in summary.byCategory);
});

test("summarizeEnvelopes: never crashes on non-array input", () => {
  for (const bad of [null, undefined, "x", 5, {}]) {
    const summary = summarizeEnvelopes(bad);
    assert.equal(summary.income.count, 0);
  }
});

test("dedupe: identical cashflowHash for the same month is a no-op", () => {
  const response = { budgetDate: "2026-09", cashflowHash: "abc", lastUpdatedAt: "2026-09-20T00:00:00Z", envelopes: [] };
  assert.equal(isSameAsLastSnapshot(null, response), false);
  const prev = { budgetDate: "2026-09", cashflowHash: "abc" };
  assert.equal(isSameAsLastSnapshot(prev, response), true);
  assert.equal(isSameAsLastSnapshot({ budgetDate: "2026-08", cashflowHash: "abc" }, response), false);
  assert.equal(isSameAsLastSnapshot({ budgetDate: "2026-09", cashflowHash: "different" }, response), false);
});

test("buildSyncedSnapshot: unchanged hash -> changed:false but syncedAt still refreshed", () => {
  const now = () => "2026-09-29T12:00:00.000Z";
  const prev = { budgetDate: "2026-09", cashflowHash: "abc", summary: { fake: true }, syncedAt: "2026-09-28T00:00:00.000Z", stale: true, staleReason: "old failure" };
  const response = { budgetDate: "2026-09", cashflowHash: "abc", lastUpdatedAt: "2026-09-20T00:00:00Z", envelopes: [] };
  const { snapshot, changed } = buildSyncedSnapshot(prev, response, now);
  assert.equal(changed, false);
  assert.equal(snapshot.syncedAt, "2026-09-29T12:00:00.000Z");
  assert.equal(snapshot.stale, false); // סנכרון הצליח עכשיו - stale מנוקה
  assert.deepEqual(snapshot.summary, { fake: true }); // הסיכום הישן נשמר, לא חושב מחדש (no-op אמיתי)
});

test("buildSyncedSnapshot: changed hash -> new summary built, changed:true", () => {
  const response = { budgetDate: "2026-09", cashflowHash: "new-hash", lastUpdatedAt: "2026-09-25T00:00:00Z", envelopes: [{ id: "1", type: "fixed", originalAmount: -100, balancedAmount: -100 }] };
  const { snapshot, changed } = buildSyncedSnapshot({ budgetDate: "2026-09", cashflowHash: "old-hash" }, response, () => "now");
  assert.equal(changed, true);
  assert.equal(snapshot.cashflowHash, "new-hash");
  assert.equal(snapshot.summary.byCategory["אחר"].planned, 100);
  assert.equal(snapshot.stale, false);
});

test("markSyncFailed: keeps previous snapshot visible, marks it stale with reason+timestamp; null stays null", () => {
  assert.equal(markSyncFailed(null, "reason"), null);
  const prev = { budgetDate: "2026-09", cashflowHash: "abc", summary: { x: 1 } };
  const failed = markSyncFailed(prev, "network error", () => "2026-09-29T13:00:00.000Z");
  assert.equal(failed.stale, true);
  assert.equal(failed.staleReason, "network error");
  assert.equal(failed.staleAt, "2026-09-29T13:00:00.000Z");
  assert.deepEqual(failed.summary, { x: 1 }); // הנתונים הישנים נשארים כפי שהם
});

test("store key + init shape", () => {
  assert.equal(RISEUP_STORE_KEY, "hq:kesef:riseup-snapshot:v1");
  assert.deepEqual(RISEUP_INIT, { snapshot: null, lastError: null });
});
