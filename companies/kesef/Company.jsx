"use client";
import { useState } from "react";
import { tabBtn } from "@/lib/theme";
import { useStore } from "@/lib/store";
import { STORE_KEY, INIT } from "./model";
import * as coreFacts from "@/lib/coreFacts";
import CompanyTasks from "@/lib/CompanyTasks";
import Dash from "./Dash";
import Budget from "./Budget";
import Assets from "./Assets";

const TABS = [
  { id: "dash", l: "דשבורד" }, { id: "budget", l: "תקציב" },
  { id: "assets", l: "נכסים" }, { id: "tasks", l: "משימות ועדכון" },
];

export default function Company() {
  const { data: d, setData: setD, upd, ready } = useStore(STORE_KEY, INIT);
  const { data: core, ready: coreReady } = useStore(coreFacts.STORE_KEY, coreFacts.INIT);
  const [tab, setTab] = useState("dash");
  if (!ready || !coreReady) return <div style={{ padding: 40, textAlign: "center", opacity: 0.6 }}>טוען...</div>;
  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 20, overflowX: "auto", paddingBottom: 2 }}>
        {TABS.map(t => <button key={t.id} onClick={() => setTab(t.id)} style={tabBtn(tab === t.id)}>{t.l}</button>)}
      </div>
      {tab === "dash" && <Dash d={d} core={core} />}
      {tab === "budget" && <Budget d={d} setD={setD} />}
      {tab === "assets" && <Assets d={d} upd={upd} />}
      {tab === "tasks" && <CompanyTasks d={d} setD={setD} />}
    </div>
  );
}
