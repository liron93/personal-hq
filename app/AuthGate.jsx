"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const panelStyle = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  background: "#F6F7F9",
  padding: 20,
  direction: "rtl",
  fontFamily: "Arial, sans-serif",
};

function PrimaryButton({ children, ...props }) {
  return (
    <button
      {...props}
      style={{
        width: "100%",
        border: 0,
        borderRadius: 12,
        background: "#182230",
        color: "white",
        padding: "14px 16px",
        fontSize: 16,
        fontWeight: 700,
        cursor: "pointer",
        opacity: props.disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

export default function AuthGate({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState("passkey");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setUser(data.session?.user ?? null);
        setReady(true);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setReady(true);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function signInWithPasskey() {
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithPasskey();
    if (error) setMessage(error.message);
    setBusy(false);
  }

  async function sendFirstSetupLink(e) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setMessage(error ? error.message : "נשלח קישור חד־פעמי. פתח אותו כאן, ואז נגדיר Passkey במכשיר.");
    setBusy(false);
  }

  async function registerPasskey() {
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.registerPasskey();
    setMessage(error ? error.message : "ה־Passkey נוסף בהצלחה למכשיר הזה.");
    setBusy(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setMessage("");
  }

  if (!ready) {
    return <div style={panelStyle}>טוען את סביבת העבודה…</div>;
  }

  if (!user) {
    return (
      <main style={panelStyle}>
        <section style={{ width: "min(100%, 420px)", background: "white", borderRadius: 20, padding: 32, boxShadow: "0 12px 40px rgba(16,24,40,.08)" }}>
          <p style={{ margin: 0, color: "#697386", fontWeight: 700 }}>PERSONAL HQ</p>
          <h1 style={{ margin: "10px 0", fontSize: 32, color: "#182230" }}>כניסה מאובטחת</h1>
          <p style={{ color: "#586174", lineHeight: 1.6 }}>נכנסים עם Face ID, טביעת אצבע או קוד המכשיר — בלי סיסמה ובלי מייל בשימוש היומיומי.</p>

          {mode === "passkey" ? (
            <>
              <PrimaryButton onClick={signInWithPasskey} disabled={busy}>{busy ? "מתחבר…" : "כניסה עם Passkey"}</PrimaryButton>
              <button onClick={() => { setMode("setup"); setMessage(""); }} style={{ width: "100%", border: 0, background: "transparent", color: "#4059AD", marginTop: 18, cursor: "pointer" }}>
                הגדרה ראשונה במכשיר הזה
              </button>
            </>
          ) : (
            <form onSubmit={sendFirstSetupLink}>
              <label style={{ display: "block", color: "#344054", marginBottom: 8 }}>מייל להגדרה חד־פעמית</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={{ width: "100%", boxSizing: "border-box", padding: 13, borderRadius: 10, border: "1px solid #D0D5DD", marginBottom: 12, direction: "ltr" }} />
              <PrimaryButton type="submit" disabled={busy}>{busy ? "שולח…" : "שלח קישור הגדרה"}</PrimaryButton>
              <button type="button" onClick={() => { setMode("passkey"); setMessage(""); }} style={{ width: "100%", border: 0, background: "transparent", color: "#4059AD", marginTop: 18, cursor: "pointer" }}>חזרה לכניסה</button>
            </form>
          )}
          {message && <p role="status" style={{ marginTop: 18, color: "#344054", lineHeight: 1.5 }}>{message}</p>}
        </section>
      </main>
    );
  }

  return (
    <>
      <div style={{ background: "#EEF4FF", borderBottom: "1px solid #C7D7FE", padding: "8px 16px", display: "flex", gap: 12, alignItems: "center", justifyContent: "center", direction: "rtl", fontSize: 13 }}>
        <span>מחובר באופן מאובטח. הנתונים מסתנכרנים לחשבון שלך.</span>
        <button onClick={registerPasskey} disabled={busy} style={{ border: 0, background: "transparent", color: "#1D4ED8", cursor: "pointer", fontWeight: 700 }}>הוסף Passkey למכשיר הזה</button>
        <button onClick={signOut} style={{ border: 0, background: "transparent", color: "#475467", cursor: "pointer" }}>יציאה</button>
      </div>
      {message && <div role="status" style={{ textAlign: "center", background: "#FFFAEB", padding: 8, color: "#7A5B00", direction: "rtl" }}>{message}</div>}
      {children}
    </>
  );
}
