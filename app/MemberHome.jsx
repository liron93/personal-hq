"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { COMPANIES } from "@/companies/registry";
import { isCompanyReadOnly, visibleCompanySlugs } from "@/lib/workspace";

// מסך הבית של חבר במרחב משותף בלי hq.view (למשל מעצבת): רק החברות שמותר לו לראות, בלי נתוני HQ.
export default function MemberHome({ access }) {
  const ok = new Set(visibleCompanySlugs(access, COMPANIES.map(c => c.slug)));
  const list = COMPANIES.filter(c => ok.has(c.slug));
  return <main style={{ maxWidth: 560, margin: "0 auto", padding: "48px 20px", direction: "rtl" }}>
    <h1 style={{ fontSize: 26, fontWeight: 600, margin: "0 0 6px" }}>הגישה שלך</h1>
    <p style={{ opacity: 0.7, margin: "0 0 24px" }}>אלה החלקים שמותר לך לראות.</p>
    {list.length === 0
      ? <p style={{ opacity: 0.7 }}>עדיין לא הוגדרה לך גישה. פנו לבעלים של המרחב.</p>
      : <div style={{ display: "grid", gap: 10 }}>{list.map(c => {
        const Icon = c.icon;
        return <Link key={c.slug} href={`/companies/${c.slug}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 14, border: "1px solid #E4E7EC", background: "#fff", color: "inherit", textDecoration: "none" }}>
          <Icon size={20} /><span style={{ flex: 1, fontWeight: 600 }}>{c.name}</span>
          {isCompanyReadOnly(access, c.slug) && <small style={{ opacity: 0.6 }}>צפייה בלבד</small>}
          <ChevronLeft size={18} />
        </Link>;
      })}</div>}
    <button onClick={() => supabase.auth.signOut()} style={{ marginTop: 28, border: 0, background: "transparent", color: "#475467", cursor: "pointer" }}>יציאה מאובטחת</button>
  </main>;
}
