// לוגיקת GET /api/riseup/budget, מופרדת מה-route לצורך בדיקה בלי רשת/שרת אמיתי -
// בדיוק כמו lib/eodhd-handler.mjs מול app/api/market/eodhd/route.js.
// סדר קבוע וקשיח: guard (שער #99, 401/403/429/503 גנרי) -> מפתח מוגדר בשרת? ->
// ולידציית ?month -> קריאה לשירות RiseUp -> תשובה. אף שלב לא קופץ קדימה על פני קודמו.
import { reply, fail } from "./api-utils.mjs";
import { RiseupError, ERROR_CATEGORIES, isValidBudgetDate } from "./riseup-service.mjs";

// קטגוריית שגיאת RiseUp -> קוד HTTP שמוחזר ללקוח שלנו. נבחר בכוונה כדי לא להתנגש עם
// הטיפול המיוחד ב-lib/api-client.mjs׳s apiErrorMessage() ל-401/403: שם הם מיועדים אך ורק
// למצב ההתחברות של personal-hq עצמו (guard.response כבר משתמש בהם למקרה הזה), ולא לשגיאות
// ספק. שגיאת ספק "הטוקן/ההרשאה של RiseUp עצמו לא בסדר" היא בעיית קונפיגורציה בצד השרת
// מנקודת המבט של המשתמש כאן - ולכן 503, לא 401/403, כדי שהודעת העברית האמיתית תוצג (ולא
// תוחלף אוטומטית ב"פג תוקף ההתחברות"). 429 כן עובר כפי שהוא: apiErrorMessage מעדיפה שם
// את הודעת השרת כשקיימת. פירוט נוסף בתיאור ה-PR.
const STATUS_BY_CATEGORY = {
  [ERROR_CATEGORIES.TOKEN_INVALID]: 503,
  [ERROR_CATEGORIES.SCOPE_INSUFFICIENT]: 503,
  [ERROR_CATEGORIES.INVALID_REQUEST]: 400,
  [ERROR_CATEGORIES.NOT_FOUND]: 404,
  [ERROR_CATEGORIES.RATE_LIMITED]: 429,
  [ERROR_CATEGORIES.UPSTREAM_ERROR]: 502,
  [ERROR_CATEGORIES.NETWORK_ERROR]: 502,
};

export function createRiseupHandler({ guard, getApiKey, service, scope = "riseup" }) {
  return async function GET(request) {
    try {
      // שער האימות/הרשאה/קצב תמיד ראשון - שום קריאה ל-RiseUp ולא אפילו קריאת המפתח לפניו.
      const gate = await guard(request, { scope, limit: 10, windowMs: 60000 });
      if (!gate.ok) return gate.response;

      const token = getApiKey();
      if (!token) return reply({ error: "סנכרון RiseUp עדיין לא מוגדר בשרת.", code: "not_configured", configured: false }, 503);

      const monthParam = new URL(request.url).searchParams.get("month");
      const month = monthParam ? monthParam.trim() : "current";
      if (!isValidBudgetDate(month)) return reply({ error: "פרמטר החודש (month) אינו תקין.", code: ERROR_CATEGORIES.INVALID_REQUEST, configured: true }, 400);

      try {
        const data = await service(token, { month, scope });
        return reply({ ...data, configured: true });
      } catch (error) {
        if (error instanceof RiseupError) {
          const status = STATUS_BY_CATEGORY[error.category] || 502;
          const body = { error: error.message, code: error.category, configured: true };
          if (error.category === ERROR_CATEGORIES.RATE_LIMITED) {
            body.retryAfterSeconds = error.retryAfterSeconds;
            if (error.window) body.window = error.window;
          }
          return reply(body, status);
        }
        throw error;
      }
    } catch {
      return fail("unavailable", 500);
    }
  };
}
