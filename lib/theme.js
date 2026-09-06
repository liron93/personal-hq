// טוקני עיצוב משותפים לכל תתי-החברות — קונסולת תפעול נקייה, לא כרטיס/דוח שנתי.
// המספרים הם הגיבורים; העיצוב נשאר ברקע.
export const INK = "#171A21";
export const BG = "#F6F7F9";
export const CARD = "#FFFFFF";
export const ACCENT = "#1B3A5C";
export const GREEN = "#1F8A5F";
export const RUST = "#C23B3B";
export const AMBER = "#C98A1B";
export const MUTED = "#6B7280";
export const LINE = "#E2E5EA";

export const cardStyle = { background: CARD, borderRadius: 2, padding: "4px 16px", marginBottom: 14, border: `1px solid ${LINE}` };

// טאב עם קו תחתון בצבע ACCENT כשפעיל — לא כפתור-כדור עם רקע מלא
export const tabBtn = active => ({
  fontSize: 13, height: 34, padding: "0 12px", border: "none", borderRadius: 0,
  borderBottom: `2px solid ${active ? ACCENT : "transparent"}`,
  background: "transparent", color: active ? INK : MUTED, cursor: "pointer", fontFamily: "inherit",
  display: "flex", alignItems: "center", flexShrink: 0,
});
// גבול תחתון בלבד; מסגרת מלאה במצב focus מגיעה מ-.hq-field ב-globals.css
export const inputStyle = { padding: "8px 4px", fontSize: 14, fontFamily: "inherit", background: "transparent", color: INK };
export const primaryBtn = { border: "none", background: INK, color: BG, borderRadius: 2, padding: "0 14px", cursor: "pointer", display: "flex", alignItems: "center" };
