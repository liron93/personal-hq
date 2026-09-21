// ייבוא ידני של קובץ ייצוא מרייזאפ — הגדרות. אין כאן חיבור לחשבון, אין credentials.
//
// מגבלת גודל: 4MB, כי בקשות לפונקציות Vercel מוגבלות ל-4.5MB גוף.
export const LIMITS = Object.freeze({ maxBytes: 4 * 1024 * 1024, maxRows: 20_000, maxCellChars: 500, maxDescriptionChars: 200, maxErrorsReported: 50, sampleRows: 20 });

// קטגוריות התקציב של kesef (עותק של BUDGET_CATS_DEFAULT ב-companies/kesef/model.js; lib לא מייבא מ-companies).
export const BUDGET_CATEGORIES = Object.freeze(["מזון", "ביטוחים", "מנויים", "פנאי", "חיסכון", "אחר"]);

/**
 * מיפוי העמודות של הקובץ. **שמות העמודות האמיתיים של רייזאפ עוד לא אומתו**, ולכן המיפוי כאן
 * הוא null ולא ניחוש: הנתיב מחזיר `import_not_configured` עד שממלאים אותו לפי קובץ אמיתי.
 * צורת ההגדרה:
 * {
 *   columns: { date, description, amount } | { date, description, debit, credit }  // שמות העמודות בקובץ, בדיוק
 *            + אופציונלי: category, account
 *   dateFormat: "DD/MM/YYYY" | "DD.MM.YYYY" | "DD-MM-YYYY" | "YYYY-MM-DD" | "DD/MM/YY",
 *   decimalSeparator: "." | ",",
 *   expenseSign: "negative" | "positive",   // רק לעמודת amount אחת
 *   categoryMap?: { "<קטגוריה בקובץ>": "<קטגוריית kesef>" },
 * }
 */
export const RISEUP_IMPORT_CONFIG = null;

export const DATE_FORMATS = Object.freeze(["DD/MM/YYYY", "DD.MM.YYYY", "DD-MM-YYYY", "YYYY-MM-DD", "DD/MM/YY"]);

export function validateImportConfig(cfg) {
  const errors = [];
  const c = cfg?.columns;
  if (!c || typeof c !== "object") return { ok: false, errors: ["columns"] };
  const named = v => typeof v === "string" && v.trim().length > 0;
  if (!named(c.date)) errors.push("columns.date");
  if (!named(c.description)) errors.push("columns.description");
  const signed = named(c.amount), split = named(c.debit) && named(c.credit);
  if (signed === split) errors.push("columns.amount|debit+credit"); // בדיוק אחד משני המצבים
  for (const opt of ["category", "account"]) if (c[opt] != null && !named(c[opt])) errors.push(`columns.${opt}`);
  if (!DATE_FORMATS.includes(cfg.dateFormat)) errors.push("dateFormat");
  if (![".", ","].includes(cfg.decimalSeparator)) errors.push("decimalSeparator");
  if (signed && !["negative", "positive"].includes(cfg.expenseSign)) errors.push("expenseSign");
  const names = Object.values(c).filter(named).map(v => v.trim());
  if (new Set(names).size !== names.length) errors.push("columns.duplicate");
  return { ok: !errors.length, errors };
}

export function isConfigured(cfg = RISEUP_IMPORT_CONFIG) {
  return !!cfg && validateImportConfig(cfg).ok;
}
