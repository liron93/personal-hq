
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
