"use client";

// מצב Preview זמני: מיועד לבדיקה של מסכים וזרימות לפני חיבור נתונים אישיים.
// ללא Session שכבת האחסון עובדת מקומית בדפדפן בלבד, ולא קוראת או כותבת נתוני משתמשים ב־Supabase.
// יש להחזיר את AuthGate המקורי לפני שימוש במידע אישי, מסמכים או העלאה לסביבת הייצור.
export default function AuthGate({ children }) {
  return (
    <>
      <div
        role="status"
        style={{
          background: "#FFF4D6",
          color: "#6A4B00",
          borderBottom: "1px solid #F0D58B",
          padding: "9px 16px",
          textAlign: "center",
          fontSize: 13,
        }}
      >
        מצב בדיקה: הנתונים נשמרים בדפדפן הזה בלבד. התחברות וסנכרון יופעלו לפני שימוש אמיתי.
      </div>
      {children}
    </>
  );
}
