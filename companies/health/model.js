
export const STORE_KEY = "hq:health:v1";
export const uid = () => Math.random().toString(36).slice(2, 10);
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const INIT = {
  profile: { complete: false, goal: "", experience: "", availability: "", equipment: "", limitations: "", sensitiveFlag: false },
  meals: [],
  workouts: [],
  plan: [],
  tasks: [],
  updates: [],
};
const weekStart = () => { const d = new Date(); const day = d.getDay(); d.setDate(d.getDate() - day); d.setHours(0, 0, 0, 0); return d; };
const isThisWeek = value => new Date(value + "T12:00") >= weekStart();
export function summarize(data) {
  const d = data || INIT;
  const weekMeals = d.meals.filter(x => isThisWeek(x.date)).length;
  const weekWorkouts = d.workouts.filter(x => isThisWeek(x.date) && !x.skipped).length;
  return { openTasks: 0, nextPayment: null, daysToPay: null, latestUpdate: null, flag: d.profile.sensitiveFlag ? "amber" : weekMeals + weekWorkouts ? "green" : "amber", weekMeals, weekWorkouts };
}

/**
 * מוסיף אימונים שיובאו מ-Hevy (ראה lib/hevy-service.mjs) ל-state.workouts הקיים - תואם
 * אחורה לחלוטין: שדות name/date/id נצרכים כבר היום ע"י summarize()/Journal, source/
 * hevySourceId/exercises הם שדות חדשים שקוד קיים פשוט מתעלם מהם.
 * אידמפוטנטי בכוונה (דרישת עמית, Issue #7): dedupe לפי hevySourceId היציב של Hevy עצמו -
 * קריאה חוזרת עם אותם אימונים (או לחיצה כפולה על "אישור יבוא") לא יוצרת כפילויות, רק
 * מדווחת כמה נוספו וכמה כבר היו קיימים.
 */
export function importHevyWorkouts(state, hevyWorkouts) {
  const d = state || INIT;
  const existingIds = new Set((d.workouts || []).filter(w => w.hevySourceId).map(w => w.hevySourceId));
  const incoming = Array.isArray(hevyWorkouts) ? hevyWorkouts : [];
  const toAdd = incoming.filter(w => w && typeof w.hevySourceId === "string" && !existingIds.has(w.hevySourceId));
  if (!toAdd.length) return { state: d, importedCount: 0, skippedCount: incoming.length };
  const now = new Date().toISOString();
  const entries = toAdd.map(w => ({
    id: uid(), name: w.title || "אימון Hevy", date: w.date || todayISO(), note: "",
    source: "hevy", hevySourceId: w.hevySourceId, exercises: Array.isArray(w.exercises) ? w.exercises : [],
    createdAt: now,
  }));
  return { state: { ...d, workouts: [...entries, ...d.workouts] }, importedCount: entries.length, skippedCount: incoming.length - entries.length };
}
