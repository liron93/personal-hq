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
import MarketConnection from "./MarketConnection";
import Flow from "./Flow";
import "@/app/finance-control-room.css";

// recharts כבד — נטען רק כשנכנסים לטאב ההיסטוריה
const History = dynamic(() => import("./History"), {
  ssr: false,
  loading: () => <div style={{ padding: 40, textAlign: "center", opacity: 0.6 }}>טוען...</div>,
});

const TABS = [
  { id: "market", l: "חיבור שוק ארה״ב" },
  { id: "dash", l: "תמונת מצב" }, { id: "flow", l: "תזרים" }, { id: "budget", l: "תקציב" }, { id: "history", l: "היסטוריה" },
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
    <div className="finance-console-layout">
      <aside className="finance-console-nav" aria-label="מחלקות בחברת הכספים">
        <span className="finance-console-brand">FINANCE / 02</span>
        {TABS.map(t => <button className={`finance-nav-item ${tab === t.id ? "is-active" : ""}`} key={t.id} onClick={() => setTab(t.id)} style={tabBtn(tab === t.id)}>{t.l}</button>)}
        <div className="finance-nav-status"><i />מערכת מקומית · Demo</div>
      </aside>
      <div className="finance-console-content">
        {tab === "market" && <MarketConnection />}
        {tab === "dash" && <Dash d={d} core={core} onOpenBudget={() => setTab("budget")} />}
        {tab === "flow" && <Flow d={d} setD={setD} core={core} />}
        {tab === "history" && <History d={d} setD={setD} />}
        {tab === "budget" && <Budget d={d} setD={setD} />}
        {tab === "assets" && <Assets d={d} upd={upd} />}
        {tab === "watchlist" && <Watchlist d={d} setD={setD} totalNetWorth={assetsTotal(d.assets)} />}
        {tab === "tasks" && <CompanyTasks d={d} setD={setD} />}
      </div>
    </div>
  );
}
