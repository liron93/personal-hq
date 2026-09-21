// היסטוריית התקדמות לפי תרגיל, נגזרת מרשומות אימון שנשמרו (workouts[].log.exercises). מידע בלבד, בלי המלצות.

// שם מנורמל לזיהוי תרגיל: אותיות קטנות, רווחים מכווצים ומקוצצים.
export const normalizeName = s => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

const byDateDesc = (a, b) => (b.date + (b.createdAt || "")).localeCompare(a.date + (a.createdAt || ""));

// Map: מפתח מנורמל => { key, name, sessions:[{date, sets:[{weight,reps}]}] } ממוין מהישן לחדש.
export function exerciseHistory(workouts) {
  const map = new Map();
  const list = (workouts || []).filter(w => w && w.log && Array.isArray(w.log.exercises)).sort((a, b) => -byDateDesc(a, b));
  for (const w of list) {
    for (const e of w.log.exercises) {
      const key = normalizeName(e.name);
      if (!key || e.status === "skipped" || !Array.isArray(e.sets) || !e.sets.length) continue;
      const h = map.get(key) || { key, name: e.name, sessions: [] };
      h.name = e.name;
      h.sessions.push({ date: w.date, sets: e.sets.map(s => ({ weight: s.weight ?? null, reps: s.reps ?? null })) });
      map.set(key, h);
    }
  }
  return map;
}

// הביצוע האחרון של תרגיל (לפי שם מנורמל), לתצוגת "בפעם הקודמת".
export function lastPerformance(workouts, name) {
  const h = exerciseHistory(workouts).get(normalizeName(name));
  if (!h) return null;
  const s = h.sessions[h.sessions.length - 1];
  return { date: s.date, sets: s.sets };
}

const top = session => session.sets.reduce((m, s) => (s.weight !== null && (m === null || s.weight > m) ? s.weight : m), null);

// { last, best, trend } לתרגיל. best = המשקל הגבוה ביותר (ואז הכי הרבה חזרות). trend: השוואה פשוטה של משקל הסט הגבוה.
export function summarizeExercise(h) {
  const last = h.sessions[h.sessions.length - 1];
  let best = null;
  for (const s of h.sessions) for (const set of s.sets) {
    if (set.weight === null) continue;
    if (!best || set.weight > best.weight || (set.weight === best.weight && (set.reps ?? 0) > (best.reps ?? 0))) best = { weight: set.weight, reps: set.reps, date: s.date };
  }
  const weighted = h.sessions.filter(s => top(s) !== null).slice(-4);
  let trend = { kind: "insufficient", sessions: weighted.length };
  if (weighted.length >= 2) {
    const delta = Math.round((top(weighted[weighted.length - 1]) - top(weighted[0])) * 100) / 100;
    trend = { kind: delta > 0 ? "up" : delta < 0 ? "down" : "same", delta, sessions: weighted.length };
  }
  return { sessions: h.sessions.length, last, best, trend };
}

export function historyList(workouts) {
  return [...exerciseHistory(workouts).values()].map(h => ({ key: h.key, name: h.name, ...summarizeExercise(h) })).sort((a, b) => b.last.date.localeCompare(a.last.date) || a.name.localeCompare(b.name));
}
