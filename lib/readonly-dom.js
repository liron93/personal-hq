// מצב קריאה בלבד ב-UI: מזהה אילו כפתורים הם "עריכה" (הוספה, מחיקה, שמירה, העלאה, סימון) כדי להשבית אותם בצורה ברורה,
// בלי לשכתב את רכיבי החברות. זו שכבת תצוגה בלבד: החסימה האמיתית היא ב-lib/store.js (אין כתיבה) וב-RLS.
// כפתורי ניווט, פילטרים, פתיחה והורדה של קובץ נשארים פעילים.

// איקונים של lucide שמשמשים בכל האפליקציה רק לפעולות עריכה (הוסף, מחק, העלה, ערוך, סמן כבוצע, הסר).
const EDIT_ICONS = ["plus", "trash-2", "trash", "upload", "pencil", "square-pen", "check", "x", "refresh-cw"];
// מילות פעולה בעברית, בתחילת הטקסט או כמילה שלמה.
const EDIT_TEXT = /(^|\s)(\+|הוסף|הוספ|מחק|מחיק|הסר|ערוך|עריכ|שמור|שמיר|עדכן|עדכון|העלה|העלא|יבוא|ייבוא|החלף)/;
const KEEP_LABEL = /סגיר|close|פתח|הורד|צפי|תצוגה|ניסיו/i; // סגירת חלון, פתיחה, הורדה, ניסיון חוזר: לא עריכה

/** @param {{textContent?:string, getAttribute:(n:string)=>string|null, querySelector:(s:string)=>any}} el */
export function isEditControl(el) {
  const label = `${el.getAttribute("aria-label") || ""} ${el.getAttribute("title") || ""}`.trim();
  const text = (el.textContent || "").replace(/\s+/g, " ").trim();
  if (el.getAttribute("data-hq-edit") === "1") return true; // סימון מפורש ברכיב
  if (KEEP_LABEL.test(label)) return false;
  if (EDIT_TEXT.test(`${label} ${text}`)) return true;
  return EDIT_ICONS.some(name => !!el.querySelector(`svg.lucide-${name}`));
}

export const READONLY_TITLE = "צפייה בלבד: אין הרשאת עריכה";

/** משבית שדות קלט וכפתורי עריכה בתוך root, וממשיכה לעקוב אחרי תוכן שנוצר אחר כך. מחזירה פונקציית ניקוי. */
export function applyReadOnly(root, MutationObserverImpl = globalThis.MutationObserver) {
  const apply = () => {
    root.querySelectorAll("input, textarea, select").forEach(el => { el.disabled = true; });
    root.querySelectorAll("button").forEach(btn => {
      if (btn.disabled || btn.getAttribute("data-hq-readonly") === "1" || !isEditControl(btn)) return;
      btn.disabled = true;
      btn.setAttribute("data-hq-readonly", "1");
      btn.setAttribute("title", READONLY_TITLE);
      btn.style.opacity = "0.4";
      btn.style.cursor = "not-allowed";
    });
  };
  apply();
  const obs = MutationObserverImpl ? new MutationObserverImpl(apply) : null;
  obs?.observe(root, { childList: true, subtree: true });
  return () => obs?.disconnect();
}
