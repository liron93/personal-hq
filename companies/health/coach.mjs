// "המאמן שלי" (Issue #7, P0): שכבת החישוב/תשתית בלבד - רק עובדות מחושבות מתוך workouts
// הקיים (companies/health/model.js), בלי שום "פידבק"/ניסוח מקצועי (זה תחום גל - ראה
// הבהרת הבעלות ב-Issue #7). כל פונקציה כאן מחזירה מספרים/עובדות עם מקור (workouts) ו-
// חלון זמן נלווים, כדי שה-UI יוכל להציג "מקור, תאריך, רמת ביטחון" כנדרש - לא ממציאה שום
// דבר כש-אין מידע (כמו goals.mjs/history.mjs הקיימים, אותה פילוסופיה בדיוק).
import { SESSION_IDS } from "./program.mjs";
import { detectMuscleGroup, MUSCLE_GROUPS } from "./muscle-groups.mjs";

const DAY = 86400000;
const parseISO = iso => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const daysBetween = (fromISO, toISO) => Math.round((parseISO(toISO) - parseISO(fromISO)) / DAY);
const validWorkout = w => w && typeof w.date === "string" && w.date.length >= 10 && !w.skipped;

/** אימונים תקינים (לא skipped) בחלון של days הימים האחרונים, עד/כולל today. ממוין מהישן לחדש. */
export function inWindow(workouts, days, today) {
  return (workouts || [])
    .filter(w => validWorkout(w) && daysBetween(w.date, today) >= 0 && daysBetween(w.date, today) < days)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** ימים מהאימון התקין האחרון ועד today - null אם אין שום אימון בכלל (לא 0 מומצא). */
export function daysSinceLastWorkout(workouts, today) {
  const list = (workouts || []).filter(validWorkout).sort((a, b) => b.date.localeCompare(a.date));
  return list.length ? daysBetween(list[0].date, today) : null;
}

/**
 * סיכום אימונים לחלון נתון (7/28 יום בד"כ): כמה אימונים בפועל מול יעד מותאם לאורך החלון
 * (יעד שבועי * days/7, מעוגל) - goal=null כש-לא הוגדר יעד שבועי, לא בודים השוואה.
 */
export function workoutWindowSummary(workouts, days, today, { weeklyGoal = null } = {}) {
  const list = inWindow(workouts, days, today);
  const goal = Number.isFinite(weeklyGoal) && weeklyGoal > 0 ? Math.round((weeklyGoal * days) / 7) : null;
  return { days, count: list.length, goal, daysSinceLast: daysSinceLastWorkout(workouts, today) };
}

/**
 * חלוקה לפי session (A/B/C) בחלון. unclassified = אימונים בלי session תואם (לדוגמה כל
 * אימון שיובא מ-Hevy היום - importHevyWorkouts שומר session:null, אין לו קשר לתוכנית
 * A/B/C המקומית) - לא מנחשים לאיזה session הוא שייך, רק מדווחים כמה "לא מסווגים".
 */
export function sessionSplit(workouts, days, today, { sessionIds = SESSION_IDS } = {}) {
  const list = inWindow(workouts, days, today);
  const counts = {};
  for (const id of sessionIds) counts[id] = 0;
  let unclassified = 0;
  for (const w of list) {
    if (w.session && sessionIds.includes(w.session)) counts[w.session] += 1;
    else unclassified += 1;
  }
  return { counts, unclassified, total: list.length };
}

/**
 * נפח (volume load = משקל*חזרות, רק מסטים עם שני הערכים ידועים) וכמות סטים, לכל קבוצת
 * שריר, בחלון - מתוך workouts[].log.exercises[].sets[]. תרגיל שלא ממופה (detectMuscleGroup
 * מחזיר null) לא נספר באף קבוצה בשקט - מוחזר בנפרד ב-unmapped כדי שה-UI יבקש מיפוי,
 * כדרישת עמית ("תרגיל שאינו ממופה חייב לבקש מיפוי - לא להמציא").
 */
export function muscleGroupVolume(workouts, days, today, dict) {
  const list = inWindow(workouts, days, today).filter(w => w.log && Array.isArray(w.log.exercises));
  const byGroup = new Map(MUSCLE_GROUPS.map(g => [g, { group: g, sets: 0, volume: 0, lastDate: null }]));
  const unmapped = new Map(); // name -> {name, count}
  for (const w of list) {
    for (const e of w.log.exercises) {
      if (!e || e.status === "skipped" || !Array.isArray(e.sets) || !e.sets.length) continue;
      const group = detectMuscleGroup(e.name, dict);
      if (!group) {
        const key = e.name || "";
        const row = unmapped.get(key) || { name: e.name || "תרגיל ללא שם", count: 0 };
        row.count += 1;
        unmapped.set(key, row);
        continue;
      }
      const row = byGroup.get(group);
      row.sets += e.sets.length;
      for (const s of e.sets) if (Number.isFinite(s.weight) && Number.isFinite(s.reps)) row.volume += s.weight * s.reps;
      if (!row.lastDate || w.date > row.lastDate) row.lastDate = w.date;
    }
  }
  return {
    groups: [...byGroup.values()],
    unmapped: [...unmapped.values()].sort((a, b) => b.count - a.count),
  };
}

/** קבוצות שריר שלא תועדו בחלון בכלל (sets===0) - עובדה נקייה ("ליבה לא תועדה"), לא
    שיפוט. groups הוא הפלט של muscleGroupVolume(...).groups. */
export function untrainedGroups(groups) {
  return (groups || []).filter(g => g.sets === 0).map(g => g.group);
}
