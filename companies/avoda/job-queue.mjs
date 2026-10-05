// לוגיקה טהורה ל"תור פעולות" בקריירה - רק מה שדורש טיפול עכשיו/בקרוב, לא ארכיון של כל
// המועמדויות הפעילות. דווח משתמש (Issue #7, P0): התור הקודם (Today() ב-Company.jsx) הציג
// "due" לפי next_action_at בלי שום תקרת-יושן - משרה עם מועד פולו-אפ מלפני חודשיים נשארה
// "דחופה" לנצח ודחקה את מה שבאמת צריך טיפול השבוע. "פעילות" (כל סטטוס לא-סגור) הוצג כמדד
// פעולה, כש-102 מועמדויות פעילות זה לא "102 דברים לעשות".
// קובץ טהור בכוונה (בלי React/Supabase) - נבדק תחת node:test, אותו עיקרון כמו job-status.js.
import { CLOSED_STATUSES, isActiveJob } from "./job-status.js";

const DAY_MS = 86400000;
const WEEK_DAYS = 7;

const daysBetween = (fromISO, toISO) => Math.round((new Date(toISO) - new Date(fromISO)) / DAY_MS);

/**
 * הסיבה שהמשרה מופיעה בתור, לתצוגה ("למה היא מופיעה") - null אם לא שייכת לתור בכלל.
 * ראיון/הצעה תמיד "דורשים תשומת לב" (אין שדה תאריך ראיון נפרד היום - status הוא האות),
 * עד שהסטטוס משתנה. פולו-אפ רק אם יש גם next_action וגם next_action_at בפועל.
 */
export function queueReason(job, today) {
  if (job?.status === "interview") return "ראיון מתוכנן";
  if (job?.status === "offer") return "ממתין להחלטה על הצעה";
  if (job?.next_action && job?.next_action_at) {
    const delta = daysBetween(today, job.next_action_at);
    if (delta < 0) return "פולו-אפ באיחור";
    if (delta === 0) return "פולו-אפ להיום";
    return "פולו-אפ מתקרב";
  }
  return null;
}

/**
 * האם המשרה שייכת לתור ברירת המחדל: סגורה/לא רלוונטית - לא; ראיון/הצעה - תמיד כן (צריך
 * תשומת לב עד שהסטטוס יזוז); אחרת רק אם יש גם next_action וגם next_action_at בטווח של
 * עד שבוע קדימה (מאחורה - כל כמה שבאיחור, זה עדיין "עכשיו"; לא מסתירים איחור, רק לא
 * מוסיפים "עד תאריך יעד רחוק בעתיד" לרשימת "עכשיו"). משרה בלי שום next_action/next_action_at
 * בכלל - לא בתור (צריכה קודם שיגדירו לה צעד הבא, לא "דחופה" כברירת מחדל).
 */
export function isQueueActionable(job, flags, today) {
  if (!isActiveJob(job, flags)) return false;
  if (job.status === "interview" || job.status === "offer") return true;
  if (!job.next_action || !job.next_action_at) return false;
  return daysBetween(today, job.next_action_at) <= WEEK_DAYS;
}

/**
 * בונה את תור הפעולות + מונים אמיתיים (לא "פעילות 102"). today בפורמט YYYY-MM-DD (אותו
 * today() שכבר קיים ב-Company.jsx). ממוין מהדחוף ביותר - תאריך פולו-אפ מוקדם יותר, ואז
 * ראיון/הצעה בלי תאריך בסוף (אין להם עדיפות-תאריך אמיתית).
 * @returns {{queue, dueToday, dueThisWeek, awaitingReplyCount, archiveCount, activeCount}}
 */
export function buildActionQueue(jobs, flags, today) {
  const list = jobs || [];
  const active = list.filter(job => isActiveJob(job, flags));
  const queue = active
    .filter(job => isQueueActionable(job, flags, today))
    .sort((a, b) => (a.next_action_at || today).localeCompare(b.next_action_at || today));
  const dueToday = queue.filter(job => !job.next_action_at || job.next_action_at <= today);
  const dueThisWeek = queue.filter(job => job.next_action_at && job.next_action_at > today);
  // "ממתין לתשובה": פעילה, לא בתור (אין צורך בטיפול עכשיו), אבל כן יש פולו-אפ מתוכנן מעבר
  // לשבוע הקרוב - לא "נעלמת", רק לא דוחקת את מה שדחוף.
  const awaitingReplyCount = active.filter(job => !isQueueActionable(job, flags, today) && job.next_action && job.next_action_at).length;
  const archiveCount = list.filter(job => CLOSED_STATUSES.includes(job?.status)).length;
  return { queue, dueToday, dueThisWeek, awaitingReplyCount, archiveCount, activeCount: active.length };
}
