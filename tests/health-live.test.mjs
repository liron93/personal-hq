import assert from "node:assert/strict";
import test from "node:test";
import { resolveProgram, importFromText, emptyProgram, normalizeProgram, updateExercise, addExercise, removeExercise, moveExercise, addSession, removeSession, applyLoads, cleanLoad } from "../companies/health/plan.mjs";
import * as L from "../companies/health/live.mjs";
import { todayState } from "../companies/health/today.mjs";

// נתוני דמה מומצאים בלבד.
const TEXT = `A
תרגיל א | 3 | 8-12 | 20/20/10
תרגיל ב | 2 | 10
תרגיל ג | 2 | 12 | 15/טרם נקבע
תרגיל ד | 2 | 8-10 | טרם נקבע
B
תרגיל ה | 2 | 8-12 | 10
תרגיל ו | 2 | 8-12
תרגיל ז | 2 | 8-12
C
תרגיל ח | 2 | 8-12`;
const gym = { complete: true };
const base = importFromText(TEXT, "2026-09-21").program;
const T0 = Date.parse("2026-09-21T08:00:00.000Z");
const program = resolveProgram({ profile: gym, program: base });
const fresh = () => L.startLive(program, "A", { id: "w1", now: T0, workouts: [] });

test("resolveProgram: empty without a stored program, stored program otherwise", () => {
  assert.equal(resolveProgram({ profile: gym }).empty, true);
  assert.deepEqual(program.ids, ["A", "B", "C"]);
  assert.deepEqual(program.sessions.A[0].loads, ["20", "20", "10"]);
});

test("weights: positive numbers only, 0 is not a weight, nothing is invented", () => {
  assert.equal(cleanLoad("0"), null);
  assert.equal(cleanLoad("0.0"), null);
  assert.equal(cleanLoad("כבד"), null);
  assert.equal(cleanLoad(""), null);
  assert.equal(cleanLoad("-5"), null);
  assert.equal(cleanLoad("22,5"), "22.5");
  assert.equal(cleanLoad(40), "40");
  assert.deepEqual(program.sessions.A[1].loads, [null, null]);
  assert.deepEqual(program.sessions.A[3].loads, [null, null]);
});

test("safety restriction overrides any stored program", () => {
  assert.equal(resolveProgram({ profile: { safety: "לא בטוח/ה" }, program: base }).restricted, true);
  assert.equal(todayState({ profile: { sensitiveFlag: true }, program: base, workouts: [] }, "2026-09-21").status, "restricted");
});

test("normalizeProgram: repairs bounds, never invents reps or weights, legacy single weight fills all sets", () => {
  assert.equal(normalizeProgram(null), null);
  assert.equal(normalizeProgram({ sessions: { A: [{ name: "  " }] } }), null);
  const n = normalizeProgram({ sessions: { A: [{ name: "תרגיל", sets: 99, reps: "", load: "abc", rest: 1 }, { name: "תרגיל", id: "A1" }] } });
  assert.equal(n.sessions.A[0].sets, 10);
  assert.equal(n.sessions.A[0].reps, "");
  assert.deepEqual(n.sessions.A[0].loads, Array(10).fill(null));
  assert.equal(n.sessions.A[0].rest, 15);
  assert.equal(new Set(n.sessions.A.map(e => e.id)).size, 2);
  const legacy = normalizeProgram({ sessions: { A: [{ name: "תרגיל ישן", sets: 3, reps: "8–12", load: "40" }, { name: "תרגיל ישן 2", sets: 2, reps: "10", weight: 12.5 }] } });
  assert.deepEqual(legacy.sessions.A[0].loads, ["40", "40", "40"]);
  assert.equal(legacy.sessions.A[0].reps, "8-12");
  assert.deepEqual(legacy.sessions.A[1].loads, ["12.5", "12.5"]);
  const resized = normalizeProgram({ sessions: { A: [{ name: "תרגיל", sets: 3, reps: "8", loads: ["10", "x"] }] } });
  assert.deepEqual(resized.sessions.A[0].loads, ["10", null, null]);
});

