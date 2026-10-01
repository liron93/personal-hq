// לוגיקת POST /api/household/receipt-scan, מופרדת מה-route לבדיקה בלי רשת/שרת אמיתי -
// אותו דפוס בדיוק כמו lib/riseup-handler.mjs / lib/jarvis-handler.mjs.
// סדר קבוע: guard (אימות+קצב) -> מפתח מוגדר בשרת? -> גוף וולידציה -> lib/receipt-scan-service.mjs -> תשובה.
import { fail, reply, readJsonBody, logCode } from "./api-utils.mjs";
import { ReceiptScanError } from "./receipt-scan-service.mjs";

// MAX_IMAGE_BYTES: גבול על גוף הבקשה המלא (base64 מוסיף כ-33% לגודל המקורי). הלקוח מכווץ/
// מקטין את התמונה לפני שליחה (ראו Household.jsx) - זה רק תקרת ביטחון בצד שרת, לא ההגבלה
// המרכזית. 6MB מגוף ~ תמונה מקורית של עד כ-4.5MB אחרי דחיסה, סביר בהחלט לתמונת קבלה.
const MAX_BODY_BYTES = 6 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

const STATUS_BY_CODE = {
  bad_request: 400,
  rate_limited: 429,
  upstream_error: 502,
  network_error: 502,
  overloaded: 503,
};

export function createReceiptScanHandler({ guard, getApiKey, service, scope = "receipt-scan" }) {
  return async function POST(request) {
    try {
      const gate = await guard(request, { scope, limit: 15, windowMs: 60000 });
      if (!gate.ok) return gate.response;

      const apiKey = getApiKey();
      if (!apiKey) return reply({ error: "סריקת קבלות עדיין לא מוגדרת בשרת.", code: "not_configured", configured: false }, 503);

      const parsed = await readJsonBody(request, MAX_BODY_BYTES);
      if (!parsed.ok) return parsed.response;
      const { imageBase64, mimeType } = parsed.value && typeof parsed.value === "object" ? parsed.value : {};
      if (typeof imageBase64 !== "string" || !imageBase64 || imageBase64.length > MAX_BODY_BYTES) return fail("bad_request", 400);
      if (mimeType != null && !ALLOWED_MIME.has(mimeType)) return fail("bad_request", 400);

      try {
        const data = await service(apiKey, { imageBase64, mimeType });
        return reply({ ...data, configured: true });
      } catch (error) {
        if (error instanceof ReceiptScanError) {
          if (error.code === "not_configured") return reply({ error: error.message, code: error.code, configured: false }, 503);
          const status = STATUS_BY_CODE[error.code] || 502;
          return reply({ error: error.message, code: error.code, configured: true }, status);
        }
        throw error;
      }
    } catch {
      logCode("receipt-scan", "internal");
      return fail("unavailable", 500);
    }
  };
}
