// גישה לטבלת health_hevy_connection (ראה supabase/proposed/health/001_hevy_connection.sql) -
// client מוזרק (service-role, ראה lib/supabase-admin.mjs) כדי שאפשר לבדוק בלי רשת/DB אמיתיים.
// כל פונקציה כאן מקבלת userId כפרמטר מפורש ומסננת לפיו - ה-handler הוא שאחראי שה-userId
// הזה תמיד מגיע מה-session המאומת (gate.user.id), לעולם לא מה-body/query של הבקשה.
const TABLE = "health_hevy_connection";

/** {encryptedApiKey, connectedAt, lastCheckedAt, lastCheckOk} | null - לעולם לא עמודות נוספות. */
export async function getHevyConnection(admin, userId) {
  const { data, error } = await admin.from(TABLE).select("encrypted_api_key, created_at, last_checked_at, last_check_ok").eq("user_id", userId).maybeSingle();
  if (error || !data) return null;
  return { encryptedApiKey: data.encrypted_api_key, connectedAt: data.created_at, lastCheckedAt: data.last_checked_at, lastCheckOk: data.last_check_ok };
}

/** נשמר רק אחרי שהמפתח כבר אומת מול Hevy בפועל (דרישת עמית) - ולכן last_check_ok=true תמיד כאן. */
export async function saveHevyConnection(admin, userId, encryptedApiKey) {
  const now = new Date().toISOString();
  const { error } = await admin.from(TABLE).upsert({ user_id: userId, encrypted_api_key: encryptedApiKey, last_checked_at: now, last_check_ok: true, updated_at: now }, { onConflict: "user_id" });
  return !error;
}

export async function recordHevyCheck(admin, userId, ok) {
  const { error } = await admin.from(TABLE).update({ last_checked_at: new Date().toISOString(), last_check_ok: !!ok }).eq("user_id", userId);
  return !error;
}

export async function removeHevyConnection(admin, userId) {
  const { error } = await admin.from(TABLE).delete().eq("user_id", userId);
  return !error;
}
