// Route דק: כל הלוגיקה ב-lib/jarvis-handler.mjs (אימות שרת -> קצב -> ולידציה -> Gemini).
// המפתח (GEMINI_API_KEY) נשאר בשרת בלבד. פירוט ב-docs/api-auth.md.
import { createBriefingHandler } from "@/lib/jarvis-handler.mjs";
import { createApiGuard } from "@/lib/server-auth.mjs";

export const dynamic = "force-dynamic";

export const POST = createBriefingHandler({
  guard: createApiGuard(),
  getApiKey: () => process.env.GEMINI_API_KEY,
});
