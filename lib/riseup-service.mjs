// לקוח RiseUp read-only ל-GET /api/external/budget/:budgetDate, מבודד מה-route/handler
// כדי שאפשר לבדוק בלי רשת (fetcher מוזרק, כמו lib/eodhd-service.mjs עושה עבור EODHD).
//
// הערת מיפוי-שמות: התבקשתי למקם "ERROR_CATEGORIES"/"categorizeUpstreamStatus" בהתאם למוסכמת
// השמות של lib/eodhd-service.mjs - אבל בפועל, בענף הבסיס (asaf/api-auth-hardening) שעליו
// עובד ה-branch הזה, lib/eodhd-service.mjs לא מכיל קבועים בשם הזה (נבדק ב-grep לפני הכתיבה
// - הקובץ ממפה סטטוסים ל-MarketError עם הודעה בעברית inline, בלי אובייקט קטגוריות נפרד).
// יצרתי כאן בכל זאת מבנה קטגוריות מפורש בשם הזה כי הוא שימושי (ומופיע בדרישה), אבל זה לא
// "מראה" קיים בפועל בקוד - מתועד גם ב-PR.
import { fetchWithTimeout } from "./api-utils.mjs";

const BASE_URL = "https://input.riseup.co.il";
const TIMEOUT_MS = 8000; // כמו EODHD (~8-9s), ראו lib/eodhd-service.mjs / lib/quote-handler.mjs
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export const ERROR_CATEGORIES = Object.freeze({
  TOKEN_INVALID: "token_invalid",       // 401
  SCOPE_INSUFFICIENT: "scope_insufficient", // 403
  INVALID_REQUEST: "invalid_request",   // 400
  NOT_FOUND: "no_data",                 // 404
  RATE_LIMITED: "rate_limited",         // 429
  UPSTREAM_ERROR: "upstream_error",     // 5xx / מבנה תגובה לא תקין
  NETWORK_ERROR: "network_error",       // fetch נכשל / timeout
});

export class RiseupError extends Error {
  constructor(category, message, extra = {}) {
    super(message);
    this.category = category;
    Object.assign(this, extra);
  }
}

/** ממפה קוד סטטוס עליון (RiseUp) לקטגוריה עברית-פונה-למשתמש. 2xx -> null (אין שגיאה). */
export function categorizeUpstreamStatus(status) {
  if (status >= 200 && status < 300) return null;
  if (status === 401) return ERROR_CATEGORIES.TOKEN_INVALID;
  if (status === 403) return ERROR_CATEGORIES.SCOPE_INSUFFICIENT;
  if (status === 400) return ERROR_CATEGORIES.INVALID_REQUEST;
  if (status === 404) return ERROR_CATEGORIES.NOT_FOUND;
  if (status === 429) return ERROR_CATEGORIES.RATE_LIMITED;
  if (status >= 500) return ERROR_CATEGORIES.UPSTREAM_ERROR;
  return ERROR_CATEGORIES.UPSTREAM_ERROR; // סטטוס לא צפוי אחר - עדיף "שגיאת ספק" גנרית מקריסה
}

export function isValidBudgetDate(value) {
  return value === "current" || value === "previous" || MONTH_RE.test(String(value || ""));
}

/** רישום בטוח: scope + סטטוס + X-Riseup-Token-Ref בלבד. לעולם לא הטוקן או גוף התשובה. */
function logSafe(scope, status, tokenRef) {
  console.warn(`[riseup] ${String(scope).slice(0, 40)} status=${status} ref=${String(tokenRef || "-").slice(0, 64)}`);
}

/**
 * מתאם עסקה בודדת מ-envelope.actuals[] למבנה מנורמל. המבנה האמיתי (ref 905bc4aae4a5bc53,
 * 30.9.2026, מלוג חקר שדות בטוח שהוסר עכשיו - לא ראינו אף ערך אמיתי, רק שמות שדות) כולל
 * transactionId/transactionDate/billingDate/businessName/billingAmount/originalAmount/
 * accountNickname/accountNumberHash/isIncome/isInstallment/paymentNumber/
 * totalNumberOfPayments/expense/sequenceId/placement - לא מתועד רשמית, אז כל שדה כאן
 * מגיע עם fallback בטוח. date: מעדיפים transactionDate (מתי בוצעה הרכישה בפועל) על פני
 * billingDate (מתי היא מופיעה בחיוב) - ניחוש סביר, לא אישור רשמי מ-RiseUp.
 */
