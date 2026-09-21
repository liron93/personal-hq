// מסלולי תרגול בחברת הקריירה: ניהול מוצר (ברירת מחדל, כמו קודם) ומשאבי אנוש.
// המסלול והניסיונות של מסלול HR נשמרים ב-useStore ("hq:career-prefs:v1"), כלומר במרחב האישי של כל משתמש/ת.
// אין כאן קריאה ל-Supabase: הטבלה career_answers מחייבת שהשאלה תהיה קיימת ב-career_questions (מפתח זר),
// ושאלות ה-HR עדיין לא נזרעו שם. עד שתאושר מיגרציה, ניסיונות HR נשארים מקומיים למשתמש/ת.
// הקובץ טהור (בלי ייבוא JSON) כדי שאפשר לבדוק אותו ישירות ב-node.
import { normalizeFlags } from "./job-status.js";

export const TRACKS = Object.freeze({ pm: "ניהול מוצר", hr: "משאבי אנוש" });
export const DEFAULT_PREFS = Object.freeze({ track: "pm", hrAttempts: [], irrelevantJobs: {} });
export const MAX_ATTEMPT_CHARS = 5000;
export const MAX_ATTEMPTS = 500;
// קידומת ייחודית: בנק המוצר הקיים כולל כבר שאלות עם מזהים hr-001..015 (ראיונות התנהגותיים), ואלה נשמרים ב-Supabase כמו קודם.
export const HR_ID_PREFIX = "hrm-";

export const isTrack = value => Object.prototype.hasOwnProperty.call(TRACKS, value);
export const isHrQuestion = id => typeof id === "string" && id.startsWith(HR_ID_PREFIX);

/** מחזיר העדפות תקינות גם כשהנתון השמור חסר או פגום. */
export function normalizePrefs(raw) {
  const track = isTrack(raw?.track) ? raw.track : "pm";
  const list = Array.isArray(raw?.hrAttempts) ? raw.hrAttempts : [];
  const hrAttempts = list
    .filter(a => a && isHrQuestion(a.questionId) && typeof a.text === "string" && typeof a.id === "string" && typeof a.createdAt === "string")
    .slice(0, MAX_ATTEMPTS)
    .map(a => ({ id: a.id, questionId: a.questionId, text: a.text.slice(0, MAX_ATTEMPT_CHARS), createdAt: a.createdAt }));
  return { track, hrAttempts, irrelevantJobs: normalizeFlags(raw?.irrelevantJobs) };
}

export const setTrack = (prefs, track) => ({ ...normalizePrefs(prefs), track: isTrack(track) ? track : "pm" });

/** מוסיף ניסיון תרגול למסלול HR, הכי חדש ראשון. טקסט ריק לא נשמר. */
export function addHrAttempt(prefs, questionId, text, { id, now }) {
  const clean = normalizePrefs(prefs);
  const body = String(text ?? "").trim().slice(0, MAX_ATTEMPT_CHARS);
  if (!isHrQuestion(questionId) || !body) return clean;
  return { ...clean, hrAttempts: [{ id, questionId, text: body, createdAt: new Date(now).toISOString() }, ...clean.hrAttempts].slice(0, MAX_ATTEMPTS) };
}

/** בנק שאלות פתוחות למסלול. שאלות אמריקאיות מוצגות עם תשובה ולא נשמרות כניסיון. */
export const questionsFor = (track, { pm, hr }) => (track === "hr" ? hr : pm);
export const conceptsFor = (track, { pm, hr }) => (track === "hr" ? hr : pm);

/** היסטוריית ניסיונות HR עם נוסח השאלה, כדי להציג ליד ניסיונות ה-Supabase של מסלול המוצר. */
export function hrHistory(prefs, hrQuestions) {
  const byId = new Map((hrQuestions || []).map(q => [q.id, q]));
  return normalizePrefs(prefs).hrAttempts.map(a => ({
    id: a.id, question_id: a.questionId, answer_text: a.text, created_at: a.createdAt,
    career_questions: byId.has(a.questionId) ? { question: byId.get(a.questionId).question, category: byId.get(a.questionId).category } : null,
  }));
}

/** בדיקת שלמות לבנק: מזהים ייחודיים, שדות חובה, ושאלה אמריקאית עם תשובה מתוך האפשרויות. */
export function validateBank(bank, prefix) {
  const errors = []; const seen = new Set();
  for (const q of bank) {
    if (!q?.id || !String(q.id).startsWith(prefix)) errors.push(`מזהה לא תקין: ${q?.id}`);
    else if (seen.has(q.id)) errors.push(`מזהה כפול: ${q.id}`);
    else seen.add(q.id);
    if (!q?.question || !q?.category || !["easy", "medium", "hard"].includes(q?.difficulty)) errors.push(`שדה חסר או רמה לא תקינה: ${q?.id}`);
    if (q?.question_type === "multiple_choice" && (!Array.isArray(q.options) || q.options.length < 2 || !q.options.includes(q.correct_answer))) errors.push(`שאלה אמריקאית לא תקינה: ${q?.id}`);
  }
  return errors;
}
