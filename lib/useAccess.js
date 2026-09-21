"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { resolveAccess, resetAccessCache } from "./workspace.js";

const RETRY_MS = 10_000;

/**
 * מרחב ויכולות המשתמש המחובר. ready=false עד שנבדק; בזמן הזה אין להציג חברות שעלולות להיות מוסתרות.
 * כשלא ניתן לאמת (reason "unavailable") הבדיקה חוזרת אוטומטית כל כמה שניות, ו-refresh() מאפשר ניסיון ידני.
 */
export function useAccess() {
  const [state, setState] = useState({ ready: false, access: null });
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => { resetAccessCache(supabase); setTick(v => v + 1); }, []);

  useEffect(() => {
    let alive = true;
    const run = () => resolveAccess(supabase).then(access => { if (alive) setState({ ready: true, access }); });
    run();
    const { data: listener } = supabase.auth.onAuthStateChange(event => {
      if (event === "SIGNED_OUT") { resetAccessCache(supabase); setState({ ready: false, access: null }); }
      run();
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, [tick]);

  const unavailable = state.access?.reason === "unavailable";
  useEffect(() => {
    if (!unavailable) return undefined;
    const t = setTimeout(refresh, RETRY_MS);
    return () => clearTimeout(t);
  }, [unavailable, refresh, state]);

  return { ...state, refresh };
}
