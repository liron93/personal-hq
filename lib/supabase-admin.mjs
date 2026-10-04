// לקוח Supabase עם service-role - עוקף RLS, שרת בלבד. אין שימוש בקובץ הזה בשום מקום היום
// חוץ מ-lib/hevy-store.mjs; אסור לייבא אותו מרכיב "use client" או מכל קובץ שעלול להיטען
// בדפדפן - process.env.SUPABASE_SERVICE_ROLE_KEY חייב להישאר server-only.
// למה בכלל service-role כאן (ולא ה-anon+RLS הרגיל של כל שאר האפליקציה): health_hevy_connection
// מחזיקה ציפר-טקסט של מפתח Hevy אישי - עמודה שאסור שתהיה נגישה דרך שום client ישיר, גם לא
// לבעלים שלה (ראו lib/hevy-key.mjs) - האכיפה היחידה על "מי רואה מה" היא קוד ה-handler עצמו
// (מסנן לפי user_id מה-session), לא RLS. הטבלה עצמה עדיין עם RLS מופעל כהגנת-עומק (proposed SQL).
let cached = null;

/** createClient מוזרק כדי שאפשר לבדוק בלי רשת אמיתית, אותו עיקרון כמו lib/server-auth.mjs. */
export function createSupabaseAdmin({ createClient, url, serviceRoleKey }) {
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function getSupabaseAdmin() {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  const { createClient } = await import("@supabase/supabase-js");
  cached = createSupabaseAdmin({ createClient, url, serviceRoleKey });
  return cached;
}
