// בניית טיוטת preview. אין שמירה: זו תמונה של מה שיקרה אם המשתמש יאשר.
// שגיאות מדווחות כקוד + מספר שורה בלבד (בלי ערך התא), כדי לא להדליף תוכן פיננסי.
import { createHash } from "node:crypto";
import { LIMITS } from "./config.js";

export const sha256Hex = bytes => createHash("sha256").update(bytes).digest("hex");

const shekels = minor => minor / 100;

/**
 * @param {{fresh:object[], duplicates:object[], errors:object[], identicalInFile:number, ignoredColumns:string[], encoding:string, fileBytes:Uint8Array, dedupedAgainstExisting:boolean}} input
 */
export function buildPreview({ fresh, duplicates, errors, identicalInFile, ignoredColumns, encoding, fileBytes, dedupedAgainstExisting }) {
  const all = [...fresh, ...duplicates];
  const dates = all.map(r => r.date).sort();
  const sum = dir => fresh.filter(r => r.direction === dir).reduce((s, r) => s + r.amountMinor, 0);
  return {
    status: "draft",
    saved: false,
    fileSha256: sha256Hex(fileBytes),
    encoding,
    summary: {
      totalRows: all.length + errors.length,
      new: fresh.length,
      duplicate: duplicates.length,
      invalid: errors.length,
      unclassified: fresh.filter(r => r.direction === "out" && !r.category).length,
      identicalRowsKeptSeparate: identicalInFile,
      incomeTotal: shekels(sum("in")),
      expenseTotal: shekels(sum("out")),
      dateRange: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
    },
    dedupe: { againstExisting: dedupedAgainstExisting },
    ignoredColumns,
    errors: errors.slice(0, LIMITS.maxErrorsReported),
    errorsTruncated: errors.length > LIMITS.maxErrorsReported,
    sample: fresh.slice(0, LIMITS.sampleRows).map(r => ({
      rowNumber: r.rowNumber, date: r.date, amount: shekels(r.amountMinor), direction: r.direction,
      description: r.description, category: r.category, categorySource: r.categorySource, account: r.account,
    })),
  };
}
