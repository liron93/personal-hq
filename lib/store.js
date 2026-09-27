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
// מרחב משותף (RBAC): כשיש מרחב משותף והמשתמש בו (owner או חבר פעיל), מפתחות משותפים (בית חדש, כספים, ליבה)
// נקראים ונכתבים מ-workspace_state לפי היכולות שלו, כך שיש עותק אחד לכולם. כל השאר, וכל מי שאין לו מרחב
// (RBAC עוד לא נפרס, owner בלי מרחב, לא מאושר), עובד בדיוק כמו קודם מול company_state. ראה lib/workspace.js.

// היעד של מפתח עבור המשתמש: טבלה, מפתח cache מקומי, וההרשאות שלו.
async function targetFor(client, key) {
  const userId = await currentUserId(client);
  if (!userId) return { userId, shared: false, canRead: true, canWrite: true, isOwner: true, cacheKey: localKey(key, null) };
  const access = await resolveAccess(client, { userId });
  const route = routeForKey(access, key);
  // מפתח משותף נשמר ב-cache תחת המרחב, כך שמרחב משותף ומרחב אישי לעולם לא חולקים ערך מקומי.
  const cacheKey = route.shared ? localKey(`ws:${route.workspaceId}:${key}`, userId) : localKey(key, userId);
  return { userId, isOwner: true, ...route, cacheKey };
}

// הגנה מפני איבוד עדכונים בין עורכים במקביל: blob אחד לכל מפתח, אז כותבים רק אם השורה לא השתנתה מאז שקראנו
// (השוואת updated_at, ש-trigger בשרת מעדכן בכל כתיבה). כתיבה שנדחתה מחזירה reason:"conflict" ולא דורסת כלום.
const versions = new WeakMap(); // client -> Map(workspace|key -> { at, json })
const queues = new WeakMap();   // client -> Map(workspace|key -> Promise): שמירות של אותו מפתח רצות בזו אחר זו
const mapOf = (registry, client) => { let m = registry.get(client); if (!m) { m = new Map(); registry.set(client, m); } return m; };
const idOf = (t, key) => `${t.workspaceId}|${key}`;
const isDuplicate = e => e?.code === "23505" || /duplicate key/i.test(e?.message || "");
export const CONFLICT_MESSAGE = "מישהו אחר עדכן את הנתונים בזמן שעבדת. הנתונים רועננו, ושינוי שלא נשמר לא נשמר. נסו שוב.";

function remember(client, t, key, at, value) {
  if (at) mapOf(versions, client).set(idOf(t, key), { at, json: JSON.stringify(value) });
  else mapOf(versions, client).delete(idOf(t, key));
}

async function readSharedRow(client, t, key) {
  const { data, error } = await client.from("workspace_state").select("data, updated_at")
    .eq("workspace_id", t.workspaceId).eq("company_key", key).maybeSingle();
  if (error) throw error;
  return data;
}

// יוצרת שורה חדשה בלבד (insert): לעולם לא דורסת שורה קיימת, כמו "on conflict do nothing" ב-020_copy_shared_state.sql.
async function createSharedRow(client, t, key, value) {
  const { data, error } = await client.from("workspace_state")
    .insert({ workspace_id: t.workspaceId, company_key: key, data: value, updated_at: new Date().toISOString() })
    .select("updated_at").maybeSingle();
  if (error) return { ok: false, duplicate: isDuplicate(error) };
  remember(client, t, key, data?.updated_at, value);
  return { ok: true };
}

async function loadShared(client, t, key, cached, meta) {
  const row = await readSharedRow(client, t, key);
  if (row?.data) {
    saveLocal(t.cacheKey, row.data);
    remember(client, t, key, row.updated_at, row.data);
    return { value: row.data, ...meta };
  }
  mapOf(versions, client).delete(idOf(t, key));
  // אין עדיין שורה במרחב. כדי לא לאבד נתונים, ה-owner מזריע אותה מהמצב הקיים שלו (company_state, ואז cache ישן),
  // ורק אם השורה ריקה: לעולם לא דורסים שורה קיימת. חבר רגיל מזריע רק מה-cache של המרחב.
  let seed = cached;
  if (seed == null && t.isOwner) {
    const own = await client.from("company_state").select("data").eq("user_id", t.userId).eq("company_key", key).maybeSingle();
    if (own.error) throw own.error;
    seed = own.data?.data ?? loadLocal(localKey(key, t.userId));
  }
  if (seed == null) return { value: null, ...meta };
  if (t.canWrite) {
    const created = await createSharedRow(client, t, key, seed);
    if (!created.ok && created.duplicate) { // מישהו יצר במקביל: המצב שלו הוא האמת
      const other = await readSharedRow(client, t, key);
      if (other?.data) { saveLocal(t.cacheKey, other.data); remember(client, t, key, other.updated_at, other.data); return { value: other.data, ...meta }; }
    }
    if (created.ok) saveLocal(t.cacheKey, seed);
  }
  return { value: seed, ...meta };
}

