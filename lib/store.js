"use client";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "./supabase.js";

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

export async function loadWithClient(client, key) {
  const cached = loadLocal(key);
  const userId = await currentUserId(client);
  if (!userId) return cached; // אין משתמש מחובר — עובדים מקומית בלבד

  try {
    const { data, error } = await client
      .from("company_state")
      .select("data")
      .eq("user_id", userId)
      .eq("company_key", key)
      .maybeSingle();
    if (error) throw error;

    if (data?.data) {
      saveLocal(key, data.data);
      return data.data;
    }
    // אין עדיין שורה בענן — אם יש נתון מקומי, נעלה אותו כדי לא לאבד אותו
    if (cached) await saveWithClient(client, key, cached);
    return cached;
  } catch {
    return cached; // אין רשת / שגיאה זמנית — נופלים לעותק המקומי
  }
}

// מחזירה תמיד תוצאה מפורשת (לעולם לא throw): { synced: true } כשהעלאה
// לענן הצליחה, { synced: false, reason: "no-session" } כשעובדים בלי
// התחברות (מצב מקומי לגיטימי, לא שגיאה), או
// { synced: false, reason: "cloud-error", message } כשהייתה התחברות אבל
// ההעלאה לענן נכשלה בפועל — במקרה הזה הנתון עדיין נשמר מקומית קודם לכן.
export async function saveWithClient(client, key, value) {
  saveLocal(key, value); // תמיד קודם שומרים מקומית, בלי תלות בתוצאת הענן
  const userId = await currentUserId(client);
  if (!userId) return { synced: false, reason: "no-session" };
  try {
    const { error } = await client.from("company_state").upsert({
      user_id: userId,
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

  useEffect(() => {
    let active = true;
    setStatus("loading");
    setError("");
    load(key).then(value => {
      if (!active) return;
      setData(value ?? cp(initial));
      setStatus("ready");
    }).catch(() => {
      if (active) { setError("לא ניתן לטעון מהענן. בדקו חיבור והתחברות ונסו שוב"); setStatus("error"); }
    });
    return () => { active = false; };
  }, [key, generation]); // eslint-disable-line

  useEffect(() => {
    if (!data) return;
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

  const upd = useCallback((path, v) => setData(prev => {
    const n = cp(prev); const ks = path.split(".");
    ks.slice(0, -1).reduce((o, k) => o[k], n)[ks[ks.length - 1]] = v; return n;
  }), []);
  return {
    data, setData, upd, ready: !!data, status, error,
    sync, syncError, retrySync: () => setRetryToken(v => v + 1),
    reload: () => setGeneration(v => v + 1),
  };
}
