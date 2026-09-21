import test from "node:test";
import assert from "node:assert/strict";
import { itemTotal, linesTotal, summarize, INIT } from "../companies/beit-hadash/model.js";

test("רכישה בלי שורות נשארת כמו קודם: עלות סופית, אחרת הערכה", () => {
  assert.equal(itemTotal({ estimate: 100, finalCost: 0 }), 100);
  assert.equal(itemTotal({ estimate: 100, finalCost: 80 }), 80);
  assert.equal(itemTotal({}), 0);
});

test("סכום פירוט: כמות × מחיר, בלי שורות שנפסלו", () => {
  const lines = [{ price: 1000, qty: 2, status: "נבחר" }, { price: 500, qty: 1, status: "נפסל" }, { price: 300, qty: 0 }, { price: "", qty: 3 }];
  assert.equal(linesTotal({ lines }), 2300);
  assert.equal(itemTotal({ estimate: 9999, lines }), 2300);
});

test("עלות סופית גוברת על סכום הפירוט", () => {
  assert.equal(itemTotal({ finalCost: 5000, estimate: 1, lines: [{ price: 100, qty: 1 }] }), 5000);
});

test("summarize מתחשב בפירוט ולא נשבר על נתונים ישנים", () => {
  const data = { ...INIT, items: [{ ...INIT.items[0], estimate: 30000, finalCost: 0, lines: [{ price: 4000, qty: 1, status: "נבחר" }], payments: [] }, { ...INIT.items[1], payments: [] }] };
  assert.equal(summarize(data).renovation.planned, 4000 + INIT.items[1].estimate);
  assert.equal(summarize(INIT).renovation.planned, 120000);
});
