// לוגיקה טהורה של אימון חי: סטים, משקל, חזרות, מאמץ, הערה, טיימר מנוחה, דילוג/החלפה וסיום.
// המצב נשמר ב-data.liveWorkout (שדה אופציונלי) כדי שרענון הדף לא יאבד אימון בתהליך.
// אין כאן המצאת משקלים: לכל סט ממולא מראש רק המשקל שנקבע בתוכנית לאותו סט; "טרם נקבע" נשאר ריק והמשתמש ממלא.
import { parseWeight } from "./program.mjs";
import { lastPerformance } from "./history.mjs";
export { lastPerformance };

export const EFFORTS = { easy: "קל", ok: "מתאים", hard: "קשה" };

export function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).trim().replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const ex = (e, workouts) => ({
  exId: e.id, name: e.name, plannedName: e.name, replacedFrom: null, status: "pending",
  plan: { sets: e.sets, reps: e.reps, loads: e.loads.slice(), rest: e.rest || 75 },
  sets: Array.from({ length: e.sets }, (_, i) => ({ weight: e.loads[i] ? String(e.loads[i]) : "", reps: "", done: false, planned: e.loads[i] || null })),
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
  return setAt(live, ei, e => { const last = e.sets[e.sets.length - 1]; return { ...e, sets: [...e.sets, { weight: last ? last.weight : "", reps: "", done: false, planned: null }] }; });
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
    plan: { ...e.plan, loads: e.plan.loads.map(() => null) }, sets: e.sets.map(() => ({ weight: "", reps: "", done: false, planned: null })),
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
        sets: e.status === "skipped" ? [] : e.sets.filter(s => s.done).map(s => { const w = parseWeight(s.weight); return { weight: w === null ? null : parseFloat(w), reps: num(s.reps) }; }),
      })),
    },
  };
}

// האם נעשה משהו באימון (סט שסומן, הערה, מאמץ, דילוג או החלפה). אימון ריק אינו דורש אישור יציאה.
export function hasProgress(live) {
  return live.exercises.some(e => e.status === "skipped" || e.replacedFrom || e.effort || e.note.trim() || e.sets.some(s => s.done || String(s.reps).trim()));
}

// יציאה באמצע אימון (כפתור יציאה, ניווט, חזרה בדפדפן). choice: stay | leave | finish | cancel.
// leave = האימון נשמר וניתן להמשיך; finish = מעבר לסיכום; cancel = השלכה. אימון ריק נזרק בשקט ביציאה.
export function resolveExit(live, choice) {
  if (choice === "stay") return { action: "stay", keep: true };
  if (choice === "finish") return { action: "summary", keep: true };
  if (choice === "cancel") return { action: "leave", keep: false };
  if (choice === "leave") return { action: "leave", keep: hasProgress(live) };
  return { action: "stay", keep: true };
}
export const needsExitConfirm = live => hasProgress(live);

// הצעה לעדכון התוכנית למשקל שבוצע, לתרגיל אחד (רק בלחיצה מפורשת של המשתמש). מחזיר מערך משקלים חדש או null אם אין מה לעדכן.
// רק סטים שסומנו כבוצעו ויש להם משקל חיובי משנים את המשקל המתוכנן; שאר הסטים נשארים כמו בתוכנית.
export function planUpdateFor(live, ei) {
  const e = live.exercises[ei];
  if (!e || e.status === "skipped" || e.replacedFrom) return null;
  const next = e.plan.loads.map((planned, i) => { const s = e.sets[i]; const w = s && s.done ? parseWeight(s.weight) : null; return w !== null ? w : planned; });
  const same = next.every((w, i) => (w || null) === (e.plan.loads[i] || null));
  return same ? null : next;
}
