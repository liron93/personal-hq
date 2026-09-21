// זיהוי המרחב והיכולות של המשתמש המחובר, בצד הלקוח. טהור מבחינת תלויות: מקבל client מוזרק, אין import של Supabase.
// האכיפה האמיתית היא ה-RLS (supabase/proposed/rbac/001_rbac_foundation.sql). כאן רק מחליטים לאן לקרוא/לכתוב ומה להציג.
//
// שני מצבים:
//   mode "personal"  - כמו היום: הכול ב-company_state לפי המשתמש. זה המצב של משתמש בלי session, של משתמש שעוד לא אושר,
//                      של owner שעוד אין לו מרחב משותף, ושל כל מצב שבו ה-RBAC עוד לא נפרס (טבלה חסרה) או שלא ניתן לברר.
//   mode "member"    - יש מרחב משותף והמשתמש בו: owner (isOwner=true, כל היכולות) או חבר פעיל (grants מפורשות).
//                      מפתחות משותפים (בית חדש, כספים, ליבה) נקראים ונכתבים מ-workspace_state של המרחב, כך שיש עותק אחד בלבד.
//                      מפתחות אישיים נשארים ב-company_state לפי המשתמש.
import {
  COMPANY_STATE_CAPABILITIES, canAccessStateKey, canViewHq, visibleSharedCompanies,
} from "./authz/capabilities.js";

/** שקול ל-not_enabled ב-lib/home-documents.js: הטבלאות עוד לא נפרסו, אז ההתנהגות נשארת כמו היום. */
export function isMissingRelation(error) {
  const text = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
  const status = Number(error?.status ?? error?.statusCode ?? 0);
  return error?.code === "PGRST205" || error?.code === "42P01" || status === 404
    || text.includes("could not find the table") || text.includes("does not exist") || text.includes("schema cache");
}

export const PERSONAL_ACCESS = Object.freeze({ mode: "personal", userId: null, isOwner: true, workspaceId: null, grants: Object.freeze([]), reason: "personal" });

const personal = (userId, reason, isOwner = true) => ({ mode: "personal", userId, isOwner, workspaceId: null, grants: [], reason });

const TTL_MS = 60_000;
const cache = new WeakMap(); // client -> { userId, at, promise }
export function resetAccessCache(client) { if (client) cache.delete(client); }

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), ms); })]).finally(() => clearTimeout(timer));
}

async function fetchAccess(client, userId, timeoutMs) {
  try {
    const res = await withTimeout(Promise.resolve(client.from("workspaces").select("id, owner_id").eq("kind", "shared").limit(1)), timeoutMs);
    if (!res || typeof res !== "object" || !("error" in res || "data" in res)) return { ...personal(userId, "unavailable"), transient: true };
    if (res.error) return isMissingRelation(res.error) ? personal(userId, "not_enabled") : { ...personal(userId, "unavailable"), transient: true };
    const ws = Array.isArray(res.data) ? res.data[0] : null;
    if (!ws) return personal(userId, "no_workspace"); // עוד לא אושר: מרחב אישי כמו היום
    if (ws.owner_id === userId) return { mode: "member", userId, isOwner: true, workspaceId: ws.id, grants: [], reason: "owner" }; // owner: כל היכולות, אותו עותק משותף
    const caps = await withTimeout(Promise.resolve(client.from("member_capabilities").select("capability, revoked_at").eq("workspace_id", ws.id).eq("user_id", userId)), timeoutMs);
    if (!caps || caps.error || !Array.isArray(caps.data)) return { ...personal(userId, "unavailable", false), transient: true };
    const grants = caps.data.filter(r => !r.revoked_at).map(r => r.capability);
    return { mode: "member", userId, isOwner: false, workspaceId: ws.id, grants, reason: "member" };
  } catch {
    return { ...personal(userId, "unavailable"), transient: true };
  }
}

/**
 * @returns {Promise<{mode:"personal"|"member",userId:string|null,isOwner:boolean,workspaceId:string|null,grants:string[],reason:string}>}
 * לא זורקת לעולם. תוצאה זמנית (שגיאת רשת) לא נשמרת במטמון, כדי שנסיון הבא יברר שוב.
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
    if (transient && cache.get(client)?.promise === promise) cache.delete(client);
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
 * אילו חברות מהרג'יסטרי להציג. מי שאינו member (owner, לא מאושר, RBAC כבוי) רואה הכול, כמו היום.
 * member רואה: חברות משותפות לפי יכולת קריאה, ואת הקריירה האישית (הריקה) שלו רק אם יש לו hq.view (שותף, לא מעצבת).
 * בריאות ונפשי אינן שלו בשום מצב (החלטת מוצר, ראה docs/rbac/DESIGN.md).
 */
export function visibleCompanySlugs(access, slugs) {
  if (access?.mode !== "member" || access.isOwner) return [...slugs];
  const shared = new Set(visibleSharedCompanies(access.grants));
  const career = canViewHq(access.grants);
  return slugs.filter(slug => shared.has(slug) || (slug === "avoda" && career));
}

export function canViewCompany(access, slug) {
  return visibleCompanySlugs(access, [slug]).length === 1;
}

/** קריאה בלבד בחברה משותפת = אין יכולת כתיבה. חברה אישית: תמיד ניתנת לעריכה. */
export function isCompanyReadOnly(access, slug) {
  const key = SHARED_COMPANY_KEY[slug];
  if (access?.mode !== "member" || access.isOwner || !key) return false;
  return !canAccessStateKey(access.grants, key, { write: true });
}

export function isHqVisible(access) {
  return access?.mode !== "member" || !!access.isOwner || canViewHq(access.grants);
}