function normalizeTransaction(t) {
  if (!t || typeof t !== "object" || typeof t.transactionId !== "string") return null;
  return {
    id: t.transactionId,
    date: typeof t.transactionDate === "string" ? t.transactionDate : (typeof t.billingDate === "string" ? t.billingDate : null),
    business: typeof t.businessName === "string" ? t.businessName : "",
    amount: Number.isFinite(t.billingAmount) ? t.billingAmount : (Number.isFinite(t.originalAmount) ? t.originalAmount : 0),
    isIncome: t.isIncome === true,
    isInstallment: t.isInstallment === true,
    paymentNumber: Number.isFinite(t.paymentNumber) ? t.paymentNumber : null,
    totalPayments: Number.isFinite(t.totalNumberOfPayments) ? t.totalNumberOfPayments : null,
  };
}

/**
 * חקר חד-פעמי נוסף (זמני, להסרה אחרי שהתשובה ידועה): לירון שאל למה אין שם/קטגוריה
 * למעטפה למרות שברייזאפ עצמם יש שמות קטגוריה ברורים ("מזון", "ביטוחים" וכו'). ייתכן
 * ששם/קטגוריה מוסתרים ברמת המעטפה עצמה (לא בתוך actuals) בדיוק כמו ש-businessName
 * התגלה בעבר בתוך actuals אחרי שהנחנו בטעות שהוא לא קיים בכלל. שמות שדות בלבד (איחוד על
 * כל המעטפות בתגובה) - לעולם לא ערך אמיתי.
 */
function logEnvelopeFieldsSafe(scope, envelopes) {
  if (!Array.isArray(envelopes) || envelopes.length === 0) { console.warn(`[riseup:envelope-fields] ${String(scope).slice(0, 40)} no-envelopes`); return; }
  const known = new Set(["id", "type", "originalAmount", "balancedAmount", "balanceDate", "actuals"]);
  const allKeys = new Set();
  for (const e of envelopes) { if (e && typeof e === "object") for (const k of Object.keys(e)) allKeys.add(k); }
  const unknown = [...allKeys].filter(k => !known.has(k));
  console.warn(`[riseup:envelope-fields] ${String(scope).slice(0, 40)} allKeys=${[...allKeys].join(",")} unknownKeys=${unknown.join(",") || "none"}`);
}

