"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { COMPANIES } from "@/companies/registry";
import { INK, PAPER, CARD, GOLD, GREEN, RUST, MUTED, LINE, cardStyle } from "@/lib/theme";
import { Sec, Row, EditableNum } from "@/lib/ui";
import { load, useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import * as coreFacts from "@/lib/coreFacts";

function FlagDot({ flag }) {
  const color = flag === "red" ? RUST : flag === "amber" ? GOLD : GREEN;
  return <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: color }} />;
}

// המנכ"ל קורא את מצב כל תת-חברה פעילה דרך שכבת האחסון המשותפת — בלי לפתוח אותה
function useSummaries() {
  const [s, setS] = useState({});
  useEffect(() => {
    let alive = true;
    (async () => {
      const out = {};
      for (const c of COMPANIES) {
        if (!c.active) continue;
        try {
          const raw = await load(c.storeKey);
          out[c.slug] = c.summarize(raw ?? c.init);
        } catch { out[c.slug] = c.summarize(c.init); }
      }
      if (alive) setS(out);
    })();
    return () => { alive = false; };
  }, []);
  return s;
}

export default function CEO() {
  const summaries = useSummaries();
  const { data: core, upd: coreUpd, ready: coreReady } = useStore(coreFacts.STORE_KEY, coreFacts.INIT);
  const todayStr = new Date().toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });
  const active = COMPANIES.filter(c => c.active);
  const items = active.map(c => ({ c, s: summaries[c.slug] })).filter(x => x.s);
  const totalOpen = items.reduce((n, x) => n + x.s.openTasks, 0);
  const soonest = items.map(x => x.s).filter(s => s.nextPayment).sort((a, b) => a.daysToPay - b.daysToPay)[0];
  const latest = items.map(x => ({ c: x.c, u: x.s.latestUpdate })).filter(x => x.u).sort((a, b) => new Date(b.u.date) - new Date(a.u.date))[0];

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "40px 20px 80px" }}>
      <div style={{ marginBottom: 36, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ color: MUTED, fontSize: 14, marginBottom: 4 }}>{todayStr}</div>
          <h1 style={{ fontSize: 34, fontWeight: 700, margin: 0 }}>המנכ״ל</h1>
        </div>
        <button
          onClick={() => supabase.auth.signOut()}
          style={{ border: "none", background: "transparent", color: MUTED, fontSize: 13, cursor: "pointer", fontFamily: "inherit", padding: 4 }}
        >
          התנתקות
        </button>
      </div>

      <section style={{ background: CARD, color: PAPER, borderRadius: 4, padding: "22px 24px", marginBottom: 28 }}>
        <div style={{ color: GOLD, fontSize: 13, marginBottom: 10 }}>הפגישה היומית</div>
        {latest ? (
          <p style={{ margin: "0 0 12px", lineHeight: 1.7, fontSize: 16 }}>העדכון האחרון מ״{latest.c.name}״: {latest.u.text}</p>
        ) : (
          <p style={{ margin: "0 0 12px", lineHeight: 1.7, fontSize: 16, color: "#C9C2B4" }}>אין עדיין עדכונים מתתי-החברות. תתחיל מ״בית חדש״.</p>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 18, fontSize: 14, color: "#C9C2B4" }}>
          <span>{totalOpen} משימות פתוחות</span>
          {soonest && <span>{soonest.nextPayment.label} בעוד {soonest.daysToPay} ימים</span>}
        </div>
      </section>

      {coreReady && (
        <div style={{ marginBottom: 24 }}>
          <Sec title="נתוני ליבה" />
          <div style={cardStyle}>
            <Row label="הכנסה שלי"><EditableNum value={core.mySalary} onChange={v => coreUpd("mySalary", v)} /></Row>
            <Row label="הכנסת אשתי"><EditableNum value={core.wifeSalary} onChange={v => coreUpd("wifeSalary", v)} /></Row>
            <Row last label="החזר משכנתא קיימת"><EditableNum value={core.mortgageMonthly} onChange={v => coreUpd("mortgageMonthly", v)} /></Row>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {COMPANIES.map(c => {
          const Icon = c.icon;
          const flag = summaries[c.slug]?.flag;
          const inner = (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
              border: `1px solid ${c.active ? INK : LINE}`, borderRadius: 4, padding: "16px 18px",
              background: c.active ? INK : "transparent", color: c.active ? PAPER : MUTED, opacity: c.active ? 1 : 0.55, fontSize: 16,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}><Icon size={18} /><span>{c.name}</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {c.active ? (flag && <FlagDot flag={flag} />) : <span style={{ fontSize: 12 }}>בקרוב</span>}
                {c.active && <ChevronLeft size={16} />}
              </div>
            </div>
          );
          return c.active
            ? <Link key={c.slug} href={`/companies/${c.slug}`} style={{ textDecoration: "none" }}>{inner}</Link>
            : <div key={c.slug}>{inner}</div>;
        })}
      </div>
    </main>
  );
}
