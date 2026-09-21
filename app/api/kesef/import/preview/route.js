// תצוגה מקדימה של ייבוא קובץ ייצוא מרייזאפ (שלב 1): מקבל קובץ, מחזיר טיוטה, לא שומר כלום.
// דורש Bearer token של Supabase (מאומת בשרת) + משתמש ברשימת FINANCE_IMPORT_ALLOWED_USER_IDS (fail closed).
// כל הלוגיקה ב-lib/riseup-import/handler.js. imports יחסיים בכוונה כדי שאפשר יהיה לבדוק בלי alias של Next.
import { createPreviewHandler } from "../../../../../lib/riseup-import/handler.js";
import { createRateLimiter } from "../../../../../lib/riseup-import/rate-limit.js";
import { RISEUP_IMPORT_CONFIG } from "../../../../../lib/riseup-import/config.js";
import { authenticateRequest, parseAllowedUserIds } from "../../../../../lib/server-auth.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const handler = createPreviewHandler({
  authenticate: authenticateRequest,
  getConfig: () => RISEUP_IMPORT_CONFIG,
  getAllowedUserIds: () => parseAllowedUserIds(process.env.FINANCE_IMPORT_ALLOWED_USER_IDS),
  limiter: createRateLimiter({ max: 10, windowMs: 60_000 }),
});

export const POST = request => handler(request);
