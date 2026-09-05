"use client";
import { useState } from "react";
import { tabBtn } from "@/lib/theme";
import { useStore } from "@/lib/store";
import { STORE_KEY, INIT } from "./model";
import Dash from "./Dash";
import Items from "./Items";
import Flow from "./Flow";
import Cfg from "./Cfg";
import Tasks from "./Tasks";

const TABS = [
  { id: "dash", l: "דשבורד" }, { id: "tasks", l: "משימות ועדכון" }, { id: "exp", l: "הוצאות" },
  { id: "reno", l: "שיפוץ" }, { id: "flow", l: "תזרים" }, { id: "cfg", l: "הגדרות" },
];

export default function Company() {
  const { data: d, setData: setD, upd, ready } = useStore(STORE_KEY, INIT);
  const [tab, setTab] = useState("dash");
  if (!ready) return <div style={{ padding: 40, textAlign: "center", opacity: 0.6 }}>טוען...</div>;
  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 20, overflowX: "auto", paddingBottom: 2 }}>
        {TABS.map(t => <button key={t.id} onClick={() => setTab(t.id)} style={tabBtn(tab === t.id)}>{t.l}</button>)}
      </div>
      {tab === "dash" && <Dash d={d} upd={upd} />}
      {tab === "tasks" && <Tasks d={d} setD={setD} />}
      {tab === "exp" && <Items d={d} setD={setD} mode="exp" />}
      {tab === "reno" && <Items d={d} setD={setD} mode="reno" />}
      {tab === "flow" && <Flow d={d} />}
      {tab === "cfg" && <Cfg d={d} upd={upd} />}
    </div>
  );
}
