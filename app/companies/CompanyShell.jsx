import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ACCENT } from "@/lib/theme";

export default function CompanyShell({ title, children, fullWidth = false }) {
  return (
    <main style={{ maxWidth: fullWidth ? "none" : 760, width: "100%", margin: "0 auto", padding: "28px clamp(16px, 4vw, 32px) 80px" }}>
      <Link href="/" className="hq-back-link" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: ACCENT, fontSize: 14, textDecoration: "none", minHeight: 44, marginBottom: 6 }}>
        <ChevronLeft size={15} style={{ transform: "rotate(180deg)" }} /> חזרה למנכ״ל
      </Link>
      <h1 style={{ fontSize: 26, fontWeight: 600, margin: "0 0 16px" }}>{title}</h1>
      {children}
    </main>
  );
}
