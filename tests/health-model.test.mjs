import { test } from "node:test";
import assert from "node:assert/strict";
import { INIT, importHevyWorkouts, summarize } from "../companies/health/model.js";
import { historyList } from "../companies/health/history.mjs";

const hevy = (id, title, date) => ({ hevySourceId: id, title, date, exercises: [{ name: "לחיצת חזה", sets: [{ reps: 10, weightKg: 60 }] }] });

test("importHevyWorkouts: מוסיף אימונים חדשים עם log.exercises[].sets[].{weight,reps} - אותה צורה בדיוק כמו live.mjs/finishLive", () => {
  const { state, importedCount, skippedCount } = importHevyWorkouts(INIT, [hevy("w1", "בוקר", "2026-10-01")]);
  assert.equal(importedCount, 1);
  assert.equal(skippedCount, 0);
  assert.equal(state.workouts.length, 1);
  const entry = state.workouts[0];
  assert.equal(entry.name, "בוקר");
  assert.equal(entry.date, "2026-10-01");
  assert.equal(entry.source, "hevy");
  assert.equal(entry.hevySourceId, "w1");
  assert.ok(entry.id);
  assert.equal(entry.log.exercises.length, 1);
  assert.equal(entry.log.exercises[0].name, "לחיצת חזה");
  assert.deepEqual(entry.log.exercises[0].sets, [{ weight: 60, reps: 10 }]);
});

test("importHevyWorkouts: דווח שהייבוא 'הגיע לעמוד ריק' - אימון מיובא חייב להופיע ב-historyList (התקדמות), לא רק להישמר", () => {
  const { state } = importHevyWorkouts(INIT, [hevy("w1", "בוקר", "2026-10-01")]);
  const list = historyList(state.workouts);
  assert.equal(list.length, 1);
  assert.equal(list[0].name, "לחיצת חזה");
  assert.equal(list[0].best.weight, 60);
});

test("importHevyWorkouts: אידמפוטנטי - ייבוא חוזר של אותם hevySourceId לא יוצר כפילויות", () => {
  const first = importHevyWorkouts(INIT, [hevy("w1", "בוקר", "2026-10-01"), hevy("w2", "ערב", "2026-10-02")]);
  assert.equal(first.state.workouts.length, 2);
  // "אישור יבוא" פעמיים ברצף על אותו Preview בדיוק - בדיוק התרחיש שעמית ביקש להגן עליו.
  const second = importHevyWorkouts(first.state, [hevy("w1", "בוקר", "2026-10-01"), hevy("w2", "ערב", "2026-10-02")]);
  assert.equal(second.state.workouts.length, 2); // לא גדל
  assert.equal(second.importedCount, 0);
  assert.equal(second.skippedCount, 2);
});

test("importHevyWorkouts: ייבוא חלקי - רק אימונים חדשים מתווספים, קיימים מדולגים", () => {
  const first = importHevyWorkouts(INIT, [hevy("w1", "בוקר", "2026-10-01")]);
  const second = importHevyWorkouts(first.state, [hevy("w1", "בוקר", "2026-10-01"), hevy("w2", "חדש", "2026-10-03")]);
  assert.equal(second.importedCount, 1);
  assert.equal(second.skippedCount, 1);
  assert.equal(second.state.workouts.length, 2);
});

test("importHevyWorkouts: לא נוגע באימונים ידניים קיימים (בלי hevySourceId)", () => {
  const manual = { ...INIT, workouts: [{ id: "m1", name: "הליכה", date: "2026-09-30" }] };
  const { state } = importHevyWorkouts(manual, [hevy("w1", "בוקר", "2026-10-01")]);
  assert.equal(state.workouts.length, 2);
  assert.ok(state.workouts.some(w => w.id === "m1"));
});

test("importHevyWorkouts: קלט ריק/לא תקין לא קורס, לא משנה כלום", () => {
  assert.deepEqual(importHevyWorkouts(INIT, []), { state: INIT, importedCount: 0, skippedCount: 0 });
  assert.deepEqual(importHevyWorkouts(INIT, null), { state: INIT, importedCount: 0, skippedCount: 0 });
  const withGarbage = importHevyWorkouts(INIT, [null, { title: "בלי hevySourceId" }, "לא אובייקט"]);
  assert.equal(withGarbage.importedCount, 0);
});

test("summarize: אימון שיובא מ-Hevy נספר כמו כל אימון אחר (weekWorkouts) - לא נדרש טיפול מיוחד", () => {
  const today = new Date().toISOString().slice(0, 10);
  const { state } = importHevyWorkouts(INIT, [hevy("w1", "בוקר", today)]);
  const sum = summarize(state);
  assert.equal(sum.weekWorkouts, 1);
});
