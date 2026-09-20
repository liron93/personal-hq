import assert from "node:assert/strict";
import test from "node:test";

const model = await import("../companies/beit-hadash/model.js");

test("default checklist has stable unique ids, valid groups and starts unchecked", () => {
  const list = model.DEFAULT_CHECKLIST;
  assert.ok(list.length >= 8);
  assert.equal(new Set(list.map(i => i.id)).size, list.length);
  assert.ok(list.every(i => model.CHECKLIST_GROUPS.includes(i.group) && i.text && i.done === false));
  assert.deepEqual(model.DEFAULT_CHECKLIST.map(i => i.id), model.DEFAULT_CHECKLIST.map(i => i.id)); // מזהים קבועים בין קריאות
});

test("fresh INIT carries the checklist and summarize() is unchanged by it", () => {
  assert.equal(model.INIT.checklist, model.DEFAULT_CHECKLIST);
  const before = model.summarize({ ...model.INIT, checklist: [] });
  const after = model.summarize(model.INIT);
  assert.deepEqual(before, after);
});
