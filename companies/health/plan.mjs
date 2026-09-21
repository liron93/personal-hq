// מודל תוכנית A/B/C ניתנת לעריכה. שדה אופציונלי חדש ב-blob: data.program.
// בלי data.program אין תוכנית (מצב ריק): לא ממציאים תרגילים. נתונים שמורים לא נמחקים.
import { isRestricted, parseProgramText, DEFAULT_REST, SESSION_IDS } from "./program.mjs";

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const asInt = (v, fallback) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : fallback; };

// משקל נשמר רק אם הוא מספר אמיתי. כל דבר אחר הופך ל-null — לעולם לא ממציאים ערך.
export function cleanLoad(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(",", ".");
  return /^\d+(\.\d+)?$/.test(s) ? s : null;
}

// lenient=true: מצב טיוטה בעורך — שומר שם ומשקל כפי שהוקלדו (גם ריקים/חלקיים); רק שמירה סופית מנקה.
export function cleanExercise(raw, fallbackId, lenient = false) {
  const name = typeof raw?.name === "string" ? (lenient ? raw.name : raw.name.trim()) : "";
  if (!lenient && !name) return null;
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : fallbackId,
    name,
    sets: clamp(asInt(raw.sets, 2), 1, 10),
    reps: lenient && typeof raw.reps === "string" ? raw.reps : typeof raw.reps === "string" && raw.reps.trim() ? raw.reps.trim() : "8–12",
    load: lenient ? (raw.load === null || raw.load === undefined || raw.load === "" ? null : String(raw.load)) : cleanLoad(raw.load),
    hint: typeof raw.hint === "string" ? raw.hint : "",
    rest: clamp(asInt(raw.rest, DEFAULT_REST), 15, 600),
  };
}

// מנרמל תוכנית שמורה. מחזיר null אם אין בה אימון אחד תקין.
export function normalizeProgram(raw, lenient = false) {
  if (!raw || typeof raw !== "object" || !raw.sessions || typeof raw.sessions !== "object") return null;
  const sessions = {};
  for (const sid of SESSION_IDS) {
    const list = Array.isArray(raw.sessions[sid]) ? raw.sessions[sid] : [];
    const seen = new Set();
    const clean = list.map((e, i) => cleanExercise(e, `${sid}${i + 1}`, lenient)).filter(Boolean).map((e, i) => {
      let id = e.id; while (seen.has(id)) id = `${sid}x${i}${seen.size}`; seen.add(id); return { ...e, id };
    });
    if (clean.length) sessions[sid] = clean;
  }
  const ids = SESSION_IDS.filter(sid => sessions[sid]);
  if (!ids.length) return null;
  return { version: 1, source: raw.source === "custom" ? "custom" : "imported", updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "", sessions };
}

// התוכנית בפועל: מגבלת בטיחות תמיד קודמת; אחרת התוכנית השמורה; אחרת מצב ריק (empty).
export function resolveProgram(data) {
  const profile = data?.profile || {};
  if (isRestricted(profile)) return { restricted: true, empty: false, ids: [], sessions: {}, source: "restricted" };
  const stored = normalizeProgram(data?.program);
  if (stored) return { restricted: false, empty: false, ids: SESSION_IDS.filter(sid => stored.sessions[sid]), sessions: stored.sessions, source: stored.source };
  return { restricted: false, empty: true, ids: [], sessions: {}, source: "none" };
}

// ייבוא/הזנה מהירה מטקסט לתוכנית תקינה. מחזיר { program, errors }; program=null אם אין אף תרגיל תקין.
// משקל שאינו מספר נדחה (שגיאה), לא מתוקן.
export function importFromText(text, now = "") {
  const { sessions, errors } = parseProgramText(text);
  const errs = [...errors];
  const clean = {};
  for (const [sid, list] of Object.entries(sessions)) {
    clean[sid] = list.filter((e, i) => {
      if (e.load !== null && cleanLoad(e.load) === null) { errs.push({ line: 0, message: `משקל לא תקין בתרגיל "${e.name}" (${e.load})` }); return false; }
      return true;
    });
  }
  const program = normalizeProgram({ version: 1, source: "imported", updatedAt: now, sessions: clean });
  return { program, errors: errs };
}

export const emptyProgram = () => ({ version: 1, source: "custom", updatedAt: "", sessions: {} });

const touch = (program, sessions, now) => normalizeProgram({ ...program, source: "custom", updatedAt: now ?? program.updatedAt, sessions }, true);
const cloneSessions = program => Object.fromEntries(Object.entries(program.sessions).map(([k, v]) => [k, v.map(e => ({ ...e }))]));

export function updateExercise(program, sid, exId, patch, now) {
  const s = cloneSessions(program);
  s[sid] = (s[sid] || []).map(e => (e.id === exId ? { ...e, ...patch } : e));
  return touch(program, s, now);
}
export function addExercise(program, sid, name, now) {
  const s = cloneSessions(program);
  const list = s[sid] || [];
  let n = list.length + 1; while (list.some(e => e.id === `${sid}${n}`)) n++;
  s[sid] = [...list, { id: `${sid}${n}`, name, sets: 2, reps: "8–12", load: null, hint: "", rest: DEFAULT_REST }];
  return touch(program, s, now);
}
export function removeExercise(program, sid, exId, now) {
  const s = cloneSessions(program);
  if ((s[sid] || []).length <= 1) return program; // אימון חייב לפחות תרגיל אחד
  s[sid] = s[sid].filter(e => e.id !== exId);
  return touch(program, s, now);
}
export function moveExercise(program, sid, exId, dir, now) {
  const s = cloneSessions(program);
  const list = s[sid] || [];
  const i = list.findIndex(e => e.id === exId), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return program;
  [list[i], list[j]] = [list[j], list[i]];
  return touch(program, s, now);
}
export function addSession(program, now) {
  const sid = SESSION_IDS.find(x => !program.sessions[x]);
  if (!sid) return program;
  return addExercise({ ...program, sessions: { ...program.sessions, [sid]: [] } }, sid, "תרגיל חדש", now);
}
export function removeSession(program, sid, now) {
  const ids = SESSION_IDS.filter(x => program.sessions[x]);
  if (ids.length <= 1 || ids[ids.length - 1] !== sid) return program; // מסירים רק את האחרון, כדי לשמור על רצף A/B/C
  const s = cloneSessions(program); delete s[sid];
  return touch(program, s, now);
}
