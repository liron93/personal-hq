// טוקני עיצוב משותפים לכל תתי-החברות — יסוד עיצוב אחיד ברמת מוצר הייטק,
// לא כרטיס/דוח שנתי. המספרים הם הגיבורים; העיצוב נשאר ברקע ותומך בהם.
//
// זהו "בסיס העיצוב המשותף" בלבד (טוקנים, כרטיסים, כפתורים, ריווח, RTL,
// hover/focus, responsive). עיצוב פרטני של כל תת-חברה נשאר לשלב הבא —
// קובץ זה לא נוגע בלוגיקה או בפריסה הפנימית של אף תת-חברה.

export const INK = "#171A21";
export const BG = "#F6F7F9";
export const CARD = "#FFFFFF";
export const ACCENT = "#1B3A5C";
export const ACCENT_HOVER = "#12283F";
export const GREEN = "#1F8A5F";
export const RUST = "#C23B3B";
export const AMBER = "#C98A1B";
export const MUTED = "#6B7280";
export const LINE = "#E2E5EA";

// סקאלת ריווח אחידה (px) — לשימוש עתידי בעיצוב פרטני, במקום מספרים חופשיים
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

// רדיוסים, צללים ומעברים אחידים — כרטיס מודרני ורך, לא טבלת נתונים שטוחה
export const RADIUS = 12;
export const RADIUS_SM = 8;
export const SHADOW = "0 1px 2px rgba(23,26,33,.04), 0 6px 18px rgba(23,26,33,.06)";
export const SHADOW_HOVER = "0 2px 4px rgba(23,26,33,.06), 0 10px 26px rgba(23,26,33,.1)";
export const TRANSITION = "150ms ease";

export const cardStyle = {
  background: CARD,
  borderRadius: RADIUS,
  padding: "16px 20px",
  marginBottom: SPACE.md,
  border: `1px solid ${LINE}`,
  boxShadow: SHADOW,
};

// טאב עם קו תחתון בצבע ACCENT כשפעיל — לא כפתור-כדור עם רקע מלא
export const tabBtn = active => ({
  fontSize: 13, height: 36, padding: "0 14px", border: "none", borderRadius: RADIUS_SM,
  borderBottom: `2px solid ${active ? ACCENT : "transparent"}`,
  background: active ? "rgba(27,58,92,.07)" : "transparent",
  color: active ? INK : MUTED, cursor: "pointer", fontFamily: "inherit",
  display: "flex", alignItems: "center", flexShrink: 0,
  transition: `background ${TRANSITION}, color ${TRANSITION}, border-color ${TRANSITION}`,
});

// גבול תחתון בלבד; מסגרת מלאה + זוהר עדין במצב focus מגיעים מ-.hq-field ב-globals.css
export const inputStyle = {
  padding: "9px 6px", fontSize: 14, fontFamily: "inherit", background: "transparent", color: INK,
  transition: `border-color ${TRANSITION}, box-shadow ${TRANSITION}`,
};

// כפתור ראשי — פעולה עיקרית אחת בכל מסך
export const primaryBtn = {
  border: "none", background: INK, color: BG, borderRadius: RADIUS_SM, padding: "0 16px", height: 38,
  cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 500,
  fontFamily: "inherit", boxShadow: "0 1px 2px rgba(23,26,33,.1)",
  transition: `background ${TRANSITION}, box-shadow ${TRANSITION}, transform ${TRANSITION}`,
};

// כפתור משני — פעולות תומכות (ביטול, סינון וכד')
export const secondaryBtn = {
  border: `1px solid ${LINE}`, background: CARD, color: INK, borderRadius: RADIUS_SM, padding: "0 16px", height: 38,
  cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 500, fontFamily: "inherit",
  transition: `background ${TRANSITION}, border-color ${TRANSITION}`,
};

// כפתור רפאים — פעולות משניות שוליות (מחיקה, קישורים טקסטואליים)
export const ghostBtn = {
  border: "none", background: "transparent", color: MUTED, borderRadius: RADIUS_SM, padding: "0 10px", height: 34,
  cursor: "pointer", fontSize: 13, fontFamily: "inherit",
  transition: `color ${TRANSITION}, background ${TRANSITION}`,
};
