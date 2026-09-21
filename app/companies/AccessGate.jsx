"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useAccess } from "@/lib/useAccess";
import { canViewCompany, isCompanyReadOnly } from "@/lib/workspace";

// בקריאה בלבד: משבית שדות קלט (גם כאלה שנוצרים אחר כך). כתיבה נחסמת גם בשכבת ה-store וב-RLS, זה רק הצד הנראה.
function useDisableInputs(ref, on) {
  useEffect(() => {
    const root = ref.current;
    if (!on || !root) return;
    const apply = () => root.querySelectorAll("input, textarea, select").forEach(el => { el.disabled = true; });
    apply();
    const obs = new MutationObserver(apply);
    obs.observe(root, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [ref, on]);
}

/** עוטף דף חברה: מסתיר חברה בלי יכולת קריאה, ומסמן קריאה בלבד. חברה אישית (בריאות, נפשי) מוסתרת ממי שהוא member. */
export default function AccessGate({ slug, children }) {
  const { ready, access } = useAccess();
  const ref = useRef(null);
  const readOnly = ready && canViewCompany(access, slug) && isCompanyReadOnly(access, slug);
  useDisableInputs(ref, readOnly);
  if (!ready) return <div style={{ padding: 40, textAlign: "center", opacity: 0.6 }}>טוען…</div>;
  if (!canViewCompany(access, slug)) {
    return <main style={{ maxWidth: 520, margin: "80px auto", padding: 24, textAlign: "center", lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>אין לך גישה לחלק הזה</h1>
      <p style={{ opacity: 0.7, margin: "0 0 16px" }}>הגישה מוגדרת על ידי הבעלים של המרחב.</p>
      <Link href="/" style={{ color: "#4059AD" }}>חזרה</Link>
    </main>;
  }
  return <div ref={ref}>
    {readOnly && <div role="status" style={{ background: "#FFFAEB", border: "1px solid #F7D98B", color: "#7A5B00", borderRadius: 10, padding: "8px 14px", margin: "0 auto 12px", maxWidth: 760, fontSize: 14, textAlign: "center" }}>מצב צפייה בלבד: אפשר לראות, אי אפשר לערוך. שינויים לא נשמרים.</div>}
    {children}
  </div>;
}
