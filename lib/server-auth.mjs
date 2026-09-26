// אימות בצד שרת ל-API routes. deny-by-default: בלי Bearer token תקף שאומת מול Supabase Auth - אין גישה.
// ה-API הציבורי של createAuthenticator / parseAllowedUserIds / authenticateRequest זהה במכוון
// ל-lib/server-auth.js שב-PR #69 (asaf/riseup-import-parse); כאן נוספו createApiGuard ו-isDemoApiAllowed.
// משתמש רק במפתח ה-anon הציבורי. אין מפתח מנהל (service role) בשום מקום.
import { fail, createRateLimiter, logCode } from "./api-utils.mjs";

const BEARER = /^Bearer ([A-Za-z0-9\-._~+/]+=*)$/;

/**
 * @param {{createClient:Function, url?:string, anonKey?:string}} deps  createClient מוזרק כדי שאפשר לבדוק בלי רשת.
 * @returns {(request:Request)=>Promise<{ok:true,user:{id:string,email:string|null}}|{ok:false,reason:string}>}
 */
export function createAuthenticator({ createClient, url, anonKey }) {
  return async function authenticate(request) {
    const match = BEARER.exec(request.headers.get("authorization") || "");
    if (!match || match[1].length > 4096) return { ok: false, reason: "missing_token" };
    if (!url || !anonKey) return { ok: false, reason: "auth_not_configured" };
    try {
      const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      const { data, error } = await client.auth.getUser(match[1]); // אימות מול השרת של Supabase, לא פענוח מקומי בלבד
      if (error || !data?.user?.id || data.user.is_anonymous) return { ok: false, reason: "invalid_token" };
      return { ok: true, user: { id: data.user.id, email: data.user.email ?? null } };
    } catch {
      return { ok: false, reason: "auth_unavailable" };
    }
  };
}

/** רשימת מזהי משתמשים מותרים מתוך משתנה סביבה מופרד בפסיקים. ריק/חסר = אף אחד לא מותר (fail closed). */
export function parseAllowedUserIds(value) {
  return new Set(String(value || "").split(",").map(s => s.trim()).filter(id => /^[0-9a-fA-F-]{36}$/.test(id)));
}

export async function authenticateRequest(request) {
  const { createClient } = await import("@supabase/supabase-js");
  return createAuthenticator({ createClient, url: process.env.NEXT_PUBLIC_SUPABASE_URL, anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY })(request);
}

/** מעקף דמו בשרת: רק מחוץ ל-production וגם עם דגל מפורש. לא ניתן להפעלה ב-build של production. */
export function isDemoApiAllowed(env = process.env) {
  return env.NODE_ENV !== "production" && env.ALLOW_DEMO_API === "1" && !env.VERCEL_ENV;
}

export const DEMO_USER = Object.freeze({ id: "demo-local-user", email: null, demo: true });

/**
 * שער אחיד לכל route: אימות -> הרשאה (API_ALLOWED_USER_IDS) -> הגבלת קצב.
 * deny-by-default להרשאה: משתמש אמיתי (לא demo) מורשה אך ורק אם מזהה שלו מופיע ב-API_ALLOWED_USER_IDS.
 * רשימה חסרה/ריקה/לא תקינה = אף משתמש אמיתי לא מורשה (403), לא "כולם מורשים".
 * route עם רשימת הרשאה ייעודית משלו (למשל eodhd עם EODHD_ALLOWED_USER_IDS, שגם היא fail-closed) מעביר
 * skipAllowlist:true כדי לא לדרוש גם חברות ב-API_ALLOWED_USER_IDS הגנרית.
 * מחזיר {ok:true,user} או {ok:false,response} כשה-response גנרי (401/403/429/503) ללא פרטים פנימיים.
 */
export function createApiGuard({ authenticate = authenticateRequest, env = process.env, limiter = createRateLimiter(), log = logCode } = {}) {
  return async function guard(request, { scope, limit = 30, windowMs = 60000, allowDemo = true, skipAllowlist = false } = {}) {
    let user = null;
    let result;
    try { result = await authenticate(request); } catch { result = { ok: false, reason: "auth_unavailable" }; }

    if (result?.ok) {
      user = result.user;
    } else if (allowDemo && result?.reason === "missing_token" && isDemoApiAllowed(env)) {
      user = DEMO_USER;
    } else {
      const reason = result?.reason || "invalid_token";
      log(scope, reason);
      if (reason === "auth_not_configured" || reason === "auth_unavailable") return { ok: false, response: fail("unavailable", 503) };
      return { ok: false, response: fail("unauthorized", 401) };
    }

    if (!user.demo && !skipAllowlist) {
      const raw = String(env.API_ALLOWED_USER_IDS || "").trim();
      // deny-by-default: רשימה חסרה/ריקה/לא תקינה => הקבוצה ריקה => אף משתמש אמיתי לא מורשה.
      if (!parseAllowedUserIds(raw).has(user.id)) {
        log(scope, "forbidden");
        return { ok: false, response: fail("forbidden", 403) };
      }
    }

    const rate = limiter(`${scope}:${user.id}`, limit, windowMs);
    if (!rate.ok) {
      log(scope, "rate_limited");
      return { ok: false, response: fail("rate_limited", 429, { "Retry-After": String(rate.retryAfter) }) };
    }
    return { ok: true, user };
  };
}
