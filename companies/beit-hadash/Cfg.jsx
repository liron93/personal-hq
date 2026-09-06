"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { RUST, cardStyle, inputStyle, primaryBtn } from "@/lib/theme";
import { Sec, Row, EditableNum } from "@/lib/ui";
import { EXP_CATS_DEFAULT, RENO_CATS_DEFAULT } from "./model";

function CatManager({ label, stateKey, cats, upd }) {
  const [newVal, setNewVal] = useState("");
  const addCat = () => { const v = newVal.trim(); if (!v || cats.includes(v)) return; upd("cfg." + stateKey, [...cats, v]); setNewVal(""); };
  const delCat = c => upd("cfg." + stateKey, cats.filter(x => x !== c));
  return (
    <div style={{ marginBottom: 16 }}>
      <Sec title={label} />
      <div style={cardStyle}>
        {cats.map((c, i) => <Row key={c} label={c} last={i === cats.length - 1}><span onClick={() => delCat(c)} style={{ fontSize: 12, color: RUST, cursor: "pointer" }}>הסר</span></Row>)}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <input className="hq-field" value={newVal} onChange={e => setNewVal(e.target.value)} onKeyDown={e => e.key === "Enter" && addCat()} placeholder="קטגוריה חדשה..." style={{ ...inputStyle, flex: 1 }} />
        <button onClick={addCat} style={primaryBtn}><Plus size={14} /></button>
      </div>
    </div>
  );
}

function MonthField({ label, value, onChange, last }) {
  return <Row label={label} last={last}><input type="month" className="hq-field" value={value || ""} onChange={e => onChange(e.target.value)} style={{ fontSize: 13, background: "transparent", fontFamily: "inherit" }} /></Row>;
}

export default function Cfg({ d, upd, core, coreUpd }) {
  const c = d.cfg;
  const N = ({ label, path, last }) => <Row label={label} last={last}><EditableNum value={c[path]} onChange={v => upd("cfg." + path, v)} /></Row>;
  const CN = ({ label, path, last }) => <Row label={label} last={last}><EditableNum value={core[path]} onChange={v => coreUpd(path, v)} /></Row>;
  return (
    <div>
      <Sec title="משכנתאות" />
      <div style={cardStyle}>
        <CN label="החזר משכנתא קיימת/חודש" path="mortgageMonthly" />
        <N label="החזר משכנתא חדשה/חודש" path="newMortgageMonthly" />
        <Row last label="הקפאת משכנתא (מילואים)"><input type="checkbox" checked={!!core.frozen} onChange={e => coreUpd("frozen", e.target.checked)} /></Row>
      </div>
      <Sec title="הכנסות" />
      <div style={cardStyle}>
        <CN label="משכורת שלי — נוכחית" path="mySalary" />
        <CN label="משכורת שלי — עתידית" path="myRaise" />
        <CN label="משכורת אשתי" path="wifeSalary" />
        <CN label="הכנסת אתונה/חודש" path="athensMonthly" last />
      </div>
      <Sec title="הוצאות קבועות" />
      <div style={cardStyle}><N label="הוצאות מחיה/חודש" path="living" last /></div>
      <Sec title="תאריכים לתזרים" />
      <div style={cardStyle}>
        <MonthField label="מכירת דירה צפויה" value={c.saleMonth} onChange={v => upd("cfg.saleMonth", v)} />
        <MonthField label="עלייה בשכר צפויה" value={c.raiseMonth} onChange={v => upd("cfg.raiseMonth", v)} />
        <MonthField label="אתונה מתחיל" value={c.athensMonth} onChange={v => upd("cfg.athensMonth", v)} />
        <MonthField label="תזרים — התחלה" value={c.flowStart} onChange={v => upd("cfg.flowStart", v)} />
        <MonthField label="תזרים — סיום" value={c.flowEnd} onChange={v => upd("cfg.flowEnd", v)} last />
      </div>
      <CatManager label="קטגוריות — הוצאות" stateKey="expCats" cats={c.expCats || EXP_CATS_DEFAULT} upd={upd} />
      <CatManager label="קטגוריות — שיפוץ" stateKey="renoCats" cats={c.renoCats || RENO_CATS_DEFAULT} upd={upd} />
    </div>
  );
}
