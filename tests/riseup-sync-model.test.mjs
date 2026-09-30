import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isIncomeEnvelope, summarizeEnvelopes, summarizeTransactions, setEnvelopeLabel, knownLabels,
  isSameAsLastSnapshot, buildSyncedSnapshot, markSyncFailed,
  RISEUP_STORE_KEY, RISEUP_INIT, UNLABELED, SAVINGS_LABEL, INCOME_LABEL,
} from "../companies/kesef/riseup-sync-model.js";

test("income detection: by amount sign per RiseUp's documented contract, not by type alone", () => {
  assert.equal(isIncomeEnvelope({ type: "variableIncome", originalAmount: 10000 }), true);
  assert.equal(isIncomeEnvelope({ type: "fixed", originalAmount: 12000 }), true); // סוג "fixed" בפועל, אבל סכום חיובי = הכנסה
  assert.equal(isIncomeEnvelope({ type: "fixed", originalAmount: -500 }), false);
  assert.equal(isIncomeEnvelope({ type: "trackingCategory", originalAmount: 0, balancedAmount: 200 }), true); // נופל ל-balancedAmount כשאין originalAmount תקין
  assert.equal(isIncomeEnvelope({ type: "riseupGoal", originalAmount: 500 }), false); // חריג: יעד חיסכון אף פעם לא הכנסה
  assert.equal(isIncomeEnvelope(null), false);
  assert.equal(isIncomeEnvelope({}), false);
});

test("summarizeEnvelopes: income excluded from byLabel, riseupGoal auto-labeled savings, unlabeled expense is honestly 'לא מתויג'", () => {
  const envelopes = [
    { id: "1", type: "fixed", originalAmount: -500, balancedAmount: -480 },
    { id: "2", type: "riseupGoal", originalAmount: -200, balancedAmount: -200 },
    { id: "3", type: "variableIncome", originalAmount: 10000, balancedAmount: 9500 },
    { id: "4", type: "trackingCategory", originalAmount: -50, balancedAmount: -60 },
    { id: "5", originalAmount: 0 }, // חסר type, סכום 0 - לא קורס
  ];
  const summary = summarizeEnvelopes(envelopes);
  assert.equal(summary.income.planned, 10000);
  assert.equal(summary.income.actual, 9500);
  const byLabel = Object.fromEntries(summary.byLabel.map(r => [r.label, r]));
  assert.equal(byLabel[UNLABELED].planned, 500 + 50 + 0);
  assert.equal(byLabel[UNLABELED].actual, 480 + 60 + 0);
  assert.equal(byLabel[UNLABELED].count, 3);
  assert.equal(byLabel[SAVINGS_LABEL].planned, 200);
});

test("summarizeEnvelopes: a custom label overrides 'לא מתויג' and groups by it, sorted by actual desc", () => {
  const envelopes = [
    { id: "a", type: "fixed", originalAmount: -100, balancedAmount: -100 },
    { id: "b", type: "fixed", originalAmount: -300, balancedAmount: -300 },
    { id: "c", type: "variable", originalAmount: -50, balancedAmount: -50 },
  ];
  const labels = { a: "סופר", b: "סופר", c: "דלק" };
  const summary = summarizeEnvelopes(envelopes, labels);
  assert.deepEqual(summary.byLabel.map(r => r.label), ["סופר", "דלק"]);
  assert.equal(summary.byLabel[0].actual, 400);
  assert.equal(summary.byLabel[0].count, 2);
  assert.equal(summary.byLabel[1].actual, 50);
});

test("summarizeEnvelopes: never crashes on missing/malformed input", () => {
  for (const bad of [null, undefined, "x", 5, [null, undefined, {}, { id: "z" }]]) {
    const summary = summarizeEnvelopes(bad, {});
    assert.equal(summary.income.count, 0);
    assert.ok(Array.isArray(summary.byLabel));
  }
});

test("summarizeTransactions: flattens envelope.actuals to date+business+amount+label rows, sorted newest first", () => {
  const envelopes = [
    { id: "e1", type: "fixed", actuals: [
      { id: "t1", date: "2026-09-10", business: "סופר A", amount: -50, isIncome: false },
      { id: "t2", date: "2026-09-15", business: "סופר B", amount: -30, isIncome: false },
    ] },
    { id: "e2", type: "riseupGoal", actuals: [{ id: "t3", date: "2026-09-12", business: "", amount: -200, isIncome: false }] },
    { id: "e3", type: "variableIncome", actuals: [{ id: "t4", date: "2026-09-01", business: "מעסיק", amount: 10000, isIncome: true }] },
  ];
  const labels = { e1: "סופר" };
  const rows = summarizeTransactions(envelopes, labels);
  assert.deepEqual(rows.map(r => r.id), ["t2", "t3", "t1", "t4"]); // מהחדש לישן: 15,12,10,01
  assert.equal(rows.find(r => r.id === "t1").label, "סופר"); // תיוג אישי של המעטפה
  assert.equal(rows.find(r => r.id === "t3").label, SAVINGS_LABEL); // riseupGoal אוטומטי
  assert.equal(rows.find(r => r.id === "t4").label, INCOME_LABEL); // isIncome גובר על תיוג המעטפה
});

