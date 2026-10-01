// Route דק: כל הלוגיקה ב-lib/receipt-scan-handler.mjs (שער -> מפתח -> ולידציה -> Gemini).
// אותו GEMINI_API_KEY שכבר משמש את JARVIS - אין מפתח/הגדרה חדשה נדרשת.
import { createApiGuard } from "@/lib/server-auth.mjs";
import { createReceiptScanHandler } from "@/lib/receipt-scan-handler.mjs";
import { createReceiptScanService } from "@/lib/receipt-scan-service.mjs";

export const dynamic = "force-dynamic";

export const POST = createReceiptScanHandler({
  guard: createApiGuard(),
  getApiKey: () => process.env.GEMINI_API_KEY,
  service: createReceiptScanService(),
});
