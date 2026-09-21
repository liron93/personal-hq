"use client";
import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { resolveAccess, resetAccessCache } from "./workspace.js";

/** מרחב ויכולות המשתמש המחובר. ready=false עד שנבדק; בזמן הזה אין להציג חברות שעלולות להיות מוסתרות. */
export function useAccess() {
  const [state, setState] = useState({ ready: false, access: null });
  useEffect(() => {
    let alive = true;
    const run = () => resolveAccess(supabase).then(access => { if (alive) setState({ ready: true, access }); });
    run();
    const { data: listener } = supabase.auth.onAuthStateChange(event => {
      if (event === "SIGNED_OUT") { resetAccessCache(supabase); setState({ ready: false, access: null }); }
      run();
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);
  return state;
}
