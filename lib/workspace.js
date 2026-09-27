// זיהוי המרחב והיכולות של המשתמש המחובר, בצד הלקוח. טהור מבחינת תלויות: מקבל client מוזרק, אין import של Supabase.
// האכיפה האמיתית היא ה-RLS (supabase/proposed/rbac/001_rbac_foundation.sql). כאן רק מחליטים לאן לקרוא/לכתוב ומה להציג.
//
// שלושה מצבים, ובהצגה (UI) הכלל הוא fail-closed:
//   mode "personal"   - תאימות לאחור, כמו היום, הכול נראה והכול ב-company_state: רק כש-RBAC לא הופעל (reason "not_enabled": הטבלאות
//                       לא קיימות) או כשאין session (מצב מקומי בלבד). זה גם המצב של ה-owner לפני שה-RBAC נפרס.
//   mode "member"     - יש מרחב משותף והמשתמש בו: owner (isOwner=true, כל היכולות) או חבר פעיל (grants מפורשות).
//                       מפתחות משותפים (בית חדש, כספים, ליבה) נקראים ונכתבים מ-workspace_state של המרחב, כך שיש עותק אחד בלבד.
//                       מפתחות אישיים נשארים ב-company_state לפי המשתמש.
//   mode "restricted" - ה-RBAC מופעל אבל המשתמש לא מאומת כחבר: reason "no_workspace" (מחובר ולא אושר) או "unavailable"
//                       (שגיאה / timeout / בדיקת יכולות שנכשלה, ואין הרשאות מאומתות אחרונות). לא מציגים אף חברה ואף מסך מנכ״ל.
//                       (אחסון בשכבת ה-store נשאר כמו היום: ה-UI לא נגיש, וה-RLS מגן על הנתונים.)
// כשהרשת נופלת אחרי שכבר אומת, משתמשים בהרשאות המאומתות האחרונות של אותו משתמש באותו מכשיר (reason "cached"), בלי להרחיב גישה.
import {
  CAPABILITIES, COMPANY_STATE_CAPABILITIES, canAccessStateKey, canViewHq, visiblePersonalCompanies, visibleSharedCompanies,
} from "./authz/capabilities.js";

/** שקול ל-not_enabled ב-lib/home-documents.js: הטבלאות עוד לא נפרסו, אז ההתנהגות נשארת כמו היום. */
export function isMissingRelation(error) {
  const text = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
  const status = Number(error?.status ?? error?.statusCode ?? 0);
  return error?.code === "PGRST205" || error?.code === "42P01" || status === 404
    || text.includes("could not find the table") || text.includes("does not exist") || text.includes("schema cache");
}

export const PERSONAL_ACCESS = Object.freeze({ mode: "personal", userId: null, isOwner: true, workspaceId: null, grants: Object.freeze([]), reason: "personal" });

const personal = (userId, reason) => ({ mode: "personal", userId, isOwner: true, workspaceId: null, grants: [], reason });
const restricted = (userId, reason) => ({ mode: "restricted", userId, isOwner: false, workspaceId: null, grants: [], reason });

// הרשאות מאומתות אחרונות (לפי משתמש, במכשיר הזה בלבד). משמשות רק כשאי אפשר לברר מחדש, ולעולם לא מרחיבות גישה:
// מה שנשמר הוא רק תוצאה שאומתה מהשרת, ו-no_workspace (הסרה/אי-אישור) מוחקת אותה.
const LAST_VERIFIED_MAX_AGE_MS = 30 * 24 * 3600 * 1000;
const lastKey = uid => `u:${uid}:hq:access:v1`;
const storage = () => { try { return globalThis.window?.localStorage || null; } catch { return null; } };
function saveLastVerified(uid, access, now) {
  try { storage()?.setItem(lastKey(uid), JSON.stringify({ at: now, mode: access.mode, isOwner: !!access.isOwner, workspaceId: access.workspaceId, grants: access.grants, reason: access.reason })); } catch {}
}
function clearLastVerified(uid) { try { storage()?.removeItem(lastKey(uid)); } catch {} }
function readLastVerified(uid, now) {
  try {
    const raw = storage()?.getItem(lastKey(uid)); if (!raw) return null;
    const r = JSON.parse(raw);
    if (!r || typeof r.at !== "number" || now - r.at > LAST_VERIFIED_MAX_AGE_MS) return null;
    const legacy = r.mode === "personal" && r.reason === "not_enabled";
    const member = r.mode === "member" && typeof r.workspaceId === "string" && Array.isArray(r.grants);
    if (!legacy && !member) return null;
    return { mode: r.mode, userId: uid, isOwner: legacy ? true : !!r.isOwner, workspaceId: legacy ? null : r.workspaceId, grants: legacy ? [] : r.grants.filter(g => CAPABILITIES.includes(g)), reason: "cached", stale: true };
  } catch { return null; }
}

const TTL_MS = 60_000;
const cache = new WeakMap(); // client -> { userId, at, promise }
export function resetAccessCache(client) { if (client) cache.delete(client); }

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), ms); })]).finally(() => clearTimeout(timer));
}

