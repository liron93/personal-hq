"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "./supabase.js";
import { resolveAccess, routeForKey } from "./workspace.js";

/*
  שכבת האחסון של personal-hq.
  המקור האמיתי הוא Supabase (טבלת company_state, שורה לכל משתמש+חברה).
  כגיבוי מקומי ולעבודה בלי רשת — נשמר עותק תמיד גם ב-localStorage,
  וכשיש רשת שוב הוא מסונכרן חזרה קדימה.
  כל תת-חברה — כולל קריירה — עובדת מול אותו useStore, באותה דרך בדיוק:
  אין מסלול אחסון מיוחד לאף מפתח. בלי התחברות עובדים מול העותק המקומי
  בלבד (localStorage), ועם משתמש מחובר זה מסתנכרן ל-Supabase ברקע.

  כשל בסנכרון לענן לעולם לא מוחק או דורס את הנתון המקומי — save() תמיד
  כותבת ל-localStorage קודם, בלי תלות בתוצאה של הקריאה לענן. useStore()
  חושף את מצב הסנכרון בפועל (sync) כדי שהממשק יציג חיווי אמין במקום
  להעמיד פנים שהסנכרון הצליח.
*/

function loadLocal(key) {
  if (typeof window === "undefined") return null;
  try { const r = window.localStorage.getItem(key); return r ? JSON.parse(r) : null; } catch { return null; }
}
function saveLocal(key, value) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// ה-cache המקומי מופרד לפי משתמש: מפתח גלובלי אחד למכשיר היה גורם לכך שמשתמש שמתחבר באותו דפדפן
// יקבל את הנתונים של קודמו, ואז useStore היה מעלה אותם לענן תחת החשבון שלו. כשיש משתמש מחובר
// קוראים וכותבים רק את המפתח שלו. המפתח הישן (בלי משתמש) משמש רק במצב בלי התחברות, ולעולם לא נקרא כשמחוברים.
export function localKey(key, userId) {
  return userId ? `u:${userId}:${key}` : key;
}

async function currentUserId(client) {
  try {
    const { data } = await client.auth.getSession();
    return data.session?.user?.id || null;
  } catch { return null; }
}

// גרסאות עם client ניתן להזרקה — כדי שאפשר יהיה לבדוק את התנהגות הסנכרון
// (הצלחה / אין session / כשל בענן) בבדיקות אוטומטיות, בלי רשת אמיתית ובלי
// לגעת ב-Supabase עצמו. load()/save() למטה הן רק עטיפות דקות סביב אלה,
// עם ה-client האמיתי של האפליקציה.
//
// מרחב משותף (RBAC): כשהמשתמש חבר פעיל במרחב שאינו שלו, מפתחות משותפים (בית חדש, כספים, ליבה)
// נקראים ונכתבים מ-workspace_state לפי היכולות שלו. כל השאר, וכל מי שאינו member (owner, לא מאושר,
// RBAC עוד לא נפרס), עובד בדיוק כמו קודם מול company_state. ראה lib/workspace.js.

// היעד של מפתח עבור המשתמש: טבלה, מפתח cache מקומי, וההרשאות שלו.
async function targetFor(client, key) {
  const userId = await currentUserId(client);
  if (!userId) return { userId, shared: false, canRead: true, canWrite: true, cacheKey: localKey(key, null) };
  const access = await resolveAccess(client, { userId });
  const route = routeForKey(access, key);
  // מפתח משותף נשמר ב-cache תחת המרחב, כך שמרחב משותף ומרחב אישי לעולם לא חולקים ערך מקומי.
  const cacheKey = route.shared ? localKey(`ws:${route.workspaceId}:${key}`, userId) : localKey(key, userId);
  return { userId, ...route, cacheKey };
}

/** כמו loadWithClient, וגם מחזירה מה מותר: { value, canRead, canWrite, shared }. */
export async function loadStateWithClient(client, key) {
  const t = await targetFor(client, key);
  const meta = { canRead: t.canRead, canWrite: t.canWrite, shared: t.shared };
  if (!t.canRead) return { value: null, ...meta }; // אין יכולת קריאה: לא פונים לרשת, לא מציגים cache
  const cached = loadLocal(t.cacheKey);
  if (!t.userId) return { value: cached, ...meta }; // אין משתמש מחובר — עובדים מקומית בלבד

  try {
    const q = t.shared
      ? client.from("workspace_state").select("data").eq("workspace_id", t.workspaceId).eq("company_key", key)
      : client.from("company_state").select("data").eq("user_id", t.userId).eq("company_key", key);
    const { data, error } = await q.maybeSingle();
    if (error) throw error;

    if (data?.data) {
      saveLocal(t.cacheKey, data.data);
      return { value: data.data, ...meta };
    }
    // אין עדיין שורה בענן — אם יש נתון מקומי, נעלה אותו כדי לא לאבד אותו (רק אם מותר לכתוב)
    if (cached && t.canWrite) await saveWithClient(client, key, cached);
    return { value: cached, ...meta };
  } catch {
    return { value: cached, ...meta }; // אין רשת / שגיאה זמנית — נופלים לעותק המקומי
  }
}

