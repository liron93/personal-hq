// אימות בצד שרת ל-API routes. deny-by-default: בלי Bearer token תקף שאומת מול Supabase Auth — אין גישה.
// משתמש רק במפתח ה-anon הציבורי (אותו אחד שהדפדפן משתמש בו). אין מפתח מנהל (admin), לא כאן ולא בשום מקום בקוד לקוח.
// AuthGate בדפדפן רק מסתיר ממשק; האימות האמיתי לנתיבים רגישים חייב לקרות כאן.

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
      if (error || !data?.user?.id) return { ok: false, reason: "invalid_token" };
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