test("plan editing: update, add, remove (keeps >=1), move, add/remove session, per-set weights follow set count", () => {
  let p = addSession(emptyProgram(), "t");
  assert.deepEqual(Object.keys(p.sessions), ["A"]);
  p = addExercise(p, "A", "בדיקה", "t");
  p = updateExercise(p, "A", p.sessions.A[0].id, { name: "תרגיל", loads: ["12", "12", "12"], sets: 3 }, "t");
  assert.deepEqual(p.sessions.A[0].loads, ["12", "12", "12"]);
  p = updateExercise(p, "A", p.sessions.A[0].id, { sets: 2 }, "t");
  assert.deepEqual(p.sessions.A[0].loads, ["12", "12"]);
  assert.equal(p.source, "custom");
  const n = p.sessions.A.length;
  p = addExercise(p, "A", "כפיפות", "t");
  assert.equal(p.sessions.A.length, n + 1);
  const firstId = p.sessions.A[0].id;
  p = moveExercise(p, "A", firstId, 1, "t");
  assert.equal(p.sessions.A[1].id, firstId);
  assert.equal(moveExercise(p, "A", p.sessions.A[0].id, -1, "t"), p);
  for (const e of [...p.sessions.A]) p = removeExercise(p, "A", e.id, "t");
  assert.equal(p.sessions.A.length, 1);
  p = addSession(p, "t");
  assert.deepEqual(Object.keys(p.sessions), ["A", "B"]);
  assert.equal(removeSession(p, "A", "t"), p);
  assert.deepEqual(Object.keys(removeSession(p, "B", "t").sessions), ["A"]);
});

test("startLive: per-set planned weight prefilled, unset stays empty, reps range is not prefilled", () => {
  const live = fresh();
  assert.deepEqual(live.exercises[0].sets.map(s => s.weight), ["20", "20", "10"]);
  assert.deepEqual(live.exercises[0].sets.map(s => s.planned), ["20", "20", "10"]);
  assert.deepEqual(live.exercises[2].sets.map(s => s.weight), ["15", ""]);
  assert.deepEqual(live.exercises[3].sets.map(s => s.weight), ["", ""]);
  assert.equal(live.exercises[0].sets.every(s => s.reps === ""), true);
  assert.equal(live.exercises[0].plan.reps, "8-12");
  assert.equal(L.startLive(program, "Z", { id: "x", now: T0, workouts: [] }), null);
});

test("sets: edit, done starts rest timer, undo does not, add/remove keep >=1", () => {
  let live = fresh();
  live = L.setSetField(live, 3, 0, "weight", "82,5");
  live = L.setSetField(live, 3, 0, "reps", "10");
  live = L.toggleSetDone(live, 3, 0, T0);
  assert.equal(live.exercises[3].sets[0].done, true);
  assert.equal(L.restRemaining(live, T0), 75);
  assert.equal(L.restRemaining(live, T0 + 30000), 45);
  assert.equal(L.restRemaining(live, T0 + 999999), 0);
  live = L.addRest(live, 15, T0);
  assert.equal(L.restRemaining(live, T0), 90);
  live = L.clearRest(live);
  assert.equal(L.restRemaining(live, T0), 0);
  live = L.toggleSetDone(live, 3, 0, T0 + 1000);
  assert.equal(live.exercises[3].sets[0].done, false);
  assert.equal(live.restEndsAt, null);
  live = L.addSet(live, 3);
  assert.equal(live.exercises[3].sets.length, 3);
  live = L.removeSet(live, 3, 2); live = L.removeSet(live, 3, 1); live = L.removeSet(live, 3, 0);
  assert.equal(live.exercises[3].sets.length, 1);
});

test("effort toggles, note, skip toggles, replace keeps original name and drops planned weights", () => {
  let live = fresh();
  live = L.setEffort(live, 1, "hard");
  assert.equal(live.exercises[1].effort, "hard");
  live = L.setEffort(live, 1, "hard");
  assert.equal(live.exercises[1].effort, "");
  assert.equal(L.setEffort(live, 1, "bogus").exercises[1].effort, "");
  live = L.setNote(live, 1, "הערה לבדיקה");
  live = L.skipExercise(live, 2);
  assert.equal(live.exercises[2].status, "skipped");
  live = L.skipExercise(live, 2);
  assert.equal(live.exercises[2].status, "pending");
  live = L.replaceExercise(live, 0, "  תרגיל חלופי ");
  assert.equal(live.exercises[0].name, "תרגיל חלופי");
  assert.equal(live.exercises[0].replacedFrom, "תרגיל א");
  assert.equal(live.exercises[0].sets[0].weight, "");
  assert.equal(live.exercises[0].sets[0].planned, null);
  assert.equal(L.replaceExercise(live, 0, "   "), live);
  assert.equal(L.planUpdateFor(live, 0), null);
});

