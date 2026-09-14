"use client";

export default function OriaError({ reset }) {
  return (
    <main dir="rtl" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#081c1a", color: "#ecfff9", fontFamily: "Heebo, Arial, sans-serif" }}>
      <section style={{ maxWidth: 520, border: "1px solid #ffffff2b", borderRadius: 20, padding: 28, background: "#102a27" }}>
        <p style={{ color: "#51e0bb", fontWeight: 800, margin: "0 0 8px" }}>אוריה · מרכז השליטה</p>
        <h1 style={{ margin: 0, fontSize: 26 }}>המסך נתקל בתקלה זמנית</h1>
        <p style={{ color: "#c8ddd4", lineHeight: 1.7 }}>הפעולה נשמרה במכשיר לפני הסנכרון. אפשר לנסות לטעון את המסך מחדש בלי לאבד אותה.</p>
        <button onClick={reset} style={{ border: 0, borderRadius: 12, minHeight: 46, padding: "0 18px", background: "#51e0bb", color: "#05221b", font: "800 16px Heebo, Arial", cursor: "pointer" }}>נסה שוב</button>
      </section>
    </main>
  );
}
