// שגיאות ייבוא עם קוד יציב. ההודעות לא כוללות תוכן מהקובץ (לא מדליפים נתונים פיננסיים ללוגים/תגובות).
export class ImportError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = "ImportError";
    this.code = code;
    this.details = details;
  }
}

// קוד → סטטוס HTTP
export const HTTP_STATUS = Object.freeze({
  empty_file: 422, binary_file: 415, unsupported_format_xlsx: 415, unsupported_format: 415, encoding_unknown: 422,
  too_large: 413, too_many_rows: 413, unrecognized_headers: 422, malformed_csv: 422, import_not_configured: 503,
});
