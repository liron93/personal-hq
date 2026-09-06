"use client";
import { useState } from "react";
import { INK, PAPER, GREEN, RUST, MUTED, LINE, cardStyle, inputStyle } from "@/lib/theme";
import { ils, toN } from "@/lib/format";
import { Sec, Metric, LabeledInput } from "@/lib/ui";
import { cp } from "@/lib/store";
import { bOver } from "./model";

function CatRow({ item, onUpdate, onDelete }) {
  const [open, setOpen] = useState(false);
  const est = item.est || 0, act = item.act || 0;
  const over = bOver(item);
  return (
    <div style={{ borderBottom: `1px solid ${LINE}`, padding: "8px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, flex: 1, minWidth: 0 }}>
          <input type="checkbox" checked={!!item.done} onChange={e => onUpdate({ ...item, done: e.target.checked })} style={{ marginTop: 3 }} />
          <div style={{ minWidth: 0, cursor: "pointer" }} onClick={() => setOpen(!open)}>
            <div style={{ fontSize: 14, textDecoration: item.done ? "line-through" : "none", opacity: item.done ? 0.5 : 1 }}>{item.n}</div>
            <div style={{ fontSize: 11, color: MUTED }}>
              מתוכנן: {ils(est)}
              {act > 0 && <span style={{ color: over ? RUST : GREEN }}> · בפועל: {ils(act)}</span>}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 13, whiteSpace: "nowrap", color: over ? RUST : INK }}>{ils(act > 0 ? act : est)}</div>
      </div>
      {open && (
        <div style={{ marginTop: 8, marginRight: 24, display: "grid", gap: 8 }}>
          <LabeledInput label="שם הקטגוריה" text value={item.n} onBlur={v => onUpdate({ ...item, n: v || item.n, cat: v || item.n })} />
          <div style={{ display: "flex", gap: 8 }}>
            <LabeledInput label="מתוכנן" value={item.est} onBlur={v => onUpdate({ ...item, est: toN(v) })} />
            <LabeledInput label="בפועל החודש" value={item.act} onBlur={v => onUpdate({ ...item, act: toN(v) })} />
          </div>
          <button onClick={() => onDelete(item.id)} style={{ fontSize: 12, color: RUST, background: "none", border: "none", cursor: "pointer", textAlign: "right", padding: 0, fontFamily: "inherit" }}>מחק קטגוריה</button>
        </div>
      )}
    </div>
  );
}

export default function Budget({ d, setD }) {
  const items = d.budget;
  const [showAdd, setShowAdd] = useState(false);
  const [nw, setNw] = useState({ n: "", est: "" });

  const planned = items.reduce((s, b) => s + (b.est || 0), 0);
  const actual = items.reduce((s, b) => s + (b.act || 0), 0);
  const diff = planned - actual;

  const updateItem = (id, ni) => setD(p => { const n = cp(p); const idx = n.budget.findIndex(x => x.id === id); if (idx >= 0) n.budget[idx] = ni; return n; });
  const deleteItem = id => setD(p => { const n = cp(p); n.budget = n.budget.filter(x => x.id !== id); return n; });
  const addItem = () => {
    if (!nw.n.trim()) return;
    setD(p => { const n = cp(p); n.budget.push({ id: Date.now(), n: nw.n.trim(), cat: nw.n.trim(), est: toN(nw.est), act: 0, done: false }); return n; });
    setNw({ n: "", est: "" }); setShowAdd(false);
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <Metric label="מתוכנן" value={ils(planned)} />
        <Metric label="בפועל" value={ils(actual)} color={actual > planned ? RUST : GREEN} />
        <Metric label={diff >= 0 ? "נשאר בתקציב" : "חריגה"} value={ils(Math.abs(diff))} color={diff >= 0 ? GREEN : RUST} />
      </div>

      <Sec title="קטגוריות תקציב חודשי" />
      <div style={cardStyle}>
        {items.map(item => <CatRow key={item.id} item={item} onUpdate={ni => updateItem(item.id, ni)} onDelete={deleteItem} />)}
      </div>

      {showAdd ? (
        <div style={{ ...cardStyle, padding: 14 }}>
          <div style={{ display: "grid", gap: 8 }}>
            <input placeholder="שם קטגוריה" value={nw.n} onChange={e => setNw({ ...nw, n: e.target.value })} style={inputStyle} />
            <input placeholder="סכום מתוכנן" value={nw.est} onChange={e => setNw({ ...nw, est: e.target.value })} style={inputStyle} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={addItem} style={{ flex: 1, border: "none", background: INK, color: PAPER, borderRadius: 4, padding: "8px 0", cursor: "pointer", fontFamily: "inherit" }}>הוסף</button>
              <button onClick={() => setShowAdd(false)} style={{ flex: 1, border: `1px solid ${LINE}`, background: "transparent", borderRadius: 4, padding: "8px 0", cursor: "pointer", fontFamily: "inherit" }}>ביטול</button>
            </div>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)} style={{ width: "100%", padding: 10, border: `1px dashed ${MUTED}`, borderRadius: 4, background: "transparent", color: MUTED, cursor: "pointer", fontFamily: "inherit" }}>
          + הוסף קטגוריה
        </button>
      )}
    </div>
  );
}
