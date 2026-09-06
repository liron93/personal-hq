"use client";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "./supabase";

/*
  שכבת האחסון של personal-hq.
  המקור האמיתי הוא Supabase (טבלת company_state, שורה לכל משתמש+חברה).
  כגיבוי מקומי ולעבודה בלי רשת — נשמר עותק תמיד גם ב-localStorage,
  וכשיש רשת שוב הוא מסונכרן חזרה קדימה.
  כל תת-חברה ממשיכה לעבוד מול useStore בלי שינוי.
*/

function loadLocal(key) {
  if (typeof window === "undefined") return null;
  try { const r = window.localStorage.getItem(key); return r ? JSON.parse(r) : null; } catch { return null; }
}
function saveLocal(key, value) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

async function currentUserId() {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id || null;
  } catch { return null; }
}

export async function load(key) {
  const cached = loadLocal(key);
  const userId = await currentUserId();
  if (!userId) return cached; // אין משתמש מחובר — עובדים מקומית בלבד

  try {
    const { data, error } = await supabase
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
    if (cached) await save(key, cached);
    return cached;
  } catch {
    return cached; // אין רשת / שגיאה זמנית — נופלים לעותק המקומי
  }
}

export async function save(key, value) {
  saveLocal(key, value); // תמיד קודם שומרים מקומית
  const userId = await currentUserId();
  if (!userId) return;
  try {
    await supabase.from("company_state").upsert({
      user_id: userId,
      company_key: key,
      data: value,
      updated_at: new Date().toISOString(),
    });
  } catch {
    // אין רשת כרגע — הנתון המקומי נשמר, והשמירה הבאה תסנכרן לענן
  }
}

export const cp = o => JSON.parse(JSON.stringify(o));

export function useStore(key, initial) {
  const [data, setData] = useState(null);
  useEffect(() => { load(key).then(v => setData(v ?? cp(initial))); }, [key]); // eslint-disable-line
  useEffect(() => { if (data) save(key, data); }, [key, data]);
  const upd = useCallback((path, v) => setData(prev => {
    const n = cp(prev); const ks = path.split(".");
    ks.slice(0, -1).reduce((o, k) => o[k], n)[ks[ks.length - 1]] = v; return n;
  }), []);
  return { data, setData, upd, ready: !!data };
}
