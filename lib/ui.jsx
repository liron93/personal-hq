"use client";
import { INK, MUTED, ACCENT, CARD, LINE, RADIUS, RADIUS_SM, SHADOW, SPACE, primaryBtn, secondaryBtn, ghostBtn } from "./theme";
import { toN } from "./format";

export function Sec({ title }) { return <div style={{ fontSize: 13, color: ACCENT, fontWeight: 500, margin: `${SPACE.lg}px 0 ${SPACE.sm}px` }}>{title}</div>; }

export function Row({ label, children, last, bold }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: last ? "none" : `1px solid ${LINE}`, fontWeight: bold ? 500 : 400 }}>
      <span style={{ fontSize: 14, color: bold ? INK : MUTED }}>{label}</span>
      {children}
    </div>
  );
}

// המספר הוא הגיבור הוויזואלי: גדול ומודגש, התווית מעליו קטנה ומושתקת
export function Metric({ label, value, sub, color }) {
  return (
    <div style={{ flex: 1, background: CARD, border: `1px solid ${LINE}`, borderRadius: RADIUS, boxShadow: SHADOW, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 600, color: color || INK, lineHeight: 1.15 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// כפתור משותף — variant אחד לכל תת-חברה, במקום סגנון בהתאמה אישית בכל קובץ.
// "primary" (פעולה עיקרית), "secondary" (תומכת) או "ghost" (משנית/שולית).
const VARIANTS = { primary: primaryBtn, secondary: secondaryBtn, ghost: ghostBtn };
export function Button({ variant = "secondary", style, children, ...rest }) {
  return <button style={{ ...VARIANTS[variant], ...style }} {...rest}>{children}</button>;
}

export function EditableNum({ value, onChange }) {
  return (
    <input defaultValue={value || ""} key={String(value)} className="hq-field"
      onBlur={e => onChange(toN(e.target.value))} onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
      style={{ width: 92, textAlign: "left", direction: "ltr", padding: "4px 6px", fontSize: 13, fontFamily: "inherit", background: "transparent", color: INK, borderRadius: RADIUS_SM }} />
  );
}

export function LabeledInput({ label, value, onBlur, text }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: MUTED, marginBottom: 3 }}>{label}</div>
      <input defaultValue={value || ""} key={String(value)} className="hq-field" onBlur={e => onBlur(e.target.value)} onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
        style={{ width: "100%", padding: "7px 4px", fontSize: 13, fontFamily: "inherit", background: "transparent", direction: text ? "rtl" : "ltr", borderRadius: RADIUS_SM }} />
    </div>
  );
}
