// נרמול שורות: תאריך → ISO, סכום → אגורות שלמות (בלי float), כיוון, תיאור נקי ובטוח.
// שורה שלא ניתן לנרמל בוודאות נדחית עם קוד שגיאה; לא מנחשים ערכים.
import { LIMITS } from "./config.js";

const INVISIBLE = /[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;
const CONTROL = /[\u0000-\u001f\u007f]/g;

/** תא שמתחיל ב-= + - @ (או tab/CR) עלול להיות מפורש כנוסחה כשמייצאים לגיליון. מקדימים גרש. */
export function neutralizeFormula(text) {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

export function cleanText(raw, max = LIMITS.maxDescriptionChars) {
  const t = String(raw ?? "").replace(INVISIBLE, "").replace(CONTROL, " ").replace(/\s+/g, " ").trim();
  return neutralizeFormula(t.length > max ? t.slice(0, max).trimEnd() : t);
}

const CURRENCY = /₪|ש"ח|ש״ח|שח|NIS|ILS/gi;

/**
 * "1,234.56" / "-1,234.56" / "(12.50)" / "₪ 99" / "12.5-" → אגורות שלמות (מספר שלם, עם סימן).
 * מחזיר null כשהערך לא חד-משמעי (למשל "12.345.67" או יותר משתי ספרות אחרי הנקודה העשרונית).
 */
export function parseAmountToMinor(raw, decimalSeparator = ".") {
  let s = String(raw ?? "").replace(INVISIBLE, "").replace(CURRENCY, "").replace(/[\s ]/g, "");
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  s = s.replace(/[−–]/g, "-");
  if (s.startsWith("-")) { negative = !negative; s = s.slice(1); } else if (s.startsWith("+")) s = s.slice(1);
  if (s.endsWith("-")) { negative = !negative; s = s.slice(0, -1); }
  const thousands = decimalSeparator === "." ? "," : ".";
  const esc = c => (c === "." ? "\\." : c);
  const grouped = new RegExp(`^\\d{1,3}(?:${esc(thousands)}\\d{3})+(?:${esc(decimalSeparator)}\\d{1,2})?$`);
  const plain = new RegExp(`^\\d+(?:${esc(decimalSeparator)}\\d{1,2})?$`);
  if (!grouped.test(s) && !plain.test(s)) return null;
  const [intPart, frac = ""] = s.split(decimalSeparator);
  const digits = intPart.split(thousands).join("");
  if (digits.length > 12) return null;
  const minor = Number(digits) * 100 + Number(frac.padEnd(2, "0"));
  return negative ? -minor : minor;
}

/** תאריך לפי הפורמט שהוגדר → "YYYY-MM-DD" רק אם הוא תאריך אמיתי בלוח השנה. */
export function parseDate(raw, format) {
  const s = String(raw ?? "").replace(INVISIBLE, "").trim().replace(/[ T]\d{1,2}:\d{2}(:\d{2})?$/, "");
  const parts = { "DD/MM/YYYY": /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, "DD.MM.YYYY": /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/, "DD-MM-YYYY": /^(\d{1,2})-(\d{1,2})-(\d{4})$/, "DD/MM/YY": /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/, "YYYY-MM-DD": /^(\d{4})-(\d{1,2})-(\d{1,2})$/ }[format];
  const m = parts?.exec(s);
  if (!m) return null;
  let [d, mo, y] = format === "YYYY-MM-DD" ? [m[3], m[2], m[1]] : [m[1], m[2], m[3]];
  d = Number(d); mo = Number(mo); y = Number(y);
  if (format === "DD/MM/YY") y += 2000;
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1) return null;
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** רק 4 הספרות האחרונות של מספר חשבון/כרטיס נשמרות. */
export function maskAccount(raw) {
  const d = String(raw ?? "").replace(/\D/g, "");
  return d.length >= 4 ? `••••${d.slice(-4)}` : d ? "••••" : null;
}

/**
 * @returns {{rows:object[], errors:{rowNumber:number, field:string, code:string}[]}}
 * שורה תקינה: { rowNumber, date, amountMinor (חיובי), direction:"in"|"out", description, category|null, account|null }
 */
export function normalizeRecords(records, config) {
  const rows = [], errors = [];
  const split = !!config.columns.debit;
  for (const rec of records) {
    const bad = (field, code) => errors.push({ rowNumber: rec.rowNumber, field, code });
    if (rec.tooLong) { bad("row", "cell_too_long"); continue; }
    if (rec.columnMismatch) { bad("row", "column_count_mismatch"); continue; }
    const date = parseDate(rec.cells.date, config.dateFormat);
    if (!date) { bad("date", "invalid_date"); continue; }
    let signed;
    if (split) {
      const debit = rec.cells.debit?.trim() ? parseAmountToMinor(rec.cells.debit, config.decimalSeparator) : 0;
      const credit = rec.cells.credit?.trim() ? parseAmountToMinor(rec.cells.credit, config.decimalSeparator) : 0;
      if (debit === null || credit === null) { bad("amount", "invalid_amount"); continue; }
      if (debit && credit) { bad("amount", "both_debit_and_credit"); continue; }
      signed = credit - Math.abs(debit);
    } else {
      const v = parseAmountToMinor(rec.cells.amount, config.decimalSeparator);
      if (v === null) { bad("amount", "invalid_amount"); continue; }
      signed = config.expenseSign === "negative" ? v : -v;
    }
    if (signed === 0) { bad("amount", "zero_amount"); continue; }
    const description = cleanText(rec.cells.description);
    if (!description) { bad("description", "empty_description"); continue; }
    const fileCategory = rec.cells.category ? cleanText(rec.cells.category, 60) : "";
    rows.push({
      rowNumber: rec.rowNumber, date, amountMinor: Math.abs(signed), direction: signed < 0 ? "out" : "in", description,
      category: fileCategory ? (config.categoryMap?.[fileCategory] ?? null) : null,
      account: rec.cells.account ? maskAccount(rec.cells.account) : null,
    });
  }
  return { rows, errors };
}
