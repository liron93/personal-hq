import test from "node:test";
import assert from "node:assert/strict";
import { buildDailyCommand, horizon } from "../lib/dailyCommand.js";

const now = new Date("2026-09-14T10:00:00+03:00");
const [today, tomorrow, dayAfter] = horizon(now);

test("groups the next three days and preserves source ownership", () => {
  const view = buildDailyCommand([
    { id: "home-1", title: "לתאם מיזוג", source: "בית חדש", owner: "לירון", href: "/companies/beit-hadash", due: today, urgency: "high" },
    { id: "money-1", title: "להעביר תשלום", source: "כספים", owner: "לירון", href: "/companies/kesef", due: tomorrow },
    { id: "job-1", title: "לעדכן קורות חיים", source: "קריירה", owner: "לירון", href: "/companies/avoda", due: dayAfter },
  ], now);
  assert.equal(view.now.title, "לתאם מיזוג");
  assert.equal(view.today.length, 1);
  assert.equal(view.tomorrow[0].source, "כספים");
  assert.equal(view.dayAfterTomorrow[0].href, "/companies/avoda");
});

test("limits today to three and provides a relief action when overloaded", () => {
  const items = Array.from({ length: 4 }, (_, index) => ({ id: String(index), title: `פעולה ${index}`, source: "אוריה", due: today }));
  const view = buildDailyCommand(items, now);
  assert.equal(view.today.length, 3);
  assert.equal(view.overload.count, 4);
  assert.equal(view.overload.candidates.length, 1);
});

test("keeps waiting work outside of action lanes", () => {
  const view = buildDailyCommand([{ id: "vendor", title: "הצעת מחיר", source: "בית חדש", owner: "ספק", waiting: true, due: today }], now);
  assert.equal(view.today.length, 0);
  assert.equal(view.waiting[0].owner, "ספק");
});