async function fetchAccess(client, userId, timeoutMs) {
  const unavailable = () => ({ ...restricted(userId, "unavailable"), transient: true });
  try {
    const res = await withTimeout(Promise.resolve(client.from("workspaces").select("id, owner_id").eq("kind", "shared").limit(1)), timeoutMs);
    if (!res || typeof res !== "object" || !("error" in res || "data" in res)) return unavailable();
    if (res.error) return isMissingRelation(res.error) ? personal(userId, "not_enabled") : unavailable();
    if (!Array.isArray(res.data)) return unavailable();
    const ws = res.data[0];
    if (!ws) return restricted(userId, "no_workspace"); // מחובר ולא אושר (או ש-owner עוד לא יצר מרחב): לא מציגים כלום
    if (ws.owner_id === userId) return { mode: "member", userId, isOwner: true, workspaceId: ws.id, grants: [], reason: "owner" }; // owner: כל היכולות, אותו עותק משותף
    const caps = await withTimeout(Promise.resolve(client.from("member_capabilities").select("capability, revoked_at").eq("workspace_id", ws.id).eq("user_id", userId)), timeoutMs);
    if (!caps || caps.error || !Array.isArray(caps.data)) return unavailable();
    const grants = caps.data.filter(r => !r.revoked_at).map(r => r.capability);
    return { mode: "member", userId, isOwner: false, workspaceId: ws.id, grants, reason: "member" };
  } catch {
    return unavailable();
  }
}

/**
 * @returns {Promise<{mode:"personal"|"member"|"restricted",userId:string|null,isOwner:boolean,workspaceId:string|null,grants:string[],reason:string,stale?:boolean}>}
 * לא זורקת לעולם. תוצאה זמנית (שגיאת רשת, timeout) לא נשמרת במטמון הזיכרון, כדי שנסיון הבא יברר שוב.
 */
export async function resolveAccess(client, { userId, timeoutMs = 8000, now = Date.now() } = {}) {
  let uid = userId;
  if (uid === undefined) {
    try { const { data } = await client.auth.getSession(); uid = data.session?.user?.id || null; } catch { uid = null; }
  }
  if (!uid) return { ...PERSONAL_ACCESS };
  const hit = cache.get(client);
  if (hit && hit.userId === uid && now - hit.at < TTL_MS) return hit.promise;
  const promise = fetchAccess(client, uid, timeoutMs).then(a => {
    const { transient, ...rest } = a;
    if (transient) {
      if (cache.get(client)?.promise === promise) cache.delete(client);
      return readLastVerified(uid, now) || rest; // ההרשאות המאומתות האחרונות אם יש, אחרת restricted/unavailable
    }
    if (rest.mode === "member" || rest.reason === "not_enabled") saveLastVerified(uid, rest, now);
    else clearLastVerified(uid); // no_workspace: הגישה בוטלה או לא אושרה, לא משאירים הרשאות ישנות
    return rest;
  });
  cache.set(client, { userId: uid, at: now, promise });
  return promise;
}

export const isSharedKey = key => Object.prototype.hasOwnProperty.call(COMPANY_STATE_CAPABILITIES, key);

/**
 * לאן פונה מפתח מצב עבור המשתמש הזה.
 * @returns {{shared:boolean, workspaceId:string|null, canRead:boolean, canWrite:boolean}}
 */
export function routeForKey(access, key) {
  if (access?.mode !== "member" || !isSharedKey(key)) return { shared: false, workspaceId: null, canRead: true, canWrite: true };
  return {
    shared: true,
    workspaceId: access.workspaceId,
    canRead: canAccessStateKey(access.grants, key, { isOwner: !!access.isOwner }),
    canWrite: canAccessStateKey(access.grants, key, { write: true, isOwner: !!access.isOwner }),
    isOwner: !!access.isOwner,
  };
}

/** slug של חברה משותפת → מפתח המצב שלה. */
export const SHARED_COMPANY_KEY = Object.freeze({ "beit-hadash": "hq:beit-hadash:v2", kesef: "hq:kesef:v1" });

/**
 * אילו חברות מהרג'יסטרי להציג. fail-closed:
 *  personal (RBAC לא הופעל / בלי session): הכול, כמו היום.
 *  member owner: הכול. member רגיל: חברות משותפות לפי יכולת קריאה; ועם hq.view (שותפה) גם החברות האישיות שלה (בריאות, קריירה: מרחב אישי
 *  משלה, ריק). nefesh (אוריה) רק ל-owner. מעצבת (בלי hq.view): בית חדש בלבד. ראה docs/rbac/DESIGN.md.
 *  restricted (לא מאומת כחבר) או access לא מוכר: כלום.
 */
export function visibleCompanySlugs(access, slugs) {
  if (access?.mode === "personal") return [...slugs];
  if (access?.mode !== "member") return [];
  if (access.isOwner) return [...slugs];
  const ok = new Set([...visibleSharedCompanies(access.grants), ...visiblePersonalCompanies(access.grants)]);
  return slugs.filter(slug => ok.has(slug));
}

export function canViewCompany(access, slug) {
  return visibleCompanySlugs(access, [slug]).length === 1;
}

/** קריאה בלבד בחברה משותפת = אין יכולת כתיבה. חברה אישית: ניתנת לעריכה. ללא מצב מאומת: קריאה בלבד. */
export function isCompanyReadOnly(access, slug) {
  if (access?.mode === "personal") return false;
  if (access?.mode !== "member") return true;
  const key = SHARED_COMPANY_KEY[slug];
  if (access.isOwner || !key) return false;
  return !canAccessStateKey(access.grants, key, { write: true });
}

export function isHqVisible(access) {
  if (access?.mode === "personal") return true;
  if (access?.mode !== "member") return false;
  return !!access.isOwner || canViewHq(access.grants);
}