test("summarizeTransactions: envelope without a personal label falls back to UNLABELED, never crashes on bad input", () => {
  assert.equal(summarizeTransactions([{ id: "e1", type: "fixed", actuals: [{ id: "t1", date: "2026-09-10", amount: -5, isIncome: false }] }], {})[0].label, UNLABELED);
  for (const bad of [null, undefined, "x", 5, [null, undefined, {}, { id: "z" }, { id: "e1", actuals: "not-array" }, { id: "e1", actuals: [null, "x", { id: "ok" }] }]]) {
    assert.doesNotThrow(() => summarizeTransactions(bad, {}));
  }
  assert.deepEqual(summarizeTransactions([{ id: "e1", actuals: [null, "x", { id: "ok" }] }], {}).map(r => r.id), ["ok"]);
});

test("setEnvelopeLabel: adds/updates/clears immutably, trims and caps length, ignores missing id", () => {
  let labels = setEnvelopeLabel({}, "e1", "  סופר  ");
  assert.deepEqual(labels, { e1: "סופר" });
  labels = setEnvelopeLabel(labels, "e2", "דלק");
  assert.deepEqual(labels, { e1: "סופר", e2: "דלק" });
  const cleared = setEnvelopeLabel(labels, "e1", "   ");
  assert.deepEqual(cleared, { e2: "דלק" });
  assert.deepEqual(labels, { e1: "סופר", e2: "דלק" }); // המקור לא השתנה (immutable)
  assert.deepEqual(setEnvelopeLabel(labels, "", "x"), labels);
  const long = setEnvelopeLabel({}, "e3", "א".repeat(200));
  assert.equal(long.e3.length, 40);
});

test("knownLabels: unique, sorted, no empties", () => {
  assert.deepEqual(knownLabels({ a: "סופר", b: "דלק", c: "סופר", d: "" }), ["דלק", "סופר"]);
  assert.deepEqual(knownLabels({}), []);
  assert.deepEqual(knownLabels(null), []);
});

test("isSameAsLastSnapshot: same budgetDate+cashflowHash = unchanged", () => {
  assert.equal(isSameAsLastSnapshot({ budgetDate: "2026-09", cashflowHash: "abc" }, { budgetDate: "2026-09", cashflowHash: "abc" }), true);
  assert.equal(isSameAsLastSnapshot({ budgetDate: "2026-09", cashflowHash: "abc" }, { budgetDate: "2026-09", cashflowHash: "xyz" }), false);
  assert.equal(isSameAsLastSnapshot(null, { budgetDate: "2026-09", cashflowHash: "abc" }), false);
});

test("buildSyncedSnapshot: unchanged hash -> changed:false but syncedAt still refreshed, raw envelopes kept as-is", () => {
  const response = { budgetDate: "2026-09", cashflowHash: "abc", lastUpdatedAt: "2026-09-20T00:00:00.000Z", envelopes: [{ id: "1" }] };
  const prev = { budgetDate: "2026-09", cashflowHash: "abc", envelopes: [{ id: "1" }], syncedAt: "2026-09-28T00:00:00.000Z", stale: true, staleReason: "old failure", staleAt: "x" };
  const now = () => "2026-09-29T00:00:00.000Z";
  const { snapshot, changed } = buildSyncedSnapshot(prev, response, now);
  assert.equal(changed, false);
  assert.equal(snapshot.syncedAt, "2026-09-29T00:00:00.000Z");
  assert.equal(snapshot.stale, false); // כשל קודם מנוקה כשמגיע ניסיון סנכרון (מוצלח, גם אם no-op)
  assert.deepEqual(snapshot.envelopes, [{ id: "1" }]);
});

test("buildSyncedSnapshot: changed hash -> new snapshot with the new envelopes, changed:true", () => {
  const response = { budgetDate: "2026-09", cashflowHash: "new-hash", envelopes: [{ id: "1", type: "fixed", originalAmount: -100, balancedAmount: -100 }] };
  const { snapshot, changed } = buildSyncedSnapshot({ budgetDate: "2026-09", cashflowHash: "old-hash", envelopes: [] }, response, () => "now");
  assert.equal(changed, true);
  assert.equal(snapshot.cashflowHash, "new-hash");
  assert.equal(snapshot.envelopes.length, 1);
  assert.equal(snapshot.summary, undefined); // הסיכום לא נשמר בצילום - מחושב חי מה-envelopes + התיוגים
});

test("markSyncFailed: previous snapshot kept as-is, only marked stale; null snapshot stays null", () => {
  const prev = { budgetDate: "2026-09", cashflowHash: "abc", envelopes: [{ id: "1" }] };
  const failed = markSyncFailed(prev, "רשת נפלה", () => "2026-09-29T00:00:00.000Z");
  assert.equal(failed.stale, true);
  assert.equal(failed.staleReason, "רשת נפלה");
  assert.deepEqual(failed.envelopes, [{ id: "1" }]);
  assert.equal(markSyncFailed(null, "x"), null);
});

test("RISEUP_INIT: includes empty envelopeLabels for backward-compatible defaults", () => {
  assert.deepEqual(RISEUP_INIT, { snapshot: null, lastError: null, envelopeLabels: {} });
  assert.equal(RISEUP_STORE_KEY, "hq:kesef:riseup-snapshot:v1");
});
