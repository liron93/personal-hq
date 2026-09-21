// סטטוס "לא רלוונטי" למשרות. הטבלה career_jobs חיה ב-Supabase ואינה מוגדרת באף migration בריפו,
// ולכן לא ידוע אם יש בה CHECK על ערכי status. כדי לא לשנות סכימה ולא להסתכן בשמירה שנכשלת,
// "לא רלוונטי" נשמר במסד כ-"withdrawn" (סגורה, לא נספרת כפעילה), וסימון "לא רלוונטי" נשמר במרחב האישי
// של המשתמש/ת (hq:career-prefs:v1, שדה irrelevantJobs) ומוצג ומסונן כסטטוס נפרד.
// אם בעתיד יאושר ערך status חדש במסד, אפשר להעביר את הסימון לשם.

export const IRRELEVANT = "irrelevant";
export const CLOSED_STATUSES = Object.freeze(["rejected", "withdrawn"]);
export const MAX_FLAGS = 2000;

/** מפה id -> true, רק מפתחות מחרוזת לא ריקים. */
export function normalizeFlags(raw) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [id, value] of Object.entries(raw)) {
    if (value === true && id && Object.keys(out).length < MAX_FLAGS) out[id] = true;
  }
  return out;
}

export const isIrrelevant = (job, flags) => Boolean(job?.id && flags?.[job.id] === true);
export const effectiveStatus = (job, flags) => (isIrrelevant(job, flags) ? IRRELEVANT : job?.status);
export const isActiveJob = (job, flags) => !isIrrelevant(job, flags) && !CLOSED_STATUSES.includes(job?.status);

/** הסטטוס שנשלח למסד: "לא רלוונטי" נשמר כסגורה. שאר הערכים ללא שינוי. */
export const statusForSave = uiStatus => (uiStatus === IRRELEVANT ? "withdrawn" : uiStatus);

/** מעדכן את מפת הסימונים אחרי שמירה: מדליק כשנבחר "לא רלוונטי", מכבה בכל סטטוס אחר. */
export function withFlag(flags, jobId, uiStatus) {
  const next = normalizeFlags(flags);
  if (!jobId) return next;
  if (uiStatus === IRRELEVANT) next[jobId] = true; else delete next[jobId];
  return next;
}
