import assert from "node:assert/strict";
import test from "node:test";
import { buildProgram, isRestricted, sessionCount, SHORT_ALTERNATIVE } from "../companies/health/program.mjs";
import { nextSession, todayState, weekStartISO, weekWorkoutCount, sessionLogEntry } from "../companies/health/today.mjs";

const gymProfile = { complete: true, availability: "3", place: ["חדר כושר"], baseline: { complete: true, legPress: "80", chestPress: "", row: "" } };

test("missing profile still produces a full A/B/C program (recommendation only)", () => {
  const p = buildProgram(undefined);
  assert.equal(p.restricted, false);
  assert.deepEqual(p.ids, ["A", "B", "C"]);
  assert.equal(p.sessions.A.length, 4);
  assert.equal(sessionCount({ complete: true }), 2);
  assert.equal(sessionCount({ availability: "5 או יותר" }), 3);
});

test("weights are never invented: only baseline values appear", () => {
  const p = buildProgram(gymProfile);
  assert.equal(p.sessions.A[0].load, "80");
  assert.equal(p.sessions.A[1].load, null);
  assert.equal(p.sessions.B.every(e => e.load === null), true);
  const home = buildProgram({ complete: true, availability: "2", place: ["בבית בלי ציוד"] });
  assert.deepEqual(home.ids, ["A", "B"]);
  assert.equal(Object.values(home.sessions).flat().every(e => e.load === null), true);
});

test("safety limitation or sensitive flag blocks the program", () => {
  assert.equal(isRestricted({ safety: "לא בטוח/ה" }), true);
  assert.equal(isRestricted({ sensitiveFlag: true }), true);
  assert.equal(isRestricted({ safety: "לא ידוע לי על מגבלה" }), false);
  assert.equal(todayState({ profile: { safety: "יש מגבלה ואני מתייעץ/ת עם איש מקצוע" }, workouts: [] }, "2026-09-21").status, "restricted");
});

test("nextSession cycles A->B->C->A and ignores skipped, unknown and short entries", () => {
  const ids = ["A", "B", "C"];
  assert.equal(nextSession([], ids), "A");
  assert.equal(nextSession([{ date: "2026-09-14", session: "A" }], ids), "B");
  assert.equal(nextSession([{ date: "2026-09-14", session: "A" }, { date: "2026-09-16", session: "B" }, { date: "2026-09-17", session: "C" }], ids), "A");
  assert.equal(nextSession([{ date: "2026-09-14", session: "B" }, { date: "2026-09-15", session: "C", skipped: true }], ids), "C");
  assert.equal(nextSession([{ date: "2026-09-14", session: "B" }, { date: "2026-09-15", session: null, short: true }], ids), "C");
  assert.equal(nextSession([{ date: "2026-09-14", session: "C" }], ["A", "B"]), "A");
  assert.equal(nextSession([{ date: "2026-09-14", name: "הליכה" }], ids), "A");
});

test("todayState: ready, done today, and week counters", () => {
  const today = "2026-09-21"; // יום שני
  const empty = todayState({ profile: gymProfile, workouts: [] }, today);
  assert.equal(empty.status, "ready");
  assert.equal(empty.session, "A");
  assert.equal(empty.exercises.length, 4);
  const done = todayState({ profile: gymProfile, workouts: [{ date: today, session: "A" }] }, today);
  assert.equal(done.status, "done");
  assert.equal(done.doneSession, "A");
  assert.equal(done.session, "B");
  assert.equal(done.weekDone, 1);
});

test("missing profile gives recommendations but keeps action ready", () => {
  const s = todayState({ profile: { complete: false }, workouts: [] }, "2026-09-21");
  assert.equal(s.status, "ready");
  assert.equal(s.recommendations.length, 2);
  assert.equal(todayState({ profile: gymProfile, workouts: [] }, "2026-09-21").recommendations.length, 0);
});

test("week starts on Sunday and counts only this week", () => {
  assert.equal(weekStartISO("2026-09-21"), "2026-09-20");
  assert.equal(weekStartISO("2026-09-20"), "2026-09-20");
  assert.equal(weekStartISO("2026-09-26"), "2026-09-20");
  const w = [{ date: "2026-09-19" }, { date: "2026-09-20" }, { date: "2026-09-22", skipped: true }, { date: "2026-09-21" }];
  assert.equal(weekWorkoutCount(w, "2026-09-21"), 2);
});

test("log entries: short alternative does not advance the A/B/C cycle", () => {
  const short = sessionLogEntry("A", { today: "2026-09-21", id: "x", now: "t", short: true });
  assert.equal(short.session, null);
  assert.equal(SHORT_ALTERNATIVE.items.length, 4);
  const full = sessionLogEntry("B", { today: "2026-09-21", id: "y", now: "t" });
  assert.equal(full.session, "B");
  assert.equal(full.name, "אימון B");
});
