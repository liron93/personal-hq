"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { tabBtn } from "@/lib/theme";
import { useStore } from "@/lib/store";
import { STORE_KEY, INIT, ensureCurrentMonthSnapshot, assetsTotal } from "./model";
import * as coreFacts from "@/lib/coreFacts";
import CompanyTasks from "@/lib/CompanyTasks";
import Dash from "./Dash";
import Budget from "./Budget";
import Assets from "./Assets";
import Watchlist from "./Watchlist";

// recharts כבד — נטען רק כשנכנסים לטאב ההיסטוריה
const History = dynamic(() => import("./History"), {
  ssr: false,
  loading: () => <div style={{ padding: 40, textAlign: "center", opacity: 0.6 }}>טוען...</div>,
});

const TABS = [
  { id: "dash", l: "דשבורד" }, { id: "history", l: "היסטוריה" }, { id: "budget", l: "תקציב" },
  { id: "assets", l: "נכסים" }, { id: "watchlist", l: "מעקב מניות" }, { id: "tasks", l: "משימות ועדכון" },
];

export default function Company() {
  const { data: d, setData: setD, upd, ready } = useStore(STORE_KEY, INIT);
  const { data: core, ready: coreReady } = useStore(coreFacts.STORE_KEY, coreFacts.INIT);
  const [tab, setTab] = useState("dash");

  // כניסה בחודש חדש יוצרת צילום שווי נקי אוטומטית, בלי פעולה של המשתמש.
  // תלוי ב-d כדי לשרוד גם טעינה מאוחרת ששוטפת את המצב; אידמפוטנטי — אם הצילום קיים, d לא משתנה.
  useEffect(() => {
    if (!d) return;
    const next = ensureCurrentMonthSnapshot(d);
    if (next !== d) setD(next);
  }, [d, setD]);

  if (!ready || !coreReady) return <div style={{ padding: 40, textAlign: "center", opacity: 0.6 }}>טוען...</div>;
  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 20, overflowX: "auto", paddingBottom: 2 }}>
        {TABS.map(t => <button key={t.id} onClick={() => setTab(t.id)} style={tabBtn(tab === t.id)}>{t.l}</button>)}
      </div>
      {tab === "dash" && <Dash d={d} core={core} />}
      {tab === "history" && <History d={d} setD={setD} />}
      {tab === "budget" && <Budget d={d} setD={setD} />}
      {tab === "assets" && <Assets d={d} upd={upd} />}
      {tab === "watchlist" && <Watchlist d={d} setD={setD} totalNetWorth={assetsTotal(d.assets)} />}
      {tab === "tasks" && <CompanyTasks d={d} setD={setD} />}
    </div>
  );
}
