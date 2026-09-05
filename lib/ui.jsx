"use client";
import { INK, MUTED, GOLD, LINE } from "./theme";
import { toN } from "./format";

export function Sec({ title }) { return <div style={{ fontSize: 13, color: GOLD, margin: "16px 0 8px" }}>{title}</div>; }

export function Row({ label, children, last, bold }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: last ? "none" : `1px solid ${LINE}`, fontWeight: bold ? 500 : 400 }}>
      <span style={{ fontSize: 14, color: bold ? INK : MUTED }}>{label}</span>
      {children}
    </div>
  );
}

export function Metric({ label, value, sub, color }) {
  return (
    <div style={{ flex: 1, background: "#E4DDC9", borderRadius: 4, padding: 12 }}>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 19, color: color || INK }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function EditableNum({ value, onChange }) {
  return (
    <input defaultValue={value || ""} key={String(value)}
      onBlur={e => onChange(toN(e.target.value))} onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
      style={{ width: 92, textAlign: "left", direction: "ltr", border: `1px solid ${INK}22`, borderRadius: 4, padding: "3px 6px", fontSize: 13, fontFamily: "inherit", background: "transparent", color: INK }} />
  );
}

export function LabeledInput({ label, value, onBlur, text }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: MUTED, marginBottom: 2 }}>{label}</div>
      <input defaultValue={value || ""} key={String(value)} onBlur={e => onBlur(e.target.value)} onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
        style={{ width: "100%", border: `1px solid ${LINE}`, borderRadius: 4, padding: "6px 8px", fontSize: 13, fontFamily: "inherit", direction: text ? "rtl" : "ltr" }} />
    </div>
  );
}
