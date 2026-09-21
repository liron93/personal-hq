// קליטת הקובץ: בדיקות בטיחות על הבתים, פענוח קידוד, CSV → רשומות לפי מיפוי עמודות מפורש.
// לא מבצע שום פעולה חיצונית ולא שומר דבר. כשל = ImportError עם קוד, לא ניחוש.
import { ImportError } from "./errors.js";
import { LIMITS } from "./config.js";

const startsWith = (bytes, sig) => sig.every((b, i) => bytes[i] === b);

/** דוחה קבצים שאינם טקסט: xlsx/zip, מסמכי OLE ישנים (xls/doc), PDF, וכל דבר עם בתי NUL. */
export function assertTextBytes(bytes) {
  if (!bytes || !bytes.length) throw new ImportError("empty_file");
  if (bytes.length > LIMITS.maxBytes) throw new ImportError("too_large");
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06])) throw new ImportError("unsupported_format_xlsx");
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0]) || startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) throw new ImportError("unsupported_format");
  const utf16 = startsWith(bytes, [0xff, 0xfe]) || startsWith(bytes, [0xfe, 0xff]);
  if (!utf16 && bytes.includes(0)) throw new ImportError("binary_file");
}

export function decodeText(bytes) {
  if (startsWith(bytes, [0xff, 0xfe])) return { text: new TextDecoder("utf-16le").decode(bytes.subarray(2)), encoding: "utf-16le" };
  if (startsWith(bytes, [0xfe, 0xff])) return { text: new TextDecoder("utf-16be").decode(bytes.subarray(2)), encoding: "utf-16be" };
  try {
    const body = startsWith(bytes, [0xef, 0xbb, 0xbf]) ? bytes.subarray(3) : bytes;
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(body), encoding: "utf-8" };
  } catch { /* לא UTF-8 תקין — ננסה קידוד עברי ישן */ }
  const text = new TextDecoder("windows-1255").decode(bytes);
  if (/[\u0000-\u0008\u000e-\u001f�]/.test(text)) throw new ImportError("encoding_unknown");
  return { text, encoding: "windows-1255" };
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r\n|\n|\r/, 1)[0] || "";
  let best = ",", bestCount = 0;
  for (const d of [",", ";", "\t"]) {
    let inQuotes = false, count = 0;
    for (const ch of firstLine) { if (ch === '"') inQuotes = !inQuotes; else if (ch === d && !inQuotes) count++; }
    if (count > bestCount) { best = d; bestCount = count; }
  }
  return best;
}

/** CSV לפי RFC 4180: שדות במרכאות, מרכאות כפולות, מעברי שורה בתוך שדה, CRLF/LF/CR. */
export function parseCsv(text, delimiter = detectDelimiter(text)) {
  const rows = []; let row = [], cell = "", inQuotes = false, i = 0, touched = false;
  const endCell = () => { row.push(cell); cell = ""; };
  const endRow = () => {
    endCell();
    if (!(row.length === 1 && row[0] === "" && !touched)) rows.push(row);
    row = []; touched = false;
    if (rows.length > LIMITS.maxRows + 1) throw new ImportError("too_many_rows");
  };
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i += 2; continue; } inQuotes = false; i++; continue; }
      cell += ch; i++; continue;
    }
    if (ch === '"' && cell === "") { inQuotes = true; touched = true; i++; continue; }
    if (ch === delimiter) { endCell(); touched = true; i++; continue; }
    if (ch === "\r" || ch === "\n") { if (ch === "\r" && text[i + 1] === "\n") i++; endRow(); i++; continue; }
    cell += ch; touched = true; i++;
  }
  if (inQuotes) throw new ImportError("malformed_csv");
  if (cell !== "" || row.length || touched) endRow();
  return { delimiter, rows };
}

const normHeader = h => String(h ?? "").replace(/[\u200e\u200f\u202a-\u202e\ufeff]/g, "").trim().replace(/\s+/g, " ");

/**
 * מפרק את הקובץ לרשומות לפי config.columns. עמודה נדרשת שחסרה → unrecognized_headers (רק שמות לוגיים בהודעה).
 * עמודות נוספות בקובץ מתעלמים מהן ולא שומרים אותן; שמותיהן מדווחים ב-ignoredColumns.
 */
export function readImportFile(bytes, config) {
  assertTextBytes(bytes);
  const { text, encoding } = decodeText(bytes);
  const { delimiter, rows } = parseCsv(text);
  if (!rows.length) throw new ImportError("empty_file");
  const headers = rows[0].map(normHeader);
  const wanted = Object.entries(config.columns).map(([logical, header]) => [logical, normHeader(header)]);
  const index = new Map(); const missing = [];
  for (const [logical, header] of wanted) {
    const at = headers.indexOf(header);
    if (at === -1) { if (!["category", "account"].includes(logical)) missing.push(logical); } else index.set(logical, at);
  }
  if (missing.length) throw new ImportError("unrecognized_headers", { missing });
  const used = new Set(index.values());
  const ignoredColumns = headers.filter((h, at) => h && !used.has(at)).slice(0, 50);
  const records = [];
  for (let r = 1; r < rows.length; r++) {
    const raw = rows[r];
    if (raw.every(c => c.trim() === "")) continue;
    const cells = {}; let tooLong = false;
    for (const [logical, at] of index) { const v = raw[at] ?? ""; if (v.length > LIMITS.maxCellChars) tooLong = true; cells[logical] = v; }
    records.push({ rowNumber: r + 1, cells, columnMismatch: raw.length !== headers.length, tooLong });
  }
  if (records.length > LIMITS.maxRows) throw new ImportError("too_many_rows");
  return { encoding, delimiter, ignoredColumns, records };
}
