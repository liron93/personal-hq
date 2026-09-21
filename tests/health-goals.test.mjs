import assert from "node:assert/strict";
import test from "node:test";
import { cleanKg, cleanSteps, addWeighIn, removeWeighIn, addSteps, goalTarget, movingAverage, forecast, weekSummary, daysBetween } from "../companies/health/goals.mjs";

const wi = (date, kg) => ({ id: date, date, kg });
const TODAY = "2026-09-21";

test("input cleaning rejects nonsense and never guesses", () => {
  assert.equal(cleanKg("82,4"), 82.4);
  assert.equal(cleanKg("5"), null);
  assert.equal(cleanKg("abc"), null);
  assert.equal(cleanKg(""), null);
  assert.equal(cleanSteps("8,500"), 8500);
  assert.equal(cleanSteps("-1"), null);
  assert.equal(cleanSteps(""), null);
});

test("weigh-ins: one per date (replace), sorted, invalid ignored, removable", () => {
  let l = addWeighIn([], { date: "2026-09-10", kg: "80", id: "a", now: "t" });
  l = addWeighIn(l, { date: "2026-09-05", kg: "81", id: "b", now: "t" });
  l = addWeighIn(l, { date: "2026-09-10", kg: "79.5", id: "c", now: "t" });
  assert.deepEqual(l.map(x => [x.date, x.kg]), [["2026-09-05", 81], ["2026-09-10", 79.5]]);
  assert.equal(addWeighIn(l, { date: "bad", kg: 80, id: "z" }), l);
  assert.equal(addWeighIn(l, { date: "2026-09-11", kg: "x", id: "z" }), l);
  assert.equal(removeWeighIn(l, "b").length, 1);
  const s = addSteps(addSteps([], { date: "2026-09-10", count: "5000", id: "s1" }), { date: "2026-09-10", count: 7000, id: "s2" });
  assert.deepEqual(s.map(x => x.count), [7000]);
});

test("goalTarget prefers the explicit goal and falls back to the old baseline target", () => {
  assert.equal(goalTarget({ goal: { targetKg: "75" }, profile: { baseline: { targetWeight: "70" } } }), 75);
  assert.equal(goalTarget({ profile: { baseline: { targetWeight: "70" } } }), 70);
  assert.equal(goalTarget({}), null);
});

test("moving average uses a day window, not a count", () => {
  const ma = movingAverage([wi("2026-09-01", 80), wi("2026-09-03", 82), wi("2026-09-20", 78)], 7);
  assert.deepEqual(ma.map(p => p.avg), [80, 81, 78]);
  assert.deepEqual(ma.map(p => p.n), [1, 2, 1]);
  assert.deepEqual(movingAverage([], 7), []);
});

test("forecast refuses to guess with too little data", () => {
  assert.equal(forecast([], 75, TODAY).status, "insufficient");
  assert.equal(forecast([wi("2026-09-10", 80)], null, TODAY).status, "no-target");
  const few = forecast([wi("2026-09-01", 80), wi("2026-09-10", 79.5), wi("2026-09-20", 79)], 75, TODAY);
  assert.equal(few.status, "insufficient");
  assert.equal(few.reason, "points");
  const short = forecast([wi("2026-09-15", 80), wi("2026-09-16", 79.9), wi("2026-09-17", 79.8), wi("2026-09-18", 79.7)], 75, TODAY);
  assert.equal(short.reason, "span");
  const stale = forecast([wi("2026-08-01", 82), wi("2026-08-08", 81), wi("2026-08-15", 80.5), wi("2026-08-22", 80)], 75, TODAY);
  assert.equal(stale.reason, "stale");
});

test("forecast gives a date RANGE from a real downward trend", () => {
  const data = [wi("2026-08-24", 84.0), wi("2026-08-31", 83.6), wi("2026-09-07", 83.1), wi("2026-09-14", 82.7), wi("2026-09-20", 82.2)];
  const f = forecast(data, 78, TODAY);
  assert.equal(f.status, "range");
  assert.ok(f.slopePerWeek < 0 && f.slopePerWeek > -1);
  assert.ok(f.from <= (f.to || "9999"), "from must not exceed to");
  assert.ok(f.from >= TODAY);
  const days = daysBetween(TODAY, f.from);
  assert.ok(days > 30 && days < 200, "days=" + days);
});

test("noisy data widens the range or leaves it open-ended", () => {
  const noisy = [wi("2026-08-24", 84), wi("2026-08-29", 85.5), wi("2026-09-03", 83), wi("2026-09-10", 85), wi("2026-09-15", 83.5), wi("2026-09-20", 84.5)];
  const f = forecast(noisy, 80, TODAY);
  assert.ok(["range", "stable", "away"].includes(f.status));
  if (f.status === "range") assert.ok(f.openEnded || daysBetween(f.from, f.to) > 30);
});

test("forecast: away, stable, reached", () => {
  const up = [wi("2026-08-24", 80), wi("2026-08-31", 80.5), wi("2026-09-07", 81), wi("2026-09-14", 81.6), wi("2026-09-20", 82)];
  assert.equal(forecast(up, 75, TODAY).status, "away");
  const flat = [wi("2026-08-24", 80), wi("2026-08-31", 80), wi("2026-09-07", 80), wi("2026-09-14", 80), wi("2026-09-20", 80)];
  assert.equal(forecast(flat, 75, TODAY).status, "stable");
  const at = [wi("2026-08-24", 76), wi("2026-08-31", 75.6), wi("2026-09-07", 75.2), wi("2026-09-14", 74.9), wi("2026-09-20", 74.8)];
  assert.equal(forecast(at, 75, TODAY).status, "reached");
});

test("weekSummary: Sunday-based week, real data only, no fake zeros for steps/weight", () => {
  const data = {
    profile: { baseline: { weeklyWorkoutGoal: "3", weeklyFoodGoal: "5", weeklyStepGoal: "7000" } },
    workouts: [{ date: "2026-09-20" }, { date: "2026-09-21" }, { date: "2026-09-22", skipped: true }, { date: "2026-09-19" }],
    meals: [{ date: "2026-09-20" }, { date: "2026-09-20" }, { date: "2026-09-22" }, { date: "2026-09-13" }],
    steps: [{ date: "2026-09-20", count: 6000 }, { date: "2026-09-21", count: 8000 }],
    weighIns: [wi("2026-09-14", 83), wi("2026-09-16", 82), wi("2026-09-21", 81.5)],
  };
  const w = weekSummary(data, "2026-09-23");
  assert.equal(w.start, "2026-09-20");
  assert.equal(w.end, "2026-09-26");
  assert.deepEqual([w.workouts, w.workoutGoal, w.foodDays, w.foodGoal], [2, 3, 2, 5]);
  assert.deepEqual([w.stepsAvg, w.stepDays, w.stepGoal], [7000, 2, 7000]);
  assert.deepEqual([w.weighIns, w.weightAvg, w.weightChange], [1, 81.5, -1]);
  const empty = weekSummary({}, "2026-09-23");
  assert.equal(empty.stepsAvg, null);
  assert.equal(empty.weightAvg, null);
  assert.equal(empty.weightChange, null);
  assert.equal(empty.workouts, 0);
});
