// לוגיקה טהורה של מסך "היום": מה האימון הבא, מה הסטטוס להיום, ומה ההמלצות (טקסט בלבד).
import { SESSION_IDS } from "./program.mjs";
import { resolveProgram } from "./plan.mjs";

const DAY = 86400000;
const parse = iso => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export const addDaysISO = (iso, n) => new Date(parse(iso) + n * DAY).toISOString().slice(0, 10);
// שבוע ישראלי: מתחיל ביום ראשון.
export const weekStartISO = iso => addDaysISO(iso, -new Date(parse(iso)).getUTCDay());

const valid = w => w && typeof w.date === "string" && w.date.length >= 10 && !w.skipped;
const order = (a, b) => (a.date + (a.createdAt || "")).localeCompare(b.date + (b.createdAt || ""));

// האימון הבא במחזור A→B→C לפי האימון האחרון שתועד עם session. בלי היסטוריה: הראשון.
export function nextSession(workouts, ids) {
  const list = ids && ids.length ? ids : SESSION_IDS;
  const done = (workouts || []).filter(w => valid(w) && list.includes(w.session)).sort(order);
  if (!done.length) return list[0];
  const idx = list.indexOf(done[done.length - 1].session);
  return list[(idx + 1) % list.length];
}

export function weekWorkoutCount(workouts, today) {
  const start = weekStartISO(today);
  return (workouts || []).filter(w => valid(w) && w.date >= start && w.date <= today).length;
}

export function todayState(data, today) {
  const d = data || {};
  const profile = d.profile || {};
  const workouts = d.workouts || [];
  const program = resolveProgram(d);
  const goal = Number(profile.baseline?.weeklyWorkoutGoal) || null;
  const weekDone = weekWorkoutCount(workouts, today);
  const recommendations = [];
  if (!profile.complete) recommendations.push("אפשר להשלים פרופיל בהגדרות, אבל זה לא חובה כדי להתאמן.");

  if (program.restricted) return { status: "restricted", session: null, exercises: [], program, weekDone, goal, recommendations: [] };

  if (program.empty) return { status: "empty", session: null, exercises: [], program, weekDone, goal, recommendations };
  const todaysSession = workouts.filter(w => valid(w) && w.date === today && program.ids.includes(w.session)).sort(order).pop();
  const session = nextSession(workouts, program.ids);
  return {
    status: todaysSession ? "done" : "ready",
    session,
    doneSession: todaysSession ? todaysSession.session : null,
    exercises: program.sessions[session],
    program, weekDone, goal, recommendations,
  };
}

export function sessionLogEntry(session, { today, id, now, short = false }) {
  return {
    id, date: today, createdAt: now,
    name: short ? "אימון קצר בבית" : `אימון ${session}`,
    session: short ? null : session, short,
    duration: "", note: "", feeling: "",
  };
}
