import assert from "node:assert/strict";
import test from "node:test";
import { isRestricted, parseProgramText, SHORT_ALTERNATIVE } from "../companies/health/program.mjs";
import { resolveProgram, importFromText } from "../companies/health/plan.mjs";
import { nextSession, todayState, weekStartISO, weekWorkoutCount, sessionLogEntry } from "../companies/health/today.mjs";

const TEXT = `A
תרגיל א | 3 | 8-12 | 40
תרגיל ב | 2 | 10
B
תרגיל ג | 3 | 6-8 | 22.5
C
תרגיל ד, 4, 12`;
const program = importFromText(TEXT, "t").program;
const withPlan = { profile: { complete: true }, program, workouts: [] };

test("no stored program => empty state, never a default plan", () => {
  for (const data of [undefined, {}, { profile: {} }, { profile: { complete: true, place: ["חדר כושר"], baseline: { legPress: "80", complete: true } } }]) {
    const p = resolveProgram(data);
    assert.equal(p.empty, true);
    assert.deepEqual(p.ids, []);
    assert.equal(todayState(data, "2026-09-21").status, "empty");
  }
});

test("quick import: parses A/B/C, keeps missing weight empty, reports bad lines", () => {
  assert.deepEqual(Object.keys(program.sessions), ["A", "B", "C"]);
  assert.equal(program.sessions.A[0].load, "40");
  assert.equal(program.sessions.A[1].load, null);
  assert.equal(program.sessions.C[0].sets, 4);
  const r = parseProgramText("תרגיל לפני כותרת | 3 | 8\nאימון A\nבלי סטים\nעם סטים | x | 8\nחסר חזרות | 3\nתקין | 3 | 8-10");
  assert.equal(r.errors.length, 4);
  assert.equal(r.sessions.A.length, 1);
  const bad = importFromText("A\nתרגיל | 3 | 8 | כבד");
  assert.equal(bad.program, null);
  assert.equal(bad.errors.length, 1);
  assert.equal(importFromText("").program, null);
  const dec = importFromText("B\nתרגיל | 3 | 8-12 | 22,5\nעוד, 2, 10, 15").program;
  assert.equal(dec.sessions.B[0].load, "22.5");
  assert.equal(dec.sessions.B[1].sets, 2);
  assert.equal(dec.sessions.B[1].load, "15");
});

test("safety limitation or sensitive flag blocks the program", () => {
  assert.equal(isRestricted({ safety: "לא בטוח/ה" }), true);
  assert.equal(isRestricted({ sensitiveFlag: true }), true);
  assert.equal(isRestricted({ safety: "לא ידוע לי על מגבלה" }), false);
  assert.equal(todayState({ ...withPlan, profile: { safety: "יש מגבלה ואני מתייעץ/ת עם איש מקצוע" } }, "2026-09-21").status, "restricted");
});

test("nextSession cycles A->B->C->A and ignores skipped, unknown and short entries", () => {
  const ids = ["A", "B", "C"];
  assert.equal(nextSession([], ids), "A");
  assert.equal(nextSession([{ date: "2026-09-14", session: "A" }], ids), "B");
  assert.equal(nextSession([{ date: "2026-09-14", session: "A" }, { date: "2026-09-16", session: "B" }, { date: "2026-09-17", session: "C" }], ids), "A");
  assert.equal(nextSession([{ date: "2026-09-14", session: "B" }, { date: "2026-09-15", session: "C", skipped: true }], ids), "C");
  assert.equal(nextSession([{ date: "2026-09-14", session: "B" }, { date: "2026-09-15", session: null, short: true }], ids), "C");
  assert.equal(nextSession([{ date: "2026-09-14", session: "C" }], ["A", "B"]), "A");
});

test("todayState with a real program: ready, done today, week counters", () => {
  const today = "2026-09-21";
  const ready = todayState(withPlan, today);
  assert.equal(ready.status, "ready");
  assert.equal(ready.session, "A");
  assert.equal(ready.exercises.length, 2);
  const done = todayState({ ...withPlan, workouts: [{ date: today, session: "A" }] }, today);
  assert.equal(done.status, "done");
  assert.equal(done.session, "B");
  assert.equal(done.weekDone, 1);
});

test("missing profile is a recommendation only", () => {
  const s = todayState({ profile: { complete: false }, program, workouts: [] }, "2026-09-21");
  assert.equal(s.status, "ready");
  assert.equal(s.recommendations.length, 1);
  assert.equal(todayState(withPlan, "2026-09-21").recommendations.length, 0);
});

test("stored data is never dropped: legacy fields untouched by resolve/todayState", () => {
  const data = { profile: { complete: true, baseline: { legPress: "80" } }, plan: [{ id: "1" }], meals: [{ id: "m" }], workouts: [{ id: "w", date: "2026-09-01", name: "ישן" }], weekChoice: "x" };
  const before = JSON.stringify(data);
  todayState(data, "2026-09-21");
  assert.equal(JSON.stringify(data), before);
});

test("week starts on Sunday and counts only this week", () => {
  assert.equal(weekStartISO("2026-09-21"), "2026-09-20");
  assert.equal(weekStartISO("2026-09-20"), "2026-09-20");
  assert.equal(weekStartISO("2026-09-26"), "2026-09-20");
  const w = [{ date: "2026-09-19" }, { date: "2026-09-20" }, { date: "2026-09-22", skipped: true }, { date: "2026-09-21" }];
  assert.equal(weekWorkoutCount(w, "2026-09-21"), 2);
});

test("short alternative prescribes no exercises and does not advance the cycle", () => {
  const short = sessionLogEntry(null, { today: "2026-09-21", id: "x", now: "t", short: true });
  assert.equal(short.session, null);
  assert.equal(SHORT_ALTERNATIVE.items.length, 2);
  const full = sessionLogEntry("B", { today: "2026-09-21", id: "y", now: "t" });
  assert.equal(full.name, "אימון B");
});
