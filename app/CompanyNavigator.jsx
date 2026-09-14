"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, BriefcaseBusiness, Dumbbell, HeartPulse, Home, LayoutDashboard, WalletCards } from "lucide-react";
import styles from "./company-navigator.module.css";

const destinations = [
  { href: "/", label: "מרכז שליטה", Icon: LayoutDashboard },
  { href: "/companies/beit-hadash", label: "בית", Icon: Home },
  { href: "/companies/kesef", label: "כספים", Icon: WalletCards },
  { href: "/companies/avoda", label: "קריירה", Icon: BriefcaseBusiness },
  { href: "/companies/health", label: "בריאות", Icon: Dumbbell },
  { href: "/companies/nefesh", label: "רווחה", Icon: HeartPulse },
];

export default function CompanyNavigator() {
  const pathname = usePathname();
  return <nav className={styles.navigator} aria-label="ניווט מהיר בין החברות">
    <Link href="/" className={styles.core} aria-label="Personal HQ — מרכז שליטה"><Building2 size={18} /></Link>
    <div className={styles.destinations}>{destinations.map(({ href, label, Icon }) => {
      const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
      return <Link href={href} className={`${styles.destination} ${active ? styles.active : ""}`} key={href} aria-current={active ? "page" : undefined}>
        <Icon size={18} /><span>{label}</span>
      </Link>;
    })}</div>
    <span className={styles.status} aria-label="JARVIS זמין"><i />JARVIS</span>
  </nav>;
}