export async function loadWithClient(client, key) {
  return (await loadStateWithClient(client, key)).value;
}

// מחזירה תמיד תוצאה מפורשת (לעולם לא throw): { synced: true } כשהעלאה
// לענן הצליחה, { synced: false, reason: "no-session" } כשעובדים בלי
// התחברות (מצב מקומי לגיטימי, לא שגיאה), { synced: false, reason: "read-only" } כשאין למשתמש
// יכולת כתיבה למפתח (לא נכתב כלום, לא מקומית ולא בענן), או
// { synced: false, reason: "cloud-error", message } כשהייתה התחברות אבל
// ההעלאה לענן נכשלה בפועל — במקרה הזה הנתון עדיין נשמר מקומית קודם לכן.
export async function saveWithClient(client, key, value) {
  const t = await targetFor(client, key); // קורא session מקומי בלבד, בלי רשת (ובמצב member גם בירור מרחב, במטמון)
  if (!t.canWrite) return { synced: false, reason: "read-only" };
  saveLocal(t.cacheKey, value); // תמיד קודם שומרים מקומית, בלי תלות בתוצאת הענן
  if (!t.userId) return { synced: false, reason: "no-session" };
  try {
    const now = new Date().toISOString();
    const { error } = t.shared
      ? await client.from("workspace_state").upsert({ workspace_id: t.workspaceId, company_key: key, data: value, updated_at: now }, { onConflict: "workspace_id,company_key" })
      : await client.from("company_state").upsert({ user_id: t.userId, company_key: key, data: value, updated_at: now });
    if (error) throw error;
    return { synced: true };
  } catch (err) {
    return { synced: false, reason: "cloud-error", message: err?.message || "הסנכרון לענן נכשל" };
  }
}

export async function load(key) { return loadWithClient(supabase, key); }
export async function loadState(key) { return loadStateWithClient(supabase, key); }
export async function save(key, value) { return saveWithClient(supabase, key, value); }

export const cp = o => JSON.parse(JSON.stringify(o));

export function useStore(key, initial) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("loading"); // מצב טעינה ראשוני: loading | ready | error
  const [error, setError] = useState("");
  // מצב סנכרון בפועל של השמירה האחרונה: idle | syncing | synced | local | sync-error
  const [sync, setSync] = useState("idle");
  const [syncError, setSyncError] = useState("");
  const [generation, setGeneration] = useState(0);
  const [retryToken, setRetryToken] = useState(0);
  // הרשאות המפתח (RBAC). ברירת המחדל היא כמו היום: קריאה וכתיבה. readOnly = אין יכולת כתיבה, denied = אין גם קריאה.
  const [perm, setPerm] = useState({ readOnly: false, denied: false, shared: false });
  const readOnlyRef = useRef(false);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    setError("");
    loadState(key).then(({ value, canRead, canWrite, shared }) => {
      if (!active) return;
      readOnlyRef.current = !canWrite; // לפני setData, כדי שאף כתיבה לא תעבור בין הטעינה להצגה
      setPerm({ readOnly: !canWrite, denied: !canRead, shared });
      setData(value ?? cp(initial));
      setStatus("ready");
    }).catch(() => {
      if (active) { setError("לא ניתן לטעון מהענן. בדקו חיבור והתחברות ונסו שוב"); setStatus("error"); }
    });
    return () => { active = false; };
  }, [key, generation]); // eslint-disable-line

  useEffect(() => {
    if (!data) return;
    if (readOnlyRef.current) { setSync("read-only"); setSyncError(""); return; } // אין יכולת כתיבה: לא מנסים לשמור בכלל
    let active = true;
    setSync("syncing");
    save(key, data).then(result => {
      if (!active) return;
      if (result.synced) { setSync("synced"); setSyncError(""); }
      else if (result.reason === "no-session") { setSync("local"); setSyncError(""); }
      else { setSync("sync-error"); setSyncError(result.message || "הסנכרון לענן נכשל. הנתונים נשמרו במכשיר זה"); }
    });
    return () => { active = false; };
  }, [key, data, retryToken]); // eslint-disable-line

  // ב-readOnly כל שינוי מתעלם: הנתון לא משתנה, לא נשמר מקומית ולא נשלח לענן.
  const setDataGuarded = useCallback(v => { if (!readOnlyRef.current) setData(v); }, []);
  const upd = useCallback((path, v) => readOnlyRef.current ? undefined : setData(prev => {
    const n = cp(prev); const ks = path.split(".");
    ks.slice(0, -1).reduce((o, k) => o[k], n)[ks[ks.length - 1]] = v; return n;
  }), []);
  return {
    data, setData: setDataGuarded, upd, ready: !!data, readOnly: perm.readOnly, denied: perm.denied, shared: perm.shared, status, error,
    sync, syncError, retrySync: () => setRetryToken(v => v + 1),
    reload: () => setGeneration(v => v + 1),
  };
}
