"use client";
// חיבור Hevy (קריאה בלבד): הזנת מפתח API בטופס מאובטח, בדיקת חיבור, וייבוא עם Preview לפני
// שמירה. המפתח עצמו אף פעם לא חוזר לכאן אחרי השמירה - רק סטטוס (מחובר/לא, בדיקה אחרונה).
// הצפנה/שמירה/קריאה מול Hevy קורות אך ורק בשרת (lib/hevy-*.mjs) - ראה Issue #7 P0.
import { useEffect, useState } from "react";
import { Eye, EyeOff, Link2, Link2Off, RefreshCw } from "lucide-react";
import { apiFetch, apiErrorMessage } from "@/lib/api-client.mjs";
import { importHevyWorkouts } from "../model";
import css from "./health-v2.module.css";

export default function HevyConnect({ d, setD, onClose }) {
  const [status, setStatus] = useState(null); // {configured, connected, lastCheckedAt, lastCheckOk} | null = בטעינה
  const [statusError, setStatusError] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(""); // "" | connect | test | disconnect | import
  const [actionError, setActionError] = useState("");
  const [actionMsg, setActionMsg] = useState("");
  const [preview, setPreview] = useState(null); // [{hevySourceId,title,date,exercises}] | null

  const loadStatus = async () => {
    setStatusError("");
    try {
      const res = await apiFetch("/api/health/hevy/status", { method: "GET", credentials: "same-origin", cache: "no-store" });
      const value = await res.json().catch(() => ({}));
      if (!res.ok) { setStatusError(apiErrorMessage(res.status, value.error, "לא ניתן לטעון את סטטוס החיבור.")); return; }
      setStatus(value);
    } catch {
      setStatusError("לא ניתן לטעון את סטטוס החיבור.");
    }
  };
  useEffect(() => { loadStatus(); }, []);

  const connect = async () => {
    if (!apiKey.trim()) { setActionError("הזינו מפתח API."); return; }
    setBusy("connect"); setActionError(""); setActionMsg("");
    try {
      const res = await apiFetch("/api/health/hevy/connect", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      const value = await res.json().catch(() => ({}));
      if (!res.ok) { setActionError(apiErrorMessage(res.status, value.error, "החיבור נכשל.")); return; }
      setApiKey(""); setActionMsg("החיבור ל-Hevy נשמר בהצלחה.");
      await loadStatus();
    } catch {
      setActionError("החיבור נכשל.");
    } finally {
      setBusy("");
    }
  };

  const test = async () => {
    setBusy("test"); setActionError(""); setActionMsg("");
    try {
      const res = await apiFetch("/api/health/hevy/test", { method: "POST", credentials: "same-origin", cache: "no-store" });
      const value = await res.json().catch(() => ({}));
      if (!res.ok) { setActionError(apiErrorMessage(res.status, value.error, "בדיקת החיבור נכשלה.")); await loadStatus(); return; }
      setActionMsg(value.username ? `החיבור תקין (${value.username}).` : "החיבור תקין.");
      await loadStatus();
    } catch {
      setActionError("בדיקת החיבור נכשלה.");
    } finally {
      setBusy("");
    }
  };

  const disconnect = async () => {
    setBusy("disconnect"); setActionError(""); setActionMsg(""); setPreview(null);
    try {
      const res = await apiFetch("/api/health/hevy/disconnect", { method: "POST", credentials: "same-origin", cache: "no-store" });
      if (!res.ok) { setActionError("הניתוק נכשל."); return; }
      setActionMsg("Hevy נותק.");
      await loadStatus();
    } catch {
      setActionError("הניתוק נכשל.");
    } finally {
      setBusy("");
    }
  };

  const fetchPreview = async () => {
    setBusy("import"); setActionError(""); setActionMsg(""); setPreview(null);
    try {
      const res = await apiFetch("/api/health/hevy/import", { method: "POST", credentials: "same-origin", cache: "no-store" });
      const value = await res.json().catch(() => ({}));
      if (!res.ok) { setActionError(apiErrorMessage(res.status, value.error, "שליפת האימונים נכשלה.")); return; }
      const workouts = Array.isArray(value.workouts) ? value.workouts : [];
      if (!workouts.length) { setActionMsg("לא נמצאו אימונים לייבוא."); return; }
      setPreview(workouts);
    } catch {
      setActionError("שליפת האימונים נכשלה.");
    } finally {
      setBusy("");
    }
  };

  const confirmImport = () => {
    if (!preview) return;
    const { state: next, importedCount, skippedCount } = importHevyWorkouts(d, preview);
    setD(next);
    setPreview(null);
    setActionMsg(skippedCount > 0 ? `יובאו ${importedCount} אימונים חדשים (${skippedCount} כבר יובאו בעבר).` : `יובאו ${importedCount} אימונים חדשים.`);
  };

  return (
    <section className={css.card + " " + css.stack}>
      <div className={css.composerHead}><h2>חיבור Hevy</h2><button className={css.secondary} onClick={onClose}>סגירה</button></div>
      <p className={css.subtle}>חיבור קריאה-בלבד לחשבון ה-Hevy שלך - לא נכתב, לא נמחק ולא משתנה כלום בחשבון ה-Hevy עצמו. המפתח נשמר מוצפן, ולעולם לא חוזר למסך הזה אחרי השמירה.</p>

      {statusError && <p role="alert" className={css.validation}>{statusError}</p>}
      {status && !status.configured && <p className={css.subtle}>חיבור Hevy עדיין לא הוגדר בשרת (חסרה תשתית הצפנה/בסיס נתונים). פנו למנהל המערכת.</p>}

      {status?.configured && (
        <div className={css.stack}>
          <div><strong>{status.connected ? "מחובר ל-Hevy" : "לא מחובר"}</strong>
            {status.connected && status.lastCheckedAt && (
              <p className={css.subtle}>בדיקה אחרונה: {new Date(status.lastCheckedAt).toLocaleString("he-IL")} - {status.lastCheckOk ? "תקין" : "נכשלה"}</p>
            )}
          </div>

          {!status.connected && (
            <div className={css.row}>
              <label style={{ flex: 1 }}>מפתח API של Hevy
                <div style={{ position: "relative" }}>
                  <input className={css.field} type={showKey ? "text" : "password"} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="מהגדרות Hevy → API" dir="ltr" />
                  <button type="button" aria-label={showKey ? "הסתרת מפתח" : "הצגת מפתח"} onClick={() => setShowKey(s => !s)} style={{ position: "absolute", left: 8, top: 30, border: "none", background: "transparent", cursor: "pointer" }}>{showKey ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                </div>
              </label>
            </div>
          )}

          {actionError && <p role="alert" className={css.validation}>{actionError}</p>}
          {actionMsg && <p role="status" className={css.subtle}>{actionMsg}</p>}

          <div className={css.onboardingActions}>
            {!status.connected && <button className={css.primary} disabled={busy === "connect"} onClick={connect}><Link2 size={16} /> {busy === "connect" ? "מתחבר…" : "התחברות"}</button>}
            {status.connected && <button className={css.secondary} disabled={busy === "test"} onClick={test}><RefreshCw size={16} /> {busy === "test" ? "בודק…" : "בדיקת חיבור"}</button>}
            {status.connected && <button className={css.secondary} disabled={busy === "import"} onClick={fetchPreview}>{busy === "import" ? "טוען אימונים…" : "ייבוא אימונים"}</button>}
            {status.connected && <button className={css.status + " " + css.skipped} disabled={busy === "disconnect"} onClick={disconnect}><Link2Off size={16} /> {busy === "disconnect" ? "מנתק…" : "ניתוק"}</button>}
          </div>
        </div>
      )}

      {preview && (
        <div className={css.stack}>
          <h3>תצוגה מקדימה - {preview.length} אימונים</h3>
          <p className={css.subtle}>כלום לא נשמר עדיין. אפשר לבדוק ואז לאשר.</p>
          <div className={css.card}>
            {preview.map(w => (
              <article key={w.hevySourceId} className={css.entry}>
                <div><strong>{w.title}</strong><small>{w.date || "ללא תאריך"} · {w.exercises.length} תרגילים</small></div>
              </article>
            ))}
          </div>
          <div className={css.onboardingActions}>
            <button className={css.primary} onClick={confirmImport}>אישור יבוא</button>
            <button className={css.secondary} onClick={() => setPreview(null)}>ביטול</button>
          </div>
        </div>
      )}
    </section>
  );
}
