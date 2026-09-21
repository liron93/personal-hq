// טביעת אצבע יציבה לכל תנועה → ייבוא idempotent: אותו קובץ פעמיים = אפס חדשות.
// שתי שורות זהות לגמרי באותו קובץ (למשל שתי קניות זהות באותו יום) הן שתי תנועות אמיתיות:
// מבדילים ביניהן לפי מספר ההופעה, ולא מוחקים אחת בשקט. הן מדווחות בנפרד ב-preview.
import { createHash } from "node:crypto";

const norm = s => String(s).toLocaleLowerCase("he").replace(/\s+/g, " ").trim();

export function fingerprint(row, occurrence) {
  const key = [row.date, row.amountMinor, row.direction, norm(row.description), row.account ?? "", occurrence].join("|");
  return createHash("sha256").update(key).digest("hex");
}

/** מוסיף fingerprint ו-occurrence לכל שורה. */
export function assignFingerprints(rows) {
  const seen = new Map();
  return rows.map(row => {
    const base = [row.date, row.amountMinor, row.direction, norm(row.description), row.account ?? ""].join("|");
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    return { ...row, occurrence, fingerprint: fingerprint(row, occurrence) };
  });
}

/** מפריד שורות חדשות מאלו שכבר קיימות (existing: Set של fingerprints). */
export function partitionByExisting(rows, existing = new Set()) {
  const fresh = [], duplicates = [];
  for (const row of rows) (existing.has(row.fingerprint) ? duplicates : fresh).push(row);
  return { fresh, duplicates };
}

/** כמה שורות בקובץ זהות לשורה אחרת בו (נשארות נפרדות, רק מדווחות). */
export function countIdenticalInFile(rows) {
  return rows.filter(r => r.occurrence > 1).length;
}
