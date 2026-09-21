// לוגיקה טהורה: יעד משקל, שקילות, ממוצע נע, תחזית כטווח תאריכים, ותצוגה שבועית.
// כל התחזית נגזרת מנתונים אמיתיים שהוזנו; אם אין מספיק — אומרים זאת ולא מנחשים. מידע בלבד, לא ייעוץ רפואי.
import { addDaysISO, weekStartISO } from "./today.mjs";

export const WINDOW_DAYS = 42;      // חלון המגמה
export const MIN_POINTS = 4;        // מינימום שקילות בחלון
export const MIN_SPAN_DAYS = 14;    // מינימום פרישה בין הראשונה לאחרונה
export const MAX_STALE_DAYS = 14;   // השקילה האחרונה חייבת להיות עדכנית
export const MAX_HORIZON_DAYS = 730;
const Z = 1.28;                     // ~80% טווח ביטחון על השיפוע
const MIN_SLOPE_PER_WEEK = 0.05;    // מתחת לזה: יציב, אין תחזית

const DAY = 86400000;
const t = iso => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export const daysBetween = (a, b) => Math.round((t(b) - t(a)) / DAY);
const isISO = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const round1 = n => Math.round(n * 10) / 10;

export function cleanKg(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).trim().replace(",", "."));
  return Number.isFinite(n) && n >= 20 && n <= 400 ? round1(n) : null;
}
export function cleanSteps(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseInt(String(v).replace(/[,\s]/g, ""), 10);
  return Number.isFinite(n) && n >= 0 && n <= 100000 ? Math.round(n) : null;
}

// שקילה אחת לכל תאריך (שקילה חדשה באותו יום מחליפה); ממוין לפי תאריך.
export function addWeighIn(list, { date, kg, id, now }) {
  const k = cleanKg(kg);
  if (!isISO(date) || k === null) return list || [];
  const rest = (list || []).filter(w => w.date !== date);
  return [...rest, { id, date, kg: k, createdAt: now }].sort((a, b) => a.date.localeCompare(b.date));
}
export const removeWeighIn = (list, id) => (list || []).filter(w => w.id !== id);

export function addSteps(list, { date, count, id }) {
  const c = cleanSteps(count);
  if (!isISO(date) || c === null) return list || [];
  return [...(list || []).filter(s => s.date !== date), { id, date, count: c }].sort((a, b) => a.date.localeCompare(b.date));
}
export const removeSteps = (list, id) => (list || []).filter(s => s.id !== id);

// יעד: קודם data.goal.targetKg, ואחרת משקל היעד מנקודת הפתיחה הישנה (baseline.targetWeight) — קריאה בלבד.
export function goalTarget(data) {
  return cleanKg(data?.goal?.targetKg) ?? cleanKg(data?.profile?.baseline?.targetWeight);
}

// ממוצע נע לפי חלון ימים (לא לפי מספר שקילות), כך שגם שקילות לא סדירות מטופלות נכון.
export function movingAverage(weighIns, windowDays = 7) {
  const list = [...(weighIns || [])].filter(w => isISO(w.date) && Number.isFinite(w.kg)).sort((a, b) => a.date.localeCompare(b.date));
  return list.map(w => {
    const inWin = list.filter(x => x.date <= w.date && daysBetween(x.date, w.date) < windowDays);
    return { date: w.date, kg: w.kg, avg: round1(inWin.reduce((s, x) => s + x.kg, 0) / inWin.length), n: inWin.length };
  });
}

function regress(points) {
  const n = points.length;
  const mx = points.reduce((s, p) => s + p.x, 0) / n, my = points.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0, sxy = 0;
  for (const p of points) { sxx += (p.x - mx) ** 2; sxy += (p.x - mx) * (p.y - my); }
  const slope = sxy / sxx, intercept = my - slope * mx;
  const sse = points.reduce((s, p) => s + (p.y - (intercept + slope * p.x)) ** 2, 0);
  const se = Math.sqrt(sse / (n - 2) / sxx);
  return { slope, intercept, se };
}

