// Route דק: כל הלוגיקה ב-lib/riseup-handler.mjs (שער #99 -> מפתח -> ולידציה -> lib/riseup-service.mjs).
// RISEUP_PAT נשאר בשרת בלבד. v1: קריאה בלבד, סנכרון ידני, ללא cron/היסטוריה.
import { createApiGuard } from "@/lib/server-auth.mjs";
import { createRiseupHandler } from "@/lib/riseup-handler.mjs";
import { createRiseupService } from "@/lib/riseup-service.mjs";
import { getRiseupKey } from "@/lib/riseup-key.mjs";

export const dynamic = "force-dynamic";

export const GET = createRiseupHandler({
  guard: createApiGuard(),
  getApiKey: getRiseupKey,
  service: createRiseupService(),
});
