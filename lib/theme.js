// טוקני עיצוב משותפים לכל תתי-החברות
export const INK = "#1C1815";
export const PAPER = "#EDE7D9";
export const CARD = "#25201B";
export const GOLD = "#A9812F";
export const GREEN = "#5B7A5A";
export const RUST = "#A6553C";
export const MUTED = "#8A8071";
export const LINE = "#D9D2C0";

export const cardStyle = { background: "#fff", borderRadius: 4, padding: "4px 16px", marginBottom: 14, border: `1px solid ${LINE}` };
export const tabBtn = active => ({
  fontSize: 13, padding: "6px 14px", borderRadius: 4, border: `1px solid ${active ? INK : LINE}`,
  background: active ? INK : "transparent", color: active ? PAPER : MUTED, cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
});
export const inputStyle = { padding: "9px 12px", border: `1px solid ${LINE}`, borderRadius: 4, fontSize: 14, fontFamily: "inherit", background: "transparent", color: INK };
export const primaryBtn = { border: "none", background: INK, color: PAPER, borderRadius: 4, padding: "0 14px", cursor: "pointer", display: "flex", alignItems: "center" };