// תחזית כטווח תאריכים. מחזיר { status, ... }:
// no-target | insufficient (עם reason ו-need) | reached | stable | away | too-far | range
export function forecast(weighIns, target, today) {
  const tgt = cleanKg(target);
  if (tgt === null) return { status: "no-target" };
  const all = [...(weighIns || [])].filter(w => isISO(w.date) && Number.isFinite(w.kg)).sort((a, b) => a.date.localeCompare(b.date));
  const win = all.filter(w => daysBetween(w.date, today) <= WINDOW_DAYS && w.date <= today);
  const span = win.length ? daysBetween(win[0].date, win[win.length - 1].date) : 0;
  const have = { points: win.length, spanDays: span };
  const lastAll = all[all.length - 1];
  if (lastAll && daysBetween(lastAll.date, today) > MAX_STALE_DAYS) return { status: "insufficient", reason: "stale", have, lastDate: lastAll.date, need: { points: MIN_POINTS, spanDays: MIN_SPAN_DAYS } };
  if (win.length < MIN_POINTS) return { status: "insufficient", reason: "points", have, need: { points: MIN_POINTS, spanDays: MIN_SPAN_DAYS } };
  if (span < MIN_SPAN_DAYS) return { status: "insufficient", reason: "span", have, need: { points: MIN_POINTS, spanDays: MIN_SPAN_DAYS } };
  const last = win[win.length - 1];
  if (daysBetween(last.date, today) > MAX_STALE_DAYS) return { status: "insufficient", reason: "stale", have, lastDate: last.date, need: { points: MIN_POINTS, spanDays: MIN_SPAN_DAYS } };

  const x0 = win[0].date;
  const { slope, intercept, se } = regress(win.map(w => ({ x: daysBetween(x0, w.date), y: w.kg })));
  const current = round1(intercept + slope * daysBetween(x0, last.date));
  const perWeek = round1(slope * 7);
  const gap = tgt - current;
  if (Math.abs(gap) < 0.3) return { status: "reached", current, slopePerWeek: perWeek };
  if (Math.abs(slope * 7) < MIN_SLOPE_PER_WEEK) return { status: "stable", current, slopePerWeek: perWeek };
  if (Math.sign(slope) !== Math.sign(gap)) return { status: "away", current, slopePerWeek: perWeek };

  const dist = Math.abs(gap), m = Math.abs(slope);
  const mHi = m + Z * se, mLo = m - Z * se;
  const minDays = dist / mHi;
  const maxDays = mLo > 0 ? dist / mLo : null;
  if (minDays > MAX_HORIZON_DAYS) return { status: "too-far", current, slopePerWeek: perWeek };
  const clamp = iso => (iso < today ? today : iso);
  const from = clamp(addDaysISO(last.date, Math.ceil(minDays)));
  const to = maxDays !== null && maxDays <= MAX_HORIZON_DAYS ? clamp(addDaysISO(last.date, Math.ceil(maxDays))) : null;
  return { status: "range", current, slopePerWeek: perWeek, from, to, openEnded: to === null, have };
}

// תצוגה שבועית (שבוע ראשון–שבת) סביב תאריך כלשהו.
export function weekSummary(data, anyDate) {
  const d = data || {};
  const start = weekStartISO(anyDate), end = addDaysISO(start, 6);
  const inWeek = x => x.date >= start && x.date <= end;
  const b = d.profile?.baseline || {};
  const workouts = (d.workouts || []).filter(w => w.date && inWeek(w) && !w.skipped).length;
  const foodDays = new Set((d.meals || []).filter(m => m.date && inWeek(m)).map(m => m.date)).size;
  const stepRows = (d.steps || []).filter(inWeek);
  const stepsAvg = stepRows.length ? Math.round(stepRows.reduce((s, r) => s + r.count, 0) / stepRows.length) : null;
  const w = (d.weighIns || []).filter(inWeek).sort((p, q) => p.date.localeCompare(q.date));
  const weightAvg = w.length ? round1(w.reduce((s, r) => s + r.kg, 0) / w.length) : null;
  const prevStart = addDaysISO(start, -7), prevEnd = addDaysISO(start, -1);
  const pw = (d.weighIns || []).filter(x => x.date >= prevStart && x.date <= prevEnd);
  const prevAvg = pw.length ? round1(pw.reduce((s, r) => s + r.kg, 0) / pw.length) : null;
  return {
    start, end,
    workouts, workoutGoal: Number(b.weeklyWorkoutGoal) || null,
    foodDays, foodGoal: Number(b.weeklyFoodGoal) || null,
    stepDays: stepRows.length, stepsAvg, stepGoal: Number(b.weeklyStepGoal) || null,
    weighIns: w.length, weightAvg, weightLast: w.length ? w[w.length - 1].kg : null,
    weightChange: weightAvg !== null && prevAvg !== null ? round1(weightAvg - prevAvg) : null,
  };
}