/** כמו loadWithClient, וגם מחזירה מה מותר: { value, canRead, canWrite, shared }. */
export async function loadStateWithClient(client, key) {
  const t = await targetFor(client, key);
  const meta = { canRead: t.canRead, canWrite: t.canWrite, shared: t.shared };
  if (!t.canRead) return { value: null, ...meta }; // אין יכולת קריאה: לא פונים לרשת, לא מציגים cache
  const cached = loadLocal(t.cacheKey);
  if (!t.userId) return { value: cached, ...meta }; // אין משתמש מחובר — עובדים מקומית בלבד

  try {
    if (t.shared) return await loadShared(client, t, key, cached, meta);
    const { data, error } = await client
      .from("company_state")
      .select("data")
      .eq("user_id", t.userId)
      .eq("company_key", key)
      .maybeSingle();
    if (error) throw error;

    if (data?.data) {
      saveLocal(t.cacheKey, data.data);
      return { value: data.data, ...meta };
    }
    // אין עדיין שורה בענן — אם יש נתון מקומי, נעלה אותו כדי לא לאבד אותו
    if (cached) await saveWithClient(client, key, cached);
    return { value: cached, ...meta };
  } catch {
    return { value: cached, ...meta }; // אין רשת / שגיאה זמנית — נופלים לעותק המקומי
  }
}

export async function loadWithClient(client, key) {
  return (await loadStateWithClient(client, key)).value;
}

async function saveShared(client, t, key, value) {
  const id = idOf(t, key);
  const known = mapOf(versions, client).get(id);
  const json = JSON.stringify(value);
  if (known && known.json === json) return { synced: true }; // לא השתנה מאז הקריאה/השמירה האחרונה: אין מה לכתוב (וגם לא ליצור התנגשות מיותרת)
  if (known?.at) {
    const { data, error } = await client.from("workspace_state")
      .update({ data: value, updated_at: new Date().toISOString() })
      .eq("workspace_id", t.workspaceId).eq("company_key", key).eq("updated_at", known.at)
      .select("updated_at");
    if (error) throw error;
    if (!data?.length) return { synced: false, reason: "conflict", message: CONFLICT_MESSAGE };
    remember(client, t, key, data[0].updated_at, value);
    return { synced: true };
  }
  // עוד לא ידוע שיש שורה: יוצרים. אם כבר קיימת (מישהו יצר קודם) זו התנגשות ולא דריסה.
  const created = await createSharedRow(client, t, key, value);
  if (created.ok) return { synced: true };
  if (created.duplicate) return { synced: false, reason: "conflict", message: CONFLICT_MESSAGE };
  throw new Error("שמירה למרחב המשותף נכשלה");
}

// מחזירה תמיד תוצאה מפורשת (לעולם לא throw): { synced: true } כשהעלאה
// לענן הצליחה, { synced: false, reason: "no-session" } כשעובדים בלי
// התחברות (מצב מקומי לגיטימי, לא שגיאה), { synced: false, reason: "read-only" } כשאין למשתמש
// יכולת כתיבה למפתח (לא נכתב כלום, לא מקומית ולא בענן), { synced: false, reason: "conflict" } כשמישהו אחר
// עדכן מפתח משותף מאז הקריאה (לא נדרס כלום), או
// { synced: false, reason: "cloud-error", message } כשהייתה התחברות אבל
// ההעלאה לענן נכשלה בפועל — במקרה הזה הנתון עדיין נשמר מקומית קודם לכן.
export async function saveWithClient(client, key, value) {
  const t = await targetFor(client, key); // קורא session מקומי בלבד, בלי רשת (ובמצב משותף גם בירור מרחב, במטמון)
  if (!t.canWrite) return { synced: false, reason: "read-only" };
  saveLocal(t.cacheKey, value); // תמיד קודם שומרים מקומית, בלי תלות בתוצאת הענן
  if (!t.userId) return { synced: false, reason: "no-session" };
  try {
    if (t.shared) {
      const q = mapOf(queues, client), id = idOf(t, key);
      const run = (q.get(id) || Promise.resolve()).then(() => saveShared(client, t, key, value));
      q.set(id, run.catch(() => {}));
      return await run;
    }
    const { error } = await client.from("company_state").upsert({
      user_id: t.userId,
      company_key: key,
      data: value,
      updated_at: new Date().toISOString(),
    });
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
      if (result.reason === "conflict") {
        // מישהו אחר עדכן במקביל: לא דורסים. טוענים מחדש את הגרסה העדכנית ומודיעים (AccessGate מציג את ההודעה).
        // גם אם ה-effect כבר הוחלף בינתיים, הטעינה מחדש נדרשת כדי שהמסך לא יציג גרסה שלא נשמרה.
        if (active) { setSync("conflict"); setSyncError(result.message || ""); }
        if (typeof window !== "undefined") try { window.dispatchEvent(new CustomEvent("hq:save-conflict", { detail: { key, message: result.message } })); } catch {}
        setGeneration(v => v + 1);
        return;
      }
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
