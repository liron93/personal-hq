import assert from "node:assert/strict";
import test from "node:test";
import { buildProgram } from "../companies/health/program.mjs";
import { resolveProgram, importBase, normalizeProgram, updateExercise, addExercise, removeExercise, moveExercise, addSession, removeSession, cleanLoad } from "../companies/health/plan.mjs";
import * as L from "../companies/health/live.mjs";
import { todayState } from "../companies/health/today.mjs";

const gym = { complete: true, availability: "3", place: ["חדר כושר"], baseline: { complete: true, legPress: "80", chestPress: "", row: "" } };
const T0 = Date.parse("2026-09-21T08:00:00.000Z");

test("resolveProgram: derived when nothing stored (backward compatible), stored wins otherwise", () => {
  const derived = resolveProgram({ profile: gym });
  assert.equal(derived.source, "derived");
  assert.deepEqual(derived.ids, ["A", "B", "C"]);
  const base = importBase(derived, "2026-09-21");
  const stored = resolveProgram({ profile: gym, program: base });
  assert.equal(stored.source, "imported");
  assert.equal(stored.sessions.A[0].load, "80");
});

test("importing a plan never invents missing weights", () => {
  const derived = buildProgram({ complete: true, availability: "2", place: ["חדר כושר"], baseline: { legPress: "", complete: true } });
  const base = importBase({ ...derived, sessions: derived.sessions }, "");
  for (const list of Object.values(base.sessions)) for (const e of list) assert.equal(e.load, null);
  // ערכים לא מספריים / שליליים / ריקים מנוקים ל-null, לא מתוקנים
  assert.equal(cleanLoad("כבד"), null);
  assert.equal(cleanLoad(""), null);
  assert.equal(cleanLoad("-5"), null);
  assert.equal(cleanLoad("22,5"), "22.5");
  assert.equal(cleanLoad(40), "40");
});

test("safety restriction overrides any stored program", () => {
  const stored = importBase(buildProgram(gym), "");
  assert.equal(resolveProgram({ profile: { safety: "לא בטוח/ה" }, program: stored }).restricted, true);
  assert.equal(todayState({ profile: { sensitiveFlag: true }, program: stored, workouts: [] }, "2026-09-21").status, "restricted");
});

test("normalizeProgram rejects garbage and repairs bounds", () => {
  assert.equal(normalizeProgram(null), null);
  assert.equal(normalizeProgram({ sessions: { A: [{ name: "  " }] } }), null);
  const n = normalizeProgram({ sessions: { A: [{ name: "סקוואט", sets: 99, reps: "", load: "abc", rest: 1 }, { name: "סקוואט", id: "A1" }] } });
  assert.equal(n.sessions.A[0].sets, 10);
  assert.equal(n.sessions.A[0].reps, "8–12");
  assert.equal(n.sessions.A[0].load, null);
  assert.equal(n.sessions.A[0].rest, 15);
  assert.equal(new Set(n.sessions.A.map(e => e.id)).size, 2);
});

