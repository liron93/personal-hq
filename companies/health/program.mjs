// קבועים ולוגיקה טהורה של תוכנית האימונים A/B/C.
// אין כאן תוכנית ברירת מחדל: תרגילים ומשקלים מגיעים רק ממה שהמשתמש הזין או ייבא (למשל נתוני Hevy בעתיד).

export const SESSION_IDS = ["A", "B", "C"];
export const SAFE_ANSWER = "לא ידוע לי על מגבלה";
export const DEFAULT_REST = 75; // שניות; רק מרווח מנוחה בטיימר, לא תוכן תוכנית

// מגבלה או אי-ודאות => לא מציגים תוכנית תרגילים (כמו ב-README של החברה).
export function isRestricted(profile) {
  const p = profile || {};
  return Boolean(p.sensitiveFlag) || (Boolean(p.safety) && p.safety !== SAFE_ANSWER);
}

// חלופה קצרה לימים בלי זמן: לא מכתיבה תרגילים, רק תנועה שנספרת.
export const SHORT_ALTERNATIVE = {
  title: "10 דקות של תנועה",
  items: ["הליכה קצרה, מתיחות או כל תנועה שנוחה לך עכשיו", "אחרי זה רושמים אימון קצר, וזה נספר"],
};

const HEADER = /^(?:אימון\s*)?([ABC])\s*:?$/i;

// הזנה/ייבוא מהיר. שורת כותרת "A" / "אימון B", ואז שורה לתרגיל: שם | סטים | טווח חזרות | משקל (אופציונלי).
// מפרידים: | ; טאב, או פסיק (פסיק בין ספרות הוא נקודה עשרונית, למשל 22,5). חסר סטים/חזרות => השורה נדחית עם הודעה. משקל חסר נשאר ריק, אף פעם לא מנוחש.
export function parseProgramText(text) {
  const sessions = {}, errors = [];
  let current = null;
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const h = line.match(HEADER);
    if (h) { current = h[1].toUpperCase(); sessions[current] = sessions[current] || []; return; }
    const parts = line.split(/\s*[|;\t]\s*|,\s+|(?<=\D),(?=\S)/).map(s => s.trim());
    if (!current) { errors.push({ line: i + 1, message: "שורה לפני כותרת אימון (A, B או C)" }); return; }
    const [name, sets, reps, load] = parts;
    const n = parseInt(sets, 10);
    if (!name) { errors.push({ line: i + 1, message: "חסר שם תרגיל" }); return; }
    if (!Number.isFinite(n) || n < 1) { errors.push({ line: i + 1, message: `חסר מספר סטים בתרגיל "${name}"` }); return; }
    if (!reps) { errors.push({ line: i + 1, message: `חסר טווח חזרות בתרגיל "${name}"` }); return; }
    sessions[current].push({ name, sets: n, reps, load: load || null });
  });
  return { sessions, errors };
}
