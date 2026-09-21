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
export const UNSET = "טרם נקבע";

// טווח חזרות: "8-12" (גם מקף ארוך) או מספר בודד "12". מחזיר {min,max} או null.
export function parseReps(s) {
  const m = String(s ?? "").trim().match(/^(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?$/);
  if (!m) return null;
  const min = +m[1], max = m[2] === undefined ? min : +m[2];
  return min >= 1 && max >= min ? { min, max } : null;
}
export const canonReps = s => { const r = parseReps(s); return r ? (r.min === r.max ? String(r.min) : `${r.min}-${r.max}`) : ""; };

// משקל חיובי בלבד (0 אינו משקל). נקודה או פסיק עשרוני. אחרת null (= טרם נקבע). לא ממציאים ערך.
export function parseWeight(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = parseFloat(s);
  return n > 0 ? String(n) : null;
}
const isUnsetToken = s => s === "" || s === UNSET;

// טקסט משקל לתרגיל בעברית: "טרם נקבע", "20 ק״ג", או "20 / 20 / טרם נקבע".
export function formatLoads(loads) {
  const l = (loads || []).map(x => (x ? String(x) : null));
  if (!l.length || l.every(x => x === null)) return UNSET;
  if (l.every(x => x === l[0])) return `${l[0]} ק״ג`;
  return l.map(x => x || UNSET).join(" / ") + " ק״ג";
}

// הזנה/ייבוא מהיר. כותרת "A" / "אימון B", ואז שורה לתרגיל: שם | סטים | טווח חזרות | משקל.
// טווח: 8-12 או 12. משקל: מספר (לכל הסטים), או רשימה מופרדת ב-/ באורך מספר הסטים (20/20/10, או 12.5/10/טרם נקבע);
// ריק או "טרם נקבע" = לא נקבע. מפרידי שדות: | ; או טאב (פסיק שמור לנקודה עשרונית).
// שורה שגויה מדווחת ואינה נטענת. שורות ריקות מותרות.
export function parseProgramText(text) {
  const sessions = {}, errors = [];
  let current = null;
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const h = line.match(HEADER);
    if (h) { current = h[1].toUpperCase(); sessions[current] = sessions[current] || []; return; }
    const err = message => errors.push({ line: i + 1, message });
    if (!current) return err("שורה לפני כותרת אימון (A, B או C)");
    const [name, setsRaw, repsRaw, weightRaw = ""] = line.split(/\s*[|;\t]\s*/).map(s => s.trim());
    if (!name) return err("חסר שם תרגיל");
    const sets = /^\d{1,2}$/.test(setsRaw || "") ? parseInt(setsRaw, 10) : NaN;
    if (!Number.isFinite(sets) || sets < 1 || sets > 10) return err(`מספר סטים לא תקין בתרגיל "${name}"`);
    if (!parseReps(repsRaw)) return err(`טווח חזרות לא תקין בתרגיל "${name}" (נדרש 8-12 או 12)`);
    let loads;
    if (isUnsetToken(weightRaw)) loads = Array(sets).fill(null);
    else if (weightRaw.includes("/")) {
      const parts = weightRaw.split("/").map(s => s.trim());
      if (parts.length !== sets) return err(`מספר המשקלים (${parts.length}) שונה ממספר הסטים (${sets}) בתרגיל "${name}"`);
      loads = [];
      for (const p of parts) {
        if (isUnsetToken(p)) { loads.push(null); continue; }
        const w = parseWeight(p);
        if (w === null) return err(`משקל לא תקין "${p}" בתרגיל "${name}"`);
        loads.push(w);
      }
    } else {
      const w = parseWeight(weightRaw);
      if (w === null) return err(`משקל לא תקין "${weightRaw}" בתרגיל "${name}"`);
      loads = Array(sets).fill(w);
    }
    sessions[current].push({ name, sets, reps: canonReps(repsRaw), loads });
  });
  return { sessions, errors };
}
