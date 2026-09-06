"use client";
import { INK, MUTED, ACCENT, CARD, LINE } from "./theme";
import { toN } from "./format";

export function Sec({ title }) { return <div style={{ fontSize: 13, color: ACCENT, margin: "16px 0 8px" }}>{title}</div>; }

export function Row({ label, children, last, bold }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: last ? "none" : `1px solid ${LINE}`, fontWeight: bold ? 500 : 400 }}>
      <span style={{ fontSize: 14, color: bold ? INK : MUTED }}>{label}</span>
      {children}
    </div>
  );
}

// המספר הוא הגיבור הוויזואלי: גדול ומודגש, התווית מעליו קטנה ומושתקת
export function Metric({ label, value, sub, color }) {
  return (
    <div style={{ flex: 1, background: CARD, border: `1px solid ${LINE}`, borderRadius: 2, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 600, color: color || INK, lineHeight: 1.15 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export function EditableNum({ value, onChange }) {
  return (
    <input defaultValue={value || ""} key={String(value)} className="hq-field"
      onBlur={e => onChange(toN(e.target.value))} onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
      style={{ width: 92, textAlign: "left", direction: "ltr", padding: "3px 6px", fontSize: 13, fontFamily: "inherit", background: "transparent", color: INK }} />
  );
}

export function LabeledInput({ label, value, onBlur, text }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: MUTED, marginBottom: 2 }}>{label}</div>
      <input defaultValue={value || ""} key={String(value)} className="hq-field" onBlur={e => onBlur(e.target.value)} onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
        style={{ width: "100%", padding: "6px 4px", fontSize: 13, fontFamily: "inherit", background: "transparent", direction: text ? "rtl" : "ltr" }} />
    </div>
  );
}