test("finish flow: review edits, log only done sets, plan is NOT changed automatically, explicit update works", () => {
  let live = fresh();
  live = L.setSetField(live, 0, 0, "reps", "10");
  live = L.toggleSetDone(live, 0, 0, T0);
  live = L.setSetField(live, 0, 1, "weight", "22,5"); // תיקון בשלב עדכון הביצוע
  live = L.setSetField(live, 0, 1, "reps", "8");
  live = L.toggleSetDone(live, 0, 1, T0 + 1000);
  live = L.setSetField(live, 0, 2, "weight", "abc");
  live = L.setSetField(live, 0, 2, "reps", "6");
  live = L.toggleSetDone(live, 0, 2, T0 + 2000);
  live = L.skipExercise(live, 3);
  const s = L.summary(live);
  assert.deepEqual([s.doneSets, s.skipped, s.doneExercises], [3, 1, 1]);
  const before = JSON.stringify(program);
  const w = L.finishLive(live, { now: T0 + 25 * 60000, today: "2026-09-21" });
  assert.equal(JSON.stringify(program), before, "finishing must not touch the plan");
  assert.equal(w.session, "A");
  assert.equal(w.duration, "25 דקות");
  assert.deepEqual(w.log.exercises[0].sets, [{ weight: 20, reps: 10 }, { weight: 22.5, reps: 8 }, { weight: null, reps: 6 }]);
  assert.deepEqual(w.log.exercises[3].sets, []);
  assert.deepEqual(w.log.exercises[1].sets, []);
  // הצעה מפורשת לעדכון: סט 3 לא קיבל משקל תקין ולכן נשאר כמתוכנן
  const proposal = L.planUpdateFor(live, 0);
  assert.deepEqual(proposal, ["20", "22.5", "10"]);
  const updated = applyLoads(base, "A", live.exercises[0].exId, proposal, "t");
  assert.deepEqual(updated.sessions.A[0].loads, ["20", "22.5", "10"]);
  assert.deepEqual(base.sessions.A[0].loads, ["20", "20", "10"], "original object untouched");
  assert.equal(todayState({ profile: gym, program: base, workouts: [w] }, "2026-09-21").status, "done");
});

test("planUpdateFor: null when nothing differs or the set was not done", () => {
  let live = fresh();
  assert.equal(L.planUpdateFor(live, 0), null);
  live = L.setSetField(live, 0, 0, "weight", "30");
  assert.equal(L.planUpdateFor(live, 0), null, "typed but not done");
  live = L.toggleSetDone(live, 0, 0, T0);
  assert.deepEqual(L.planUpdateFor(live, 0), ["30", "20", "10"]);
  live = L.setSetField(live, 3, 0, "weight", "5");
  live = L.toggleSetDone(live, 3, 0, T0);
  assert.deepEqual(L.planUpdateFor(live, 3), ["5", null]);
});

test("exit mid-workout: empty needs no confirmation and is dropped; progress is kept on leave", () => {
  let live = fresh();
  assert.equal(L.hasProgress(live), false);
  assert.equal(L.needsExitConfirm(live), false);
  assert.deepEqual(L.resolveExit(live, "leave"), { action: "leave", keep: false });
  live = L.setSetField(live, 0, 0, "reps", "8");
  assert.equal(L.hasProgress(live), true);
  assert.deepEqual(L.resolveExit(live, "leave"), { action: "leave", keep: true });
  assert.deepEqual(L.resolveExit(live, "stay"), { action: "stay", keep: true });
  assert.deepEqual(L.resolveExit(live, "finish"), { action: "summary", keep: true });
  assert.deepEqual(L.resolveExit(live, "cancel"), { action: "leave", keep: false });
  assert.deepEqual(L.resolveExit(live, "???"), { action: "stay", keep: true });
});

test("refresh mid-workout: live state survives a JSON round trip and the rest timer stays absolute", () => {
  let live = fresh();
  live = L.setSetField(live, 0, 0, "reps", "9");
  live = L.toggleSetDone(live, 0, 0, T0);
  const restored = JSON.parse(JSON.stringify(live));
  assert.deepEqual(restored, live);
  assert.equal(L.restRemaining(restored, T0 + 20000), 55);
  assert.equal(L.summary(restored).doneSets, 1);
});
