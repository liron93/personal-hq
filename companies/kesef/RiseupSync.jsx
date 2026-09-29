"use client";
import { useState } from "react";
import { apiFetch, apiErrorMessage } from "@/lib/api-client.mjs";
import { BUDGET_CATS_DEFAULT } from "./model";
import { buildSyncedSnapshot, markSyncFailed } from "./riseup-sync-model";
import s from "./riseup-sync.module.css";

// v1: קריאה בלבד, בקשה ידנית אחת בכל לחיצה, ללא ריענון אוטומטי בטעינה וללא היסטוריה -
// state (data/setData) מגיע כ-prop מ-Company.jsx (ליפט, כמו MarketConnection מקבל
// result/setResult/symbol/setSymbol), אבל כאן זה useStore אמיתי (נשמר פר-משתמש), לא state
// זמני בזיכרון - כי בניגוד לנתוני EODHD, כאן במפורש התבקשה שמירה קבועה של הצילום האחרון.
async function fetchBudget() {
  const response = await apiFetch("/api/riseup/budget", { credentials: "same-origin", cache: "no-store" });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(apiErrorMessage(response.status, value.error, "הסנכרון עם RiseUp נכשל."));
    err.code = value.code;
    err.notConfigured = value.code === "not_configured";
    throw err;
  }
  return value;
}

export default function RiseupSync({ data, setData, ready }) {
  const snapshot = data?.snapshot || null;
  const lastError = data?.lastError || null;
  const notConfigured = lastError?.code === "not_configured";
  const [busy, setBusy] = useState(false); // רק דגל UI - לא נשמר, לא חלק מה-store הפר-משתמש

  async function syncNow() {
    if (!setData || busy) return;
    setBusy(true);
    try {
      const response = await fetchBudget();
      const { snapshot: next } = buildSyncedSnapshot(snapshot, response);
      setData({ snapshot: next, lastError: null });
    } catch (e) {
      if (e.notConfigured) {
        setData({ snapshot, lastError: { code: "not_configured", message: e.message, at: new Date().toISOString() } });
      } else {
        setData({ snapshot: markSyncFailed(snapshot, e.message), lastError: { code: e.code || "error", message: e.message, at: new Date().toISOString() } });
      }
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <div style={{ padding: 40, textAlign: "center", opacity: .6 }}>טוען...</div>;

  const summary = snapshot?.summary;
  const badgeLabel = notConfigured ? "לא מוגדר בשרת" : snapshot ? (snapshot.stale ? "שגיאה — מוצג נתון קודם" : "מסונכרן") : lastError ? "שגיאה" : "טרם סונכרן";

  return (
    <section className={s.panel} dir="rtl">
      <header>
        <div>
          <p className={s.eyebrow}>RISEUP / תקציב</p>
          <h2>סנכרון תקציב RiseUp</h2>
          <p>קריאה בלבד — לא נכתב שום דבר חזרה ל-RiseUp. סנכרון ידני: לחיצה אחת = בקשה אחת.</p>
        </div>
        <span className={s.badge}>{badgeLabel}</span>
      </header>

      <div className={s.notice}>הטוקן מוגבל ל-60 בקשות בדקה ו-1000 ביום אצל RiseUp, ועשוי להיות משותף עם כלים אחרים (כמו לקוח RiseUp MCP מקומי) — לכן ייתכן שתתקבל הודעת "יותר מדי בקשות" גם כשמכאן נשלחה רק בקשה אחת.</div>

      <button onClick={syncNow} disabled={busy}>{busy ? "מסנכרן…" : "סנכרון עכשיו"}</button>

      {notConfigured && <p role="status">סנכרון RiseUp עדיין לא הוגדר בשרת (חסר RISEUP_PAT). יש לפנות למי שמנהל את הפריסה.</p>}
      {!notConfigured && lastError && <p role="alert" className={s.error}>{lastError.message}</p>}
      {!lastError && !snapshot && <p role="status">עדיין לא בוצע סנכרון. לחצו על "סנכרון עכשיו" כדי למשוך את התקציב הנוכחי מ-RiseUp.</p>}

      {snapshot && (
        <section aria-label="סיכום התקציב שסונכרן">
          <p className={s.footnote}>סונכרן לאחרונה: {new Date(snapshot.syncedAt).toLocaleString("he-IL")} · עדכון אחרון אצל RiseUp: {snapshot.lastUpdatedAt ? new Date(snapshot.lastUpdatedAt).toLocaleString("he-IL") : "לא דווח"} · חודש <bdi dir="ltr">{snapshot.budgetDate}</bdi></p>
          <div className={s.metrics}>
            <article><span>הכנסה מתוכננת</span><strong>{summary.income.planned.toLocaleString("he-IL")} ₪</strong></article>
            <article><span>הכנסה בפועל</span><strong>{summary.income.actual.toLocaleString("he-IL")} ₪</strong></article>
            <article><span>מעטפות בסך הכל</span><strong>{snapshot.envelopes.length}</strong></article>
          </div>
          <div className={s.table}>
            <table>
              <caption>הוצאות לפי קטגוריה (מתוכנן מול בפועל)</caption>
              <thead><tr><th>קטגוריה</th><th>מתוכנן</th><th>בפועל</th><th>מעטפות</th></tr></thead>
              <tbody>
                {BUDGET_CATS_DEFAULT.map(cat => {
                  const row = summary.byCategory[cat];
                  return <tr key={cat}><td>{cat}</td><td>{row.planned.toLocaleString("he-IL")} ₪</td><td>{row.actual.toLocaleString("he-IL")} ₪</td><td>{row.count}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
          {summary.unmappedTypes.length > 0 && <p className={s.footnote}>סוגי מעטפה לא מוכרים אצל RiseUp שנפלו ל"אחר": {summary.unmappedTypes.join(", ")}</p>}
        </section>
      )}
    </section>
  );
}