test("plan editing: update, add, remove (keeps >=1), move, add/remove session", () => {
  let p = importBase(buildProgram({ complete: true, availability: "1", place: [] }), "");
  assert.deepEqual(Object.keys(p.sessions), ["A"]);
  p = updateExercise(p, "A", "A1", { name: "מקבילים", load: "12", sets: 3 }, "t");
  assert.equal(p.sessions.A[0].name, "מקבילים");
  assert.equal(p.sessions.A[0].sets, 3);
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

const program = resolveProgram({ profile: gym });
const fresh = () => L.startLive(program, "A", { id: "w1", now: T0, workouts: [] });

test("startLive: weight prefilled only from the plan, otherwise empty", () => {
  const live = fresh();
  assert.equal(live.exercises[0].sets[0].weight, "80");
  assert.equal(live.exercises[1].sets[0].weight, "");
  assert.equal(live.exercises[0].sets.length, 2);
  assert.equal(L.startLive(program, "Z", { id: "x", now: T0, workouts: [] }), null);
});

test("sets: edit, done starts rest timer, undo does not, add/remove keep >=1", () => {
  let live = fresh();
  live = L.setSetField(live, 0, 0, "weight", "82,5");
  live = L.setSetField(live, 0, 0, "reps", "10");
  live = L.toggleSetDone(live, 0, 0, T0);
  assert.equal(live.exercises[0].sets[0].done, true);
  assert.equal(L.restRemaining(live, T0), 75);
  assert.equal(L.restRemaining(live, T0 + 30000), 45);
  assert.equal(L.restRemaining(live, T0 + 999999), 0);
  live = L.addRest(live, 15, T0);
  assert.equal(L.restRemaining(live, T0), 90);
  live = L.clearRest(live);
  assert.equal(L.restRemaining(live, T0), 0);
  live = L.toggleSetDone(live, 0, 0, T0 + 1000);
  assert.equal(live.exercises[0].sets[0].done, false);
  assert.equal(live.restEndsAt, null);
  live = L.addSet(live, 0);
  assert.equal(live.exercises[0].sets.length, 3);
  assert.equal(live.exercises[0].sets[2].weight, live.exercises[0].sets[1].weight); // סט חדש מעתיק את הסט הקודם
  live = L.removeSet(live, 0, 2); live = L.removeSet(live, 0, 1); live = L.removeSet(live, 0, 0);
  assert.equal(live.exercises[0].sets.length, 1);
});

test("effort toggles, note, skip toggles, replace keeps original name and drops weights", () => {
  let live = fresh();
  live = L.setEffort(live, 1, "hard");
  assert.equal(live.exercises[1].effort, "hard");
  live = L.setEffort(live, 1, "hard");
  assert.equal(live.exercises[1].effort, "");
  assert.equal(L.setEffort(live, 1, "bogus").exercises[1].effort, "");
  live = L.setNote(live, 1, "כתף מעט לחוצה");
  live = L.skipExercise(live, 2);
  assert.equal(live.exercises[2].status, "skipped");
  live = L.skipExercise(live, 2);
  assert.equal(live.exercises[2].status, "pending");
  live = L.replaceExercise(live, 0, "  לחיצת רגליים במכונה אחרת ");
  assert.equal(live.exercises[0].name, "לחיצת רגליים במכונה אחרת");
  assert.equal(live.exercises[0].replacedFrom, "לחיצת רגליים");
  assert.equal(live.exercises[0].sets[0].weight, "");
  assert.equal(L.replaceExercise(live, 0, "   "), live);
  live = L.replaceExercise(live, 0, "תרגיל ג");
  assert.equal(live.exercises[0].replacedFrom, "לחיצת רגליים");
});

test("finishLive logs only done sets, skipped exercises empty, numbers parsed", () => {
  let live = fresh();
  live = L.setSetField(live, 0, 0, "reps", "10");
  live = L.toggleSetDone(live, 0, 0, T0);
  live = L.setSetField(live, 0, 1, "weight", "abc");
  live = L.setSetField(live, 0, 1, "reps", "8");
  live = L.toggleSetDone(live, 0, 1, T0 + 1000);
  live = L.skipExercise(live, 3);
  const s = L.summary(live);
  assert.deepEqual([s.doneSets, s.skipped, s.doneExercises], [2, 1, 1]);
  const w = L.finishLive(live, { now: T0 + 25 * 60000, today: "2026-09-21" });
  assert.equal(w.session, "A");
  assert.equal(w.duration, "25 דקות");
  assert.deepEqual(w.log.exercises[0].sets, [{ weight: 80, reps: 10 }, { weight: null, reps: 8 }]);
  assert.deepEqual(w.log.exercises[3].sets, []);
  assert.deepEqual(w.log.exercises[1].sets, []);
  assert.equal(todayState({ profile: gym, workouts: [w] }, "2026-09-21").status, "done");
});

test("lastPerformance finds the latest real logged sets by exercise name", () => {
  const workouts = [
    { date: "2026-09-10", createdAt: "a", log: { exercises: [{ name: "פולי עליון", status: "pending", sets: [{ weight: 30, reps: 10 }] }] } },
    { date: "2026-09-17", createdAt: "a", log: { exercises: [{ name: "פולי עליון", status: "pending", sets: [{ weight: 35, reps: 8 }] }] } },
    { date: "2026-09-18", log: { exercises: [{ name: "פולי עליון", status: "skipped", sets: [] }] } },
    { date: "2026-09-19", name: "ישן בלי log" },
  ];
  assert.equal(L.lastPerformance(workouts, "פולי עליון").sets[0].weight, 35);
  assert.equal(L.lastPerformance(workouts, "לא קיים"), null);
  const live = L.startLive(program, "B", { id: "w", now: T0, workouts });
  assert.equal(live.exercises[2].last.sets[0].weight, 35);
  assert.equal(live.exercises[2].sets[0].weight, ""); // מידע להצגה בלבד, לא מולא אוטומטית
});
