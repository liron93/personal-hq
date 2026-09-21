// לוגיקת נתיב ה-preview, נפרדת מ-Next כדי שאפשר לבדוק אותה עם Request/Response רגילים.
// סדר הבדיקות (הכול deny-by-default): אימות → הרשאה → קצב → הגדרה → סוג/גודל → פענוח → preview.
// לא שומר קובץ, לא כותב ל-DB, לא כותב לוגים עם תוכן. מחזיר טיוטה בלבד.
import { LIMITS, BUDGET_CATEGORIES, isConfigured } from "./config.js";
import { ImportError, HTTP_STATUS } from "./errors.js";
import { readImportFile } from "./parse.js";
import { normalizeRecords } from "./normalize.js";
import { assignFingerprints, partitionByExisting, countIdenticalInFile } from "./dedupe.js";
import { classifyRows } from "./classify.js";
import { buildPreview } from "./preview.js";
import { buildAuditRecord } from "./audit.js";

const json = (body, status = 200, extra = {}) => Response.json(body, { status, headers: { "cache-control": "no-store", ...extra } });

/**
 * @param {{authenticate:Function, getConfig:()=>any, getAllowedUserIds:()=>Set<string>, limiter:{check:Function}, onAudit?:(record:object)=>void}} deps
 */
export function createPreviewHandler({ authenticate, getConfig, getAllowedUserIds, limiter, onAudit }) {
  return async function handle(request) {
    try {
      const auth = await authenticate(request);
      if (!auth.ok) return json({ code: "unauthorized" }, 401, { "www-authenticate": "Bearer" });
      if (!getAllowedUserIds().has(auth.user.id)) return json({ code: "not_allowed" }, 403);
      const rate = limiter.check(auth.user.id);
      if (!rate.ok) return json({ code: "rate_limited" }, 429, { "retry-after": String(rate.retryAfterSec) });

      const config = getConfig();
      if (!isConfigured(config)) return json({ code: "import_not_configured" }, HTTP_STATUS.import_not_configured);

      if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("multipart/form-data")) return json({ code: "unsupported_content_type" }, 415);
      const declared = Number(request.headers.get("content-length") || 0);
      if (declared > LIMITS.maxBytes + 64 * 1024) return json({ code: "too_large" }, 413);

      let form;
      try { form = await request.formData(); } catch { return json({ code: "bad_request" }, 400); }
      const file = form.get("file");
      if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") return json({ code: "file_required" }, 400);
      if (file.size > LIMITS.maxBytes) return json({ code: "too_large" }, 413);

      const bytes = new Uint8Array(await file.arrayBuffer());
      const read = readImportFile(bytes, config);
      const { rows, errors } = normalizeRecords(read.records, config);
      const withPrints = assignFingerprints(rows);
      // PR 1 אינו מחובר ל-DB: אין קבוצת fingerprints קיימת, והתשובה אומרת זאת במפורש (dedupe.againstExisting=false).
      const { fresh, duplicates } = partitionByExisting(withPrints, new Set());
      const classified = classifyRows(fresh, { categories: BUDGET_CATEGORIES });
      const preview = buildPreview({
        fresh: classified, duplicates, errors, identicalInFile: countIdenticalInFile(withPrints),
        ignoredColumns: read.ignoredColumns, encoding: read.encoding, fileBytes: bytes, dedupedAgainstExisting: false,
      });
      onAudit?.(buildAuditRecord({ userId: auth.user.id, preview }));
      return json({ preview });
    } catch (e) {
      if (e instanceof ImportError) return json({ code: e.code, ...(e.code === "unrecognized_headers" ? { missing: e.details.missing } : {}) }, HTTP_STATUS[e.code] ?? 422);
      return json({ code: "internal_error" }, 500); // בלי הודעה/stack: לא מדליפים תוכן
    }
  };
}
