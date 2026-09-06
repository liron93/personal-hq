"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

// שומר על כל האפליקציה: בלי משתמש מחובר מפנים ל-/login. עמוד /login עצמו תמיד נגיש.
export default function AuthGate({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState(undefined); // undefined = עדיין בודקים

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    if (!session && pathname !== "/login") router.replace("/login");
    if (session && pathname === "/login") router.replace("/");
  }, [session, pathname, router]);

  if (pathname === "/login") return children;
  if (session === undefined) {
    return <div style={{ padding: 40, textAlign: "center", opacity: 0.6 }}>טוען...</div>;
  }
  if (!session) return null; // מיד לפני הפניה ל-/login

  return children;
}
