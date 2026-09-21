"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAccess } from "@/lib/useAccess";
import { canViewCompany, isCompanyReadOnly } from "@/lib/workspace";
import { applyReadOnly } from "@/lib/readonly-dom";

// בקריאה בלבד: משבית שדות קלט וכפתורי עריכה בצורה גלויה (גם כאלה שנוצרים אחר כך). ראה lib/readonly-dom.js.
function useReadOnlyDom(ref, on) {
  useEffect(() => (on && ref.current ? applyReadOnly(ref.current) : undefined), [ref, on]);
}

/** עוטף דף חברה: מסתיר חברה בלי יכולת קריאה, ומסמן קריאה בלבד. חברה אישית (בריאות, נפשי) מוסתרת ממי שהוא member. */
export default function AccessGate({ slug, children }) {
  const { ready, access } = useAccess();
  const ref = useRef(null);
  const readOnly = ready && canViewCompany(access, slug) && isCompanyReadOnly(access, slug);
  useReadOnlyDom(ref, readOnly);
  const [conflict, setConflict] = useState("");
  useEffect(() => {
    const onConflict = e => setConflict(e.detail?.message || "עודכן על ידי מישהו אחר. הנתונים רועננו.");
    window.addEventListener("hq:save-conflict", onConflict);
    return () => window.removeEventListener("hq:save-conflict", onConflict);
  }, []);
  if (!ready) return <div style={{ padding: 40, textAlign: "center", opacity: 0.6 }}>טוען…</div>;
  if (!canViewCompany(access, slug)) {
    return <main style={{ maxWidth: 520, margin: "80px auto", padding: 24, textAlign: "center", lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>אין לך גישה לחלק הזה</h1>
      <p style={{ opacity: 0.7, margin: "0 0 16px" }}>הגישה מוגדרת על ידי הבעלים של המרחב.</p>
      <Link href="/" style={{ color: "#4059AD" }}>חזרה</Link>
    </main>;
  }
  return <div ref={ref}>
    {conflict && <div role="alert" style={{ background: "#FEF3F2", border: "1px solid #FDA29B", color: "#B42318", borderRadius: 10, padding: "8px 14px", margin: "0 auto 12px", maxWidth: 760, fontSize: 14, textAlign: "center" }}>{conflict} <button onClick={() => setConflict("")} style={{ border: 0, background: "transparent", color: "inherit", textDecoration: "underline", cursor: "pointer" }}>הבנתי</button></div>}
    {readOnly && <div role="status" style={{ background: "#FFFAEB", border: "1px solid #F7D98B", color: "#7A5B00", borderRadius: 10, padding: "8px 14px", margin: "0 auto 12px", maxWidth: 760, fontSize: 14, textAlign: "center" }}>מצב צפייה בלבד: אפשר לראות, אי אפשר לערוך. כפתורי העריכה מושבתים.</div>}
    {children}
  </div>;
}
