// רשומת audit מינימלית: מי, מתי, איזה קובץ (hash בלבד) וכמה. בלי תוכן שורות, בלי תיאורים, בלי סכומים.
// כאן רק בנייה; השמירה בפועל (טבלה עם RLS) שייכת ל-PR 2.
export function buildAuditRecord({ userId, preview, now = Date.now() }) {
  return {
    userId,
    at: new Date(now).toISOString(),
    source: "riseup-manual-export",
    fileSha256: preview.fileSha256,
    counts: { new: preview.summary.new, duplicate: preview.summary.duplicate, invalid: preview.summary.invalid },
  };
}
