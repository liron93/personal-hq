"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { MUTED, RUST, inputStyle, primaryBtn } from "@/lib/theme";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function send(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
    });
    setLoading(false);
    if (error) {
      const msg = error.message || "";
      setErr(
        /rate limit/i.test(msg)
          ? "נשלחו יותר מדי בקשות התחברות בזמן קצר. המתן כמה דקות ונסה שוב."
          : `שליחת הקישור נכשלה (${msg || "שגיאה לא ידועה"}). נסה שוב.`
      );
    } else setSent(true);
  }

  return (
    <main style={{ maxWidth: 420, margin: "0 auto", padding: "80px 20px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, margin: "0 0 8px" }}>התחברות</h1>
      <p style={{ color: MUTED, fontSize: 14, marginBottom: 28, lineHeight: 1.7 }}>
        הזן כתובת מייל ונשלח אליך קישור התחברות.
      </p>

      {sent ? (
        <p style={{ lineHeight: 1.7 }}>נשלח קישור התחברות ל-{email}. בדוק את תיבת הדואר שלך ולחץ על הקישור.</p>
      ) : (
        <form onSubmit={send} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="email"
            required
            dir="ltr"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={{ ...inputStyle, width: "100%", textAlign: "left" }}
          />
          <button type="submit" disabled={loading} style={{ ...primaryBtn, height: 42, justifyContent: "center" }}>
            {loading ? "שולח..." : "שלח קישור התחברות"}
          </button>
          {err && <p style={{ color: RUST, fontSize: 13, margin: 0 }}>{err}</p>}
        </form>
      )}
    </main>
  );
}
