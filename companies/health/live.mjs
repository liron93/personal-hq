// לוגיקה טהורה של אימון חי: סטים, משקל, חזרות, מאמץ, הערה, טיימר מנוחה, דילוג/החלפה וסיום.
// המצב נשמר ב-data.liveWorkout (שדה אופציונלי) כדי שרענון הדף לא יאבד אימון בתהליך.
// אין כאן המצאת משקלים: משקל ממולא רק מהתוכנית (אם הוזן שם) — אחרת נשאר ריק.

export const EFFORTS = { easy: "קל", ok: "מתאים", hard: "קשה" };

export function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).trim().replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// ביצוע אחרון של תרגיל (לפי שם) מתוך היסטוריית האימונים החיים — מידע אמיתי בלבד.
export function lastPerformance(workouts, name) {
  const list = (workouts || []).filter(w => w && w.log && Array.isArray(w.log.exercises)).sort((a, b) => (b.date + (b.createdAt || "")).localeCompare(a.date + (a.createdAt || "")));
  for (const w of list) {
    const e = w.log.exercises.find(x => x.name === name && x.status !== "skipped" && x.sets && x.sets.length);
    if (e) return { date: w.date, sets: e.sets };
  }
  return null;
}

const ex = (e, workouts) => ({
  exId: e.id, name: e.name, plannedName: e.name, replacedFrom: null, status: "pending",
  plan: { sets: e.sets, reps: e.reps, load: e.load ?? null, hint: e.hint || "", rest: e.rest || 75 },
  sets: Array.from({ length: e.sets }, () => ({ weight: e.load ? String(e.load) : "", reps: "", done: false })),
  effort: "", note: "", last: lastPerformance(workouts, e.name),
});

export function startLive(program, sessionId, { id, now, workouts }) {
  const list = program.sessions[sessionId];
  if (!list || !list.length) return null;
  return { id, session: sessionId, startedAt: new Date(now).toISOString(), restEndsAt: null, restTotal: 0, exercises: list.map(e => ex(e, workouts)) };
}

const setAt = (live, ei, fn) => ({ ...live, exercises: live.exercises.map((e, i) => (i === ei ? fn(e) : e)) });

export function setSetField(live, ei, si, field, value) {
  return setAt(live, ei, e => ({ ...e, sets: e.sets.map((s, i) => (i === si ? { ...s, [field]: value } : s)) }));
}

// סימון סט כבוצע מתחיל אוטומטית מנוחה; ביטול הסימון לא נוגע במנוחה.
export function toggleSetDone(live, ei, si, now) {
  const before = live.exercises[ei].sets[si].done;
  let next = setAt(live, ei, e => ({ ...e, status: e.status === "skipped" ? "pending" : e.status, sets: e.sets.map((s, i) => (i === si ? { ...s, done: !before } : s)) }));
  if (!before) next = startRest(next, live.exercises[ei].plan.rest, now);
  return next;
}
export function addSet(live, ei) {
  return setAt(live, ei, e => { const last = e.sets[e.sets.length - 1]; return { ...e, sets: [...e.sets, { weight: last ? last.weight : "", reps: "", done: false }] }; });
}
export function removeSet(live, ei, si) {
  return setAt(live, ei, e => (e.sets.length <= 1 ? e : { ...e, sets: e.sets.filter((_, i) => i !== si) }));
}
export function setEffort(live, ei, effort) { return setAt(live, ei, e => ({ ...e, effort: e.effort === effort ? "" : (EFFORTS[effort] ? effort : "") })); }
export function setNote(live, ei, note) { return setAt(live, ei, e => ({ ...e, note })); }

export function skipExercise(live, ei) {
  return setAt(live, ei, e => ({ ...e, status: e.status === "skipped" ? "pending" : "skipped" }));
}
// החלפה: שם חדש, בלי להעתיק משקל מהתרגיל הקודם. השם המקורי נשמר ב-replacedFrom.
export function replaceExercise(live, ei, newName) {
  const name = String(newName || "").trim();
  if (!name) return live;
  return setAt(live, ei, e => ({
    ...e, name, replacedFrom: e.replacedFrom || e.plannedName, status: "pending", last: null,
    plan: { ...e.plan, load: null, hint: "" }, sets: e.sets.map(() => ({ weight: "", reps: "", done: false })),
  }));
}

export function startRest(live, seconds, now) {
  const s = Math.max(0, Math.round(seconds || 0));
  return { ...live, restEndsAt: s ? now + s * 1000 : null, restTotal: s };
}
export const clearRest = live => ({ ...live, restEndsAt: null, restTotal: 0 });
export const addRest = (live, seconds, now) => (live.restEndsAt ? { ...live, restEndsAt: live.restEndsAt + seconds * 1000, restTotal: live.restTotal + seconds } : startRest(live, seconds, now));
export function restRemaining(live, now) {
  if (!live.restEndsAt) return 0;
  return Math.max(0, Math.ceil((live.restEndsAt - now) / 1000));
}

export function summary(live) {
  let doneSets = 0, totalSets = 0, skipped = 0, doneExercises = 0;
  for (const e of live.exercises) {
    if (e.status === "skipped") { skipped++; continue; }
    totalSets += e.sets.length;
    const d = e.sets.filter(s => s.done).length;
    doneSets += d; if (d) doneExercises++;
  }
  return { doneSets, totalSets, skipped, doneExercises, exercises: live.exercises.length };
}

// רשומת אימון ליומן (נתיב הקיים: data.workouts). log מכיל רק סטים שסומנו כבוצעו.
export function finishLive(live, { now, today }) {
  const minutes = Math.max(1, Math.round((now - Date.parse(live.startedAt)) / 60000));
  return {
    id: live.id, date: today, createdAt: new Date(now).toISOString(),
    name: `אימון ${live.session}`, session: live.session, short: false,
    duration: `${minutes} דקות`, note: "", feeling: "",
    log: {
      startedAt: live.startedAt, finishedAt: new Date(now).toISOString(),
      exercises: live.exercises.map(e => ({
        name: e.name, plannedName: e.plannedName, replacedFrom: e.replacedFrom, status: e.status,
        effort: e.effort, note: e.note,
        sets: e.status === "skipped" ? [] : e.sets.filter(s => s.done).map(s => ({ weight: num(s.weight), reps: num(s.reps) })),
      })),
    },
  };
}
