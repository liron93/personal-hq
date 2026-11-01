import assert from "node:assert/strict";
import test from "node:test";
import { mergeHousehold } from "../companies/household/merge.mjs";

const item = (id, name, extra = {}) => ({ id, name, qty: null, note: "", createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T10:00:00Z", ...extra });
const state = (items = [], history = [], extra = {}) => ({ items, history, receipts: [], vouchers: [], categoryDict: {}, monthlyBudget: null, ...extra });
const names = list => list.map(i => i.name);

test("שניהם הוסיפו פריטים במקביל: שניהם נשמרים", () => {
  const base = state([item("a", "חלב")]);
  const mine = state([item("a", "חלב"), item("m", "לחם")]);
  const theirs = state([item("a", "חלב"), item("t", "ביצים")]);
  assert.deepEqual(names(mergeHousehold(base, mine, theirs).items).sort(), ["ביצים", "חלב", "לחם"].sort());
});

test("אני סימנתי נרכש בסופר והיא הוסיפה פריט: הרכישה נשמרת והפריט שלה לא נעלם", () => {
  const base = state([item("a", "חלב"), item("b", "גבינה")]);
  const bought = { id: "a", name: "חלב", purchasedAt: "2026-10-30T12:00:00Z", price: null };
  const mine = state([item("b", "גבינה")], [bought]);
  const theirs = state([item("a", "חלב"), item("b", "גבינה"), item("t", "ביצים")]);
  const out = mergeHousehold(base, mine, theirs);
  assert.deepEqual(names(out.items).sort(), ["ביצים", "גבינה"].sort());
  assert.deepEqual(out.history.map(h => h.id), ["a"]);
});

test("היא קנתה והוא ערך את אותו פריט: אין פריט גם ברשימה וגם בהיסטוריה", () => {
  const base = state([item("a", "חלב")]);
  const mine = state([item("a", "חלב", { note: "3%", updatedAt: "2026-10-30T12:00:00Z" })]);
  const theirs = state([], [{ id: "a", name: "חלב", purchasedAt: "2026-10-30T12:01:00Z" }]);
  const out = mergeHousehold(base, mine, theirs);
  assert.equal(out.items.length, 0);
  assert.equal(out.history.length, 1);
});

test("שניהם סימנו את אותו פריט כנרכש: רשומת היסטוריה אחת, לא כפולה", () => {
  const base = state([item("a", "חלב")]);
  const mine = state([], [{ id: "a", name: "חלב", purchasedAt: "2026-10-30T12:00:00Z" }]);
  const theirs = state([], [{ id: "a", name: "חלב", purchasedAt: "2026-10-30T12:00:05Z" }]);
  assert.equal(mergeHousehold(base, mine, theirs).history.length, 1);
});

test("שינוי שדות שונים באותו פריט: שניהם נשמרים", () => {
  const base = state([item("a", "חלב")]);
  const mine = state([item("a", "חלב", { qty: 2, updatedAt: "2026-10-30T12:00:00Z" })]);
  const theirs = state([item("a", "חלב", { note: "בקבוק", updatedAt: "2026-10-30T12:01:00Z" })]);
  const [m] = mergeHousehold(base, mine, theirs).items;
  assert.equal(m.qty, 2);
  assert.equal(m.note, "בקבוק");
});

test("אותו שדה שונה בשני הצדדים: המאוחר לפי updatedAt גובר", () => {
  const base = state([item("a", "חלב", { qty: 1 })]);
  const mine = state([item("a", "חלב", { qty: 2, updatedAt: "2026-10-30T12:00:00Z" })]);
  const theirs = state([item("a", "חלב", { qty: 5, updatedAt: "2026-10-30T12:05:00Z" })]);
  assert.equal(mergeHousehold(base, mine, theirs).items[0].qty, 5);
});

test("מחיקה של אחד הצדדים נשמרת", () => {
  const base = state([item("a", "חלב"), item("b", "גבינה")]);
  const mineDeleted = state([item("b", "גבינה")]);
  const theirsAdded = state([item("a", "חלב"), item("b", "גבינה"), item("t", "ביצים")]);
  assert.deepEqual(names(mergeHousehold(base, mineDeleted, theirsAdded).items).sort(), ["ביצים", "גבינה"].sort());
  const theirsDeleted = state([item("b", "גבינה")]);
  const mineEdited = state([item("a", "חלב", { qty: 3 }), item("b", "גבינה")]);
  assert.deepEqual(names(mergeHousehold(base, mineEdited, theirsDeleted).items), ["גבינה"]);
});

test("בלי שינוי אצל אחד הצדדים מקבלים את השני כמו שהוא; בלי base אפשר רק להוסיף", () => {
  const base = state([item("a", "חלב")]);
  const theirs = state([item("a", "חלב"), item("t", "ביצים")]);
  assert.equal(mergeHousehold(base, base, theirs), theirs);
  const mine = state([item("m", "לחם")]);
  assert.equal(mergeHousehold(null, mine, theirs).items.length, 3);
});

test("שדות כלליים ומילון קטגוריות ממוזגים; שוברים נוספים משני הצדדים נשמרים", () => {
  const base = state([], [], { monthlyBudget: 1000, categoryDict: { חלב: "מוצרי חלב" } });
  const mine = state([], [], { monthlyBudget: 1200, categoryDict: { חלב: "מוצרי חלב", לחם: "מאפים" }, vouchers: [{ id: "v1", name: "א" }] });
  const theirs = state([], [], { monthlyBudget: 1000, categoryDict: { חלב: "מוצרי חלב", ביצים: "ביצים" }, vouchers: [{ id: "v2", name: "ב" }] });
  const out = mergeHousehold(base, mine, theirs);
  assert.equal(out.monthlyBudget, 1200);
  assert.deepEqual(Object.keys(out.categoryDict).sort(), ["ביצים", "חלב", "לחם"].sort());
  assert.deepEqual(out.vouchers.map(v => v.id).sort(), ["v1", "v2"]);
});