// עדכון 29.9.2026 (ממצא עמית מפרודקשן, ref 905bc4aae4a5bc53): הלקוח האמיתי של RiseUp לא
// מחזיר cashflowHash בכלל - יש _meta במקום, שהצורה שלו לא מתועדת ולא נבדקת (לא הצורך שלנו:
// לא סומכים על שדה לא-מתועד לדה-דופ). לכן מחשבים fingerprint מקומי מהנתונים המנורמלים
// עצמם (budgetDate + מזהי/סכומי envelopes, ממוינים), ומשתמשים בו בתור cashflowHash כלפי
// שאר הקוד - כך ש-riseup-sync-model.js (דה-דופ, buildSyncedSnapshot) לא צריך לדעת שהשדה
// מחושב מקומית ולא הגיע מהשרת. FNV-1a: לא קריפטוגרפי, לא צריך להיות - זה רק טביעת אצבע
// ליציבות "לא השתנה כלום", לא אבטחה.
function fnv1a(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** טביעת אצבע יציבה ל-envelopes+budgetDate: אותו קלט (בכל סדר) => אותה טביעה. */
export function computeLocalFingerprint(budgetDate, envelopes) {
  const rows = (Array.isArray(envelopes) ? envelopes : [])
    .filter(e => e && typeof e.id === "string")
    .map(e => `${e.id}|${e.type ?? ""}|${Number.isFinite(e.originalAmount) ? e.originalAmount : ""}|${Number.isFinite(e.balancedAmount) ? e.balancedAmount : ""}|${e.balanceDate ?? ""}`)
    .sort();
  return "local:" + fnv1a(`${budgetDate}::${rows.join(";")}`);
}

/**
 * לקוח RiseUp: fetcher/baseUrl/timeoutMs מוזרקים כדי לאפשר בדיקה מלאה בלי רשת אמיתית
 * ובלי חשיפה מקרית של https://input.riseup.co.il בבדיקות. אף בדיקה בפרויקט הזה לא קוראת
 * לספק האמיתי - תמיד עם fetcher מזויף.
 */
export function createRiseupService({ fetcher = fetch, baseUrl = BASE_URL, timeoutMs = TIMEOUT_MS } = {}) {
  return async function fetchBudget(token, { month = "current", scope = "riseup" } = {}) {
    if (!token) throw new RiseupError(ERROR_CATEGORIES.TOKEN_INVALID, "טוקן RiseUp חסר.");
    if (!isValidBudgetDate(month)) throw new RiseupError(ERROR_CATEGORIES.INVALID_REQUEST, "חודש תקציב לא תקין.");

    let response;
    try {
      response = await fetchWithTimeout(
        fetcher,
        `${baseUrl}/api/external/budget/${month}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", redirect: "error" },
        timeoutMs
      );
    } catch {
      // fetch שנכשל (רשת) ו-timeout (AbortSignal) שניהם מגיעים לכאן - "network/timeout" היא קטגוריה אחת
      throw new RiseupError(ERROR_CATEGORIES.NETWORK_ERROR, "לא ניתן להתחבר לשירות RiseUp כרגע. נסו שוב בעוד רגע.");
    }

    const tokenRef = response.headers.get("X-Riseup-Token-Ref");
    logSafe(scope, response.status, tokenRef);

    const category = categorizeUpstreamStatus(response.status);
    if (category) {
      if (category === ERROR_CATEGORIES.RATE_LIMITED) {
        let retryAfterSeconds = Number(response.headers.get("Retry-After"));
        if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds <= 0) retryAfterSeconds = null;
        let windowLabel = null;
        try {
          const body = await response.json();
          if (Number.isFinite(body?.retryAfterSeconds) && body.retryAfterSeconds > 0) retryAfterSeconds = body.retryAfterSeconds;
          if (typeof body?.window === "string") windowLabel = body.window;
        } catch { /* אין גוף/גוף לא תקין - ממשיכים עם מה שיש מה-header */ }
        const seconds = retryAfterSeconds || 60;
        const windowHe = windowLabel === "day" ? " להיום" : windowLabel === "minute" ? " לדקה" : "";
        throw new RiseupError(
          category,
          `הגעתם למגבלת הבקשות של RiseUp${windowHe}. הטוקן עשוי להיות משותף עם כלים אחרים. נסו שוב בעוד כ-${seconds} שניות.`,
          { retryAfterSeconds: seconds, window: windowLabel }
        );
      }
      const MESSAGES = {
        [ERROR_CATEGORIES.TOKEN_INVALID]: "הטוקן של RiseUp לא תקין, פג תוקפו או בוטל. יש להנפיק Personal Access Token מחדש.",
        [ERROR_CATEGORIES.SCOPE_INSUFFICIENT]: "לטוקן של RiseUp אין הרשאת קריאת תקציב (budget:read).",
        [ERROR_CATEGORIES.INVALID_REQUEST]: "הבקשה לשירות RiseUp לא תקינה (חודש/פרמטר שגוי).",
        [ERROR_CATEGORIES.NOT_FOUND]: "אין נתוני תקציב אצל RiseUp לחודש המבוקש.",
        [ERROR_CATEGORIES.UPSTREAM_ERROR]: "שירות RiseUp אינו זמין כרגע. נסו שוב בעוד כמה דקות.",
      };
      throw new RiseupError(category, MESSAGES[category] || "שגיאה בשירות RiseUp.", { status: response.status });
    }

    let body;
    try { body = await response.json(); } catch { throw new RiseupError(ERROR_CATEGORIES.UPSTREAM_ERROR, "תגובה לא תקינה משירות RiseUp."); }
    logEnvelopeFieldsSafe(scope, body?.envelopes); // חקר זמני - ראו הערה למעלה, להסרה אחרי שהתשובה ידועה
    // cashflowHash אינו נדרש: הלקוח האמיתי לא תמיד מחזיר אותו (ראו fingerprint מקומי למטה).
    if (!body || typeof body.customerId !== "number" || typeof body.budgetDate !== "string" || !Array.isArray(body.envelopes)) {
      throw new RiseupError(ERROR_CATEGORIES.UPSTREAM_ERROR, "תגובה לא תקינה משירות RiseUp.");
    }

    return {
      customerId: body.customerId,
      budgetDate: body.budgetDate,
      lastUpdatedAt: typeof body.lastUpdatedAt === "string" ? body.lastUpdatedAt : null,
      cashflowHash: typeof body.cashflowHash === "string" && body.cashflowHash ? body.cashflowHash : computeLocalFingerprint(body.budgetDate, body.envelopes),
      envelopes: body.envelopes
        .filter(e => e && typeof e.id === "string")
        .map(e => ({
          id: e.id,
          type: typeof e.type === "string" ? e.type : "unknown",
          originalAmount: Number.isFinite(e.originalAmount) ? e.originalAmount : 0,
          balancedAmount: Number.isFinite(e.balancedAmount) ? e.balancedAmount : 0,
          balanceDate: typeof e.balanceDate === "string" ? e.balanceDate : null,
          // עסקאות בפועל בתוך המעטפה - זה מה שמאפשר פילוח עסקה-עסקה (תאריך+עסק+סכום),
          // לא רק סיכום. ראו normalizeTransaction למעלה על המבנה הלא-מתועד.
          actuals: Array.isArray(e.actuals) ? e.actuals.map(normalizeTransaction).filter(Boolean) : [],
        })),
      fetchedAt: new Date().toISOString(),
    };
  };
}
