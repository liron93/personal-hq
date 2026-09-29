// Route דק: כל הלוגיקה ב-lib/quote-handler.mjs (אימות שרת -> קצב -> ולידציה -> Finnhub).
// המפתח (FINNHUB_API_KEY) נשאר בשרת בלבד. פירוט ב-docs/api-auth.md.
import { createQuoteHandler } from "@/lib/quote-handler.mjs";
import { createApiGuard } from "@/lib/server-auth.mjs";

export const dynamic = "force-dynamic";

export const GET = createQuoteHandler({
  guard: createApiGuard(),
  getApiKey: () => process.env.FINNHUB_API_KEY,
});
