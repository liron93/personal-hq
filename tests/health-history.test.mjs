import assert from "node:assert/strict";
import test from "node:test";
import { normalizeName, exerciseHistory, lastPerformance, summarizeExercise, historyList } from "../companies/health/history.mjs";

// נתוני דמה מומצאים בלבד.
const wk = (date, exercises, createdAt = "") => ({ id: date, date, createdAt, log: { exercises } });
const ex = (name, sets, status = "pending") => ({ name, status, sets });
const S = (weight, reps) => ({ weight, reps });

const workouts = [
  wk("2026-09-01", [ex("תרגיל א", [S(20, 10), S(20, 8)]), ex("Test Exercise (Bar Grip)", [S(30, 10)])]),
  wk("2026-09-08", [ex("  תרגיל  א ", [S(22.5, 8), S(20, 10)]), ex("תרגיל ב", [S(null, 12)])]),
  wk("2026-09-15", [ex("test exercise (bar grip)", [S(32.5, 9)]), ex("תרגיל א", [], "skipped"), ex("תרגיל ב", [S(10, 12)])]),
  { id: "old", date: "2026-08-01", name: "אימון ישן בלי log" },
];

test("names normalize by case and whitespace", () => {
  assert.equal(normalizeName("  Test   Exercise (Bar Grip) "), "test exercise (bar grip)");
  assert.equal(normalizeName(null), "");
});

test("history groups by normalized name, skips skipped/empty, ignores old records without log", () => {
  const h = exerciseHistory(workouts);
  assert.equal(h.size, 3);
  assert.equal(h.get("תרגיל א").sessions.length, 2);
  assert.equal(h.get("test exercise (bar grip)").sessions.length, 2);
  assert.deepEqual(h.get("test exercise (bar grip)").sessions.map(s => s.date), ["2026-09-01", "2026-09-15"]);
  assert.equal(exerciseHistory([]).size, 0);
  assert.equal(exerciseHistory(undefined).size, 0);
});

test("lastPerformance returns the latest real sets (used for 'last time' in a live workout)", () => {
  const last = lastPerformance(workouts, "TEST EXERCISE (bar grip)");
  assert.equal(last.date, "2026-09-15");
  assert.deepEqual(last.sets, [S(32.5, 9)]);
  assert.equal(lastPerformance(workouts, "תרגיל א").date, "2026-09-08");
  assert.equal(lastPerformance(workouts, "לא קיים"), null);
});

test("summary: last, best (weight then reps) and a simple trend, informational only", () => {
  const h = exerciseHistory(workouts);
  const a = summarizeExercise(h.get("תרגיל א"));
  assert.deepEqual(a.best, { weight: 22.5, reps: 8, date: "2026-09-08" });
  assert.equal(a.last.date, "2026-09-08");
  assert.deepEqual(a.trend, { kind: "up", delta: 2.5, sessions: 2 });
  const t = summarizeExercise(h.get("test exercise (bar grip)"));
  assert.equal(t.trend.kind, "up");
  assert.equal(t.trend.delta, 2.5);
});

test("trend is insufficient with one weighted session; sets without weight are ignored, not zero", () => {
  const b = summarizeExercise(exerciseHistory(workouts).get("תרגיל ב"));
  assert.equal(b.sessions, 2);
  assert.deepEqual(b.best, { weight: 10, reps: 12, date: "2026-09-15" });
  assert.equal(b.trend.kind, "insufficient");
  const noW = summarizeExercise(exerciseHistory([wk("2026-09-01", [ex("תרגיל", [S(null, 5)])])]).get("תרגיל"));
  assert.equal(noW.best, null);
});

test("down and same trends", () => {
  const down = exerciseHistory([wk("2026-09-01", [ex("x", [S(30, 5)])]), wk("2026-09-08", [ex("x", [S(25, 5)])])]).get("x");
  assert.equal(summarizeExercise(down).trend.kind, "down");
  const same = exerciseHistory([wk("2026-09-01", [ex("x", [S(30, 5)])]), wk("2026-09-08", [ex("x", [S(30, 6)])])]).get("x");
  assert.equal(summarizeExercise(same).trend.kind, "same");
});

test("historyList is sorted by latest date", () => {
  const list = historyList(workouts);
  assert.equal(list.length, 3);
  assert.equal(list[0].last.date, "2026-09-15");
});

// ---------- גל (P1, ביקורת שחרור): חימום אינו סט עבודה; השוואה רק בטווח חזרות תואם ----------

test("warm-up sets (type != 'normal') never count toward best or trend", () => {
  const w = [
    wk("2026-09-01", [{ name: "סקוואט", status: "pending", sets: [{ weight: 20, reps: 5, type: "warmup" }, { weight: 60, reps: 5, type: "normal" }] }]),
    wk("2026-09-08", [{ name: "סקוואט", status: "pending", sets: [{ weight: 15, reps: 5, type: "warmup" }, { weight: 65, reps: 5, type: "normal" }] }]),
  ];
  const h = exerciseHistory(w).get("סקוואט");
  const s = summarizeExercise(h);
  assert.equal(s.best.weight, 65); // לא 20/15 (חימום) ולא מתערבב
  assert.deepEqual(s.trend, { kind: "up", delta: 5, sessions: 2 }); // 65-60, לא 15-20
});

test("sets without type (old data / manual live workouts) are treated as work sets - no regression", () => {
  // S() הקיים לא מגדיר type בכלל - בדיוק כמו סט שנרשם ידנית ב-live.mjs.
  const w = [wk("2026-09-01", [ex("משהו", [S(40, 10)])]), wk("2026-09-08", [ex("משהו", [S(45, 10)])])];
  const s = summarizeExercise(exerciseHistory(w).get("משהו"));
  assert.equal(s.trend.kind, "up");
  assert.equal(s.best.weight, 45);
});

test("no matching rep range between the oldest and newest session in the window => not_comparable, not a guessed trend", () => {
  const w = [
    wk("2026-09-01", [{ name: "לחיצת חזה", status: "pending", sets: [{ weight: 80, reps: 3, type: "normal" }] }]), // כוח מקסימלי, 3 חזרות
    wk("2026-09-08", [{ name: "לחיצת חזה", status: "pending", sets: [{ weight: 30, reps: 15, type: "normal" }] }]), // סבולת, 15 חזרות - אין קשר
  ];
  const s = summarizeExercise(exerciseHistory(w).get("לחיצת חזה"));
  assert.equal(s.trend.kind, "not_comparable");
  assert.equal(s.trend.delta, undefined);
});

test("rep tolerance: within 2 reps counts as comparable, beyond that does not", () => {
  const close = exerciseHistory([wk("2026-09-01", [ex("a", [S(50, 10)])]), wk("2026-09-08", [ex("a", [S(55, 12)])])]).get("a");
  assert.equal(summarizeExercise(close).trend.kind, "up"); // |12-10|=2, בטווח
  const far = exerciseHistory([wk("2026-09-01", [ex("b", [S(50, 10)])]), wk("2026-09-08", [ex("b", [S(55, 13)])])]).get("b");
  assert.equal(summarizeExercise(far).trend.kind, "not_comparable"); // |13-10|=3, מעבר לטווח
});
