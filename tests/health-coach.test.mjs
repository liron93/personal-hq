import { test } from "node:test";
import assert from "node:assert/strict";
import {
  inWindow, daysSinceLastWorkout, workoutWindowSummary, sessionSplit, muscleGroupVolume, untrainedGroups,
} from "../companies/health/coach.mjs";

const TODAY = "2026-10-18";
const w = (over) => ({ id: "w1", date: TODAY, session: null, ...over });
const ex = (name, sets, over = {}) => ({ name, status: "done", sets, ...over });

test("inWindow: רק אימונים תקינים (לא skipped) בתוך days הימים האחרונים, עד/כולל today", () => {
  const workouts = [
    w({ id: "a", date: "2026-10-18" }), // היום
    w({ id: "b", date: "2026-10-12" }), // לפני 6 ימים
    w({ id: "c", date: "2026-10-10" }), // לפני 8 ימים - מעבר ל-7
    w({ id: "d", date: "2026-10-16", skipped: true }), // skipped - לא נכלל
  ];
  const res = inWindow(workouts, 7, TODAY);
  assert.deepEqual(res.map(x => x.id), ["b", "a"]); // ממוין מהישן לחדש
});

test("daysSinceLastWorkout: ימים מהאימון התקין האחרון; null כשאין שום אימון", () => {
  assert.equal(daysSinceLastWorkout([w({ date: "2026-10-15" })], TODAY), 3);
  assert.equal(daysSinceLastWorkout([w({ date: "2026-10-20", skipped: true })], TODAY), null);
  assert.equal(daysSinceLastWorkout([], TODAY), null);
  assert.equal(daysSinceLastWorkout(null, TODAY), null);
});

test("workoutWindowSummary: יעד מותאם לאורך החלון (weeklyGoal*days/7), null כשלא הוגדר יעד", () => {
  const workouts = [w({ id: "a", date: "2026-10-18" }), w({ id: "b", date: "2026-10-16" })];
  const withGoal = workoutWindowSummary(workouts, 7, TODAY, { weeklyGoal: 3 });
  assert.equal(withGoal.count, 2);
  assert.equal(withGoal.goal, 3);
  assert.equal(withGoal.days, 7);
  const noGoal = workoutWindowSummary(workouts, 7, TODAY, {});
  assert.equal(noGoal.goal, null);
  const window28 = workoutWindowSummary(workouts, 28, TODAY, { weeklyGoal: 3 });
  assert.equal(window28.goal, 12); // 3*28/7
});

test("sessionSplit: סופר A/B/C בנפרד; unclassified לאימונים בלי session תואם (למשל Hevy - session:null)", () => {
  const workouts = [
    w({ id: "a", date: "2026-10-17", session: "A" }),
    w({ id: "b", date: "2026-10-16", session: "A" }),
    w({ id: "c", date: "2026-10-15", session: "B" }),
    w({ id: "d", date: "2026-10-14", session: null, source: "hevy" }), // ייבוא Hevy - לא מסווג
  ];
  const result = sessionSplit(workouts, 7, TODAY);
  assert.deepEqual(result.counts, { A: 2, B: 1, C: 0 });
  assert.equal(result.unclassified, 1);
  assert.equal(result.total, 4);
});

test("muscleGroupVolume: נפח (משקל*חזרות) וכמות סטים לכל קבוצה; תרגיל לא ממופה לא נספר בשום קבוצה", () => {
  const workouts = [
    w({
      id: "a", date: "2026-10-17",
      log: { exercises: [
        ex("Bench Press", [{ weight: 60, reps: 10 }, { weight: 60, reps: 8 }]),
        ex("תרגיל מוזר שלא קיים", [{ weight: 20, reps: 10 }]),
      ] },
    }),
    w({
      id: "b", date: "2026-10-16",
      log: { exercises: [ex("Squat", [{ weight: 80, reps: 5 }])] },
    }),
  ];
  const { groups, unmapped } = muscleGroupVolume(workouts, 7, TODAY);
  const chest = groups.find(g => g.group === "חזה");
  assert.equal(chest.sets, 2);
  assert.equal(chest.volume, 60 * 10 + 60 * 8);
  assert.equal(chest.lastDate, "2026-10-17");
  const quads = groups.find(g => g.group === "ארבע-ראשי");
  assert.equal(quads.sets, 1);
  assert.equal(quads.volume, 80 * 5);
  const back = groups.find(g => g.group === "גב");
  assert.equal(back.sets, 0);
  assert.equal(back.volume, 0);
  assert.equal(unmapped.length, 1);
  assert.equal(unmapped[0].name, "תרגיל מוזר שלא קיים");
  assert.equal(unmapped[0].count, 1);
});

test("muscleGroupVolume: סט בלי משקל/חזרות ידועים נספר ב-sets אבל לא ב-volume (לא בודים מספר)", () => {
  const workouts = [w({ id: "a", date: "2026-10-17", log: { exercises: [ex("Bench Press", [{ weight: null, reps: 10 }])] } })];
  const { groups } = muscleGroupVolume(workouts, 7, TODAY);
  const chest = groups.find(g => g.group === "חזה");
  assert.equal(chest.sets, 1);
  assert.equal(chest.volume, 0);
});

test("muscleGroupVolume: מתעלם מתרגיל skipped ומאימון בלי log בכלל, לא קורס", () => {
  const workouts = [
    w({ id: "a", date: "2026-10-17", log: { exercises: [ex("Bench Press", [{ weight: 60, reps: 10 }], { status: "skipped" })] } }),
    w({ id: "b", date: "2026-10-16" }), // בלי log
  ];
  const { groups, unmapped } = muscleGroupVolume(workouts, 7, TODAY);
  assert.equal(groups.find(g => g.group === "חזה").sets, 0);
  assert.equal(unmapped.length, 0);
});

test("untrainedGroups: קבוצות בלי אף סט בחלון - עובדה נקייה, לא שיפוט", () => {
  const workouts = [w({ id: "a", date: "2026-10-17", log: { exercises: [ex("Bench Press", [{ weight: 60, reps: 10 }])] } })];
  const { groups } = muscleGroupVolume(workouts, 7, TODAY);
  const missing = untrainedGroups(groups);
  assert.equal(missing.includes("חזה"), false);
  assert.equal(missing.includes("ליבה"), true);
  assert.equal(missing.includes("גב"), true);
});

test("קלט ריק/חסר לא קורס בשום פונקציה", () => {
  assert.deepEqual(inWindow(null, 7, TODAY), []);
  assert.deepEqual(inWindow([], 7, TODAY), []);
  assert.equal(workoutWindowSummary(null, 7, TODAY, {}).count, 0);
  assert.deepEqual(sessionSplit(null, 7, TODAY), { counts: { A: 0, B: 0, C: 0 }, unclassified: 0, total: 0 });
  const { groups, unmapped } = muscleGroupVolume(null, 7, TODAY);
  assert.equal(groups.length, 9);
  assert.equal(unmapped.length, 0);
  assert.deepEqual(untrainedGroups(null), []);
});
