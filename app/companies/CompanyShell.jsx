import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { MUTED } from "@/lib/theme";

export default function CompanyShell({ title, children }) {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "28px 20px 80px" }}>
      <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: MUTED, fontSize: 14, textDecoration: "none", marginBottom: 18 }}>
        <ChevronLeft size={15} style={{ transform: "rotate(180deg)" }} /> חזרה למנכ״ל
      </Link>
      <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 16px" }}>{title}</h1>
      {children}
    </main>
  );
}
