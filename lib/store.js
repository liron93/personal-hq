"use client";
import { useEffect, useState, useCallback } from "react";

/*
  שכבת האחסון של personal-hq.
  כרגע: localStorage בדפדפן.
  כשמחברים Supabase — מחליפים רק את load/save כאן, וכל תתי-החברות ממשיכות לעבוד.
*/
async function load(key) {
  if (typeof window === "undefined") return null;
  try { const r = window.localStorage.getItem(key); return r ? JSON.parse(r) : null; } catch { return null; }
}
async function save(key, value) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch {}
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
