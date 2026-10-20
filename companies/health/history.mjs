// היסטוריית התקדמות לפי תרגיל, נגזרת מרשומות אימון שנשמרו (workouts[].log.exercises). מידע בלבד, בלי המלצות.

// שם מנורמל לזיהוי תרגיל: אותיות קטנות, רווחים מכווצים ומקוצצים.
export const normalizeName = s => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

// גל (P1, ביקורת שחרור אחרי PR #164): "חימום אינו סט עבודה", "השוואה רק בטווח חזרות
// תואם או סימון מפורש שההשוואה לא ישירה". type מגיע מ-Hevy (lib/hevy-service.mjs,
// "normal"/"warmup"/"failure"/וכו') - סט ידני (live.mjs) או ייבוא ישן בלי type בכלל
// נחשב "normal" (ברירת מחדל בטוחה, זהה להתנהגות הקיימת - לא רגרסיה לנתון שכבר קיים).
const isWorkSet = s => s && s.weight !== null && (!s.type || s.type === "normal");
const workSets = session => (session?.sets || []).filter(isWorkSet);
// טווח סבילות בחזרות ל"השוואה תואמת" - לא זהות מדויקת (10 מול 9 חזרות זה בפועל אותו
// מאמץ בקירוב), אבל גם לא כל השוואה (3 חזרות כבדות מול 15 חזרות קלות אינן תחליף).
const REP_TOLERANCE = 2;
// הסט (מתוך סטי העבודה של session) עם מספר החזרות הקרוב ביותר ל-targetReps, בטווח
// הסבילות - null אם אין שום סט תואם (ואז ה"מגמה" מסומנת not_comparable, לא מומצאת).
function closestWorkSet(session, targetReps) {
  const candidates = workSets(session).filter(s => s.reps != null && Math.abs(s.reps - targetReps) <= REP_TOLERANCE);
  if (!candidates.length) return null;
  return candidates.reduce((best, s) => {
    if (!best) return s;
    const d = Math.abs(s.reps - targetReps), bd = Math.abs(best.reps - targetReps);
    return d < bd || (d === bd && s.weight > best.weight) ? s : best;
  }, null);
}

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

// סט העבודה עם המשקל הגבוה ביותר ב-session (רק מסטי עבודה - ראו isWorkSet). null אם אין.
const topWorkSet = session => workSets(session).reduce((m, s) => (!m || s.weight > m.weight) ? s : m, null);

// { last, best, trend } לתרגיל. best = המשקל הגבוה ביותר מתוך סטי עבודה בלבד (לא חימום) -
// "שיא" אף פעם לא יגיע מסט חימום. trend: השוואה בין תחילת/סוף חלון 4 האימונים האחרונים
// עם סטי עבודה, רק בין סטים בטווח חזרות תואם (closestWorkSet) - לא משקל-מקסימלי גולמי
// בלי קשר לחזרות. kind="not_comparable" (לא "same"/"up"/"down" מומצא) כש-אין שום סט
// בחלון המוקדם בטווח חזרות סביר להשוואה מול הסט האחרון.
export function summarizeExercise(h) {
  const last = h.sessions[h.sessions.length - 1];
  let best = null;
  for (const s of h.sessions) for (const set of workSets(s)) {
    if (!best || set.weight > best.weight || (set.weight === best.weight && (set.reps ?? 0) > (best.reps ?? 0))) best = { weight: set.weight, reps: set.reps, date: s.date };
  }
  const weighted = h.sessions.filter(s => topWorkSet(s) !== null).slice(-4);
  let trend = { kind: "insufficient", sessions: weighted.length };
  if (weighted.length >= 2) {
    const curr = topWorkSet(weighted[weighted.length - 1]);
    const matched = closestWorkSet(weighted[0], curr.reps);
    trend = matched === null
      ? { kind: "not_comparable", sessions: weighted.length }
      : { kind: curr.weight > matched.weight ? "up" : curr.weight < matched.weight ? "down" : "same", delta: Math.round((curr.weight - matched.weight) * 100) / 100, sessions: weighted.length };
  }
  return { sessions: h.sessions.length, last, best, trend };
}

export function historyList(workouts) {
  return [...exerciseHistory(workouts).values()].map(h => ({ key: h.key, name: h.name, ...summarizeExercise(h) })).sort((a, b) => b.last.date.localeCompare(a.last.date) || a.name.localeCompare(b.name));
}
