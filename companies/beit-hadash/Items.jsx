"use client";
import { useState } from "react";
import { INK, BG, GREEN, AMBER, ACCENT, RUST, MUTED, LINE, cardStyle, inputStyle } from "@/lib/theme";
import { ils, toN } from "@/lib/format";
import { Sec, Metric, LabeledInput } from "@/lib/ui";
import { cp } from "@/lib/store";
import { effP, iPaid, iRem, EXP_CATS_DEFAULT, RENO_CATS_DEFAULT } from "./model";

function ItemRow({ item, onUpdate, onDelete }) {
  const [open, setOpen] = useState(false);
  const eff = effP(item), rem = iRem(item), adv = item.advance || 0;
  return (
    <div style={{ borderBottom: `1px solid ${LINE}`, padding: "8px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, flex: 1, minWidth: 0 }}>
          <input type="checkbox" checked={!!item.done} onChange={e => onUpdate({ ...item, done: e.target.checked })} style={{ marginTop: 3 }} />
          <div style={{ minWidth: 0, cursor: "pointer" }} onClick={() => setOpen(!open)}>
            <div style={{ fontSize: 14, textDecoration: item.done ? "line-through" : "none", opacity: item.done ? 0.5 : 1 }}>{item.n}</div>
            {adv > 0 && !item.done && (
              <div style={{ fontSize: 11 }}>
                <span style={{ color: GREEN }}>שולם: {ils(adv)}</span>
                {rem > 0 && <span style={{ color: AMBER }}> · נשאר: {ils(rem)}</span>}
              </div>
            )}
            {item.supplier && <div style={{ fontSize: 11, color: MUTED }}>{item.supplier}</div>}
          </div>
        </div>
        <div style={{ fontSize: 13, whiteSpace: "nowrap", color: item.done ? GREEN : INK }}>{item.done ? "✓ " : ""}{ils(eff)}</div>
      </div>
      {open && (
        <div style={{ marginTop: 8, marginRight: 24, display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <LabeledInput label="משוער" value={item.est} onBlur={v => onUpdate({ ...item, est: toN(v) })} />
            <LabeledInput label="בפועל" value={item.act} onBlur={v => onUpdate({ ...item, act: toN(v) })} />
          </div>
          <LabeledInput label="מקדמה ששולמה" value={item.advance} onBlur={v => onUpdate({ ...item, advance: toN(v) })} />
          <LabeledInput label="ספק / חברה" text value={item.supplier} onBlur={v => onUpdate({ ...item, supplier: v })} />
          <LabeledInput label="קישור" value={item.link} onBlur={v => onUpdate({ ...item, link: v })} />
          {item.link && <a href={item.link} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: ACCENT }}>פתח קישור</a>}
          <LabeledInput label="הערה" text value={item.note} onBlur={v => onUpdate({ ...item, note: v })} />
          <button onClick={() => onDelete(item.id)} style={{ fontSize: 12, color: RUST, background: "none", border: "none", cursor: "pointer", textAlign: "right", padding: 0, fontFamily: "inherit" }}>מחק פריט</button>
        </div>
      )}
    </div>
  );
}

export default function Items({ d, setD, mode }) {
  const isReno = mode === "reno";
  const arr = isReno ? "reno" : "exp";
  const cats = isReno ? (d.cfg.renoCats || RENO_CATS_DEFAULT) : (d.cfg.expCats || EXP_CATS_DEFAULT);
  const items = d[arr];
  const [showAdd, setShowAdd] = useState(false);
  const [nw, setNw] = useState({ n: "", cat: cats[0], est: "" });

  const total = items.reduce((s, i) => s + effP(i), 0);
  const paid = items.reduce((s, i) => s + iPaid(i), 0);

  const updateItem = (id, ni) => setD(p => { const n = cp(p); const idx = n[arr].findIndex(x => x.id === id); if (idx >= 0) n[arr][idx] = ni; return n; });
  const deleteItem = id => setD(p => { const n = cp(p); n[arr] = n[arr].filter(x => x.id !== id); return n; });
  const addItem = () => {
    if (!nw.n) return;
    setD(p => { const n = cp(p); n[arr].push({ id: Date.now(), n: nw.n, cat: nw.cat, est: toN(nw.est), act: 0, advance: 0, done: false, note: "", supplier: "", link: "" }); return n; });
    setNw({ n: "", cat: cats[0], est: "" }); setShowAdd(false);
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <Metric label={isReno ? "תקציב כולל" : 'סה"כ'} value={ils(total)} />
        <Metric label="שולם / מקדמות" value={ils(paid)} color={GREEN} />
        <Metric label="נשאר" value={ils(total - paid)} color={AMBER} />
      </div>
      {cats.map(cat => {
        const catItems = items.filter(i => i.cat === cat);
        if (!catItems.length) return null;
        return (
          <div key={cat}>
            <Sec title={cat} />
            <div style={cardStyle}>{catItems.map(item => <ItemRow key={item.id} item={item} onUpdate={ni => updateItem(item.id, ni)} onDelete={deleteItem} />)}</div>
          </div>
        );
      })}
      {showAdd ? (
        <div style={{ ...cardStyle, padding: 14 }}>
          <div style={{ display: "grid", gap: 8 }}>
            <input className="hq-field" placeholder={isReno ? "פריט שיפוץ" : "שם ההוצאה"} value={nw.n} onChange={e => setNw({ ...nw, n: e.target.value })} style={inputStyle} />
            <div style={{ display: "flex", gap: 8 }}>
              <input className="hq-field" placeholder="סכום משוער" value={nw.est} onChange={e => setNw({ ...nw, est: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
              <select className="hq-field" value={nw.cat} onChange={e => setNw({ ...nw, cat: e.target.value })} style={{ ...inputStyle, flex: 1 }}>
                {cats.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={addItem} style={{ flex: 1, border: "none", background: INK, color: BG, borderRadius: 2, padding: "8px 0", cursor: "pointer", fontFamily: "inherit" }}>הוסף</button>
              <button onClick={() => setShowAdd(false)} style={{ flex: 1, border: `1px solid ${LINE}`, background: "transparent", borderRadius: 2, padding: "8px 0", cursor: "pointer", fontFamily: "inherit" }}>ביטול</button>
            </div>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)} style={{ width: "100%", padding: 10, border: `1px dashed ${MUTED}`, borderRadius: 2, background: "transparent", color: MUTED, cursor: "pointer", fontFamily: "inherit" }}>
          + הוסף {isReno ? "פריט שיפוץ" : "הוצאה"}
        </button>
      )}
    </div>
  );
}
