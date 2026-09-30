"use client";
import { useState } from "react";
import { apiFetch, apiErrorMessage } from "@/lib/api-client.mjs";
import { buildSyncedSnapshot, knownLabels, markSyncFailed, setEnvelopeLabel, summarizeEnvelopes, summarizeTransactions, UNLABELED } from "./riseup-sync-model";
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

// RiseUp לא חושף שם/קטגוריה חופשית למעטפה - רק id יציב. מזהה קצר לתצוגה, כדי שאפשר יהיה
// להבדיל בין שורות בלי לחשוף/להדפיס את ה-id המלא בכל מקום.
const shortId = id => `מעטפה #${String(id || "").slice(-6) || "?"}`;

function EnvelopeRow({ envelope, label, options, onLabel }) {
  const [value, setValue] = useState(label || "");
  const planned = Number.isFinite(envelope.originalAmount) ? envelope.originalAmount : 0;
  const actual = Number.isFinite(envelope.balancedAmount) ? envelope.balancedAmount : 0;
  const commit = () => { if (value.trim() !== (label || "")) onLabel(envelope.id, value); };
  return (
    <div className={s.envelopeRow}>
      <div className={s.envelopeInfo}>
        <strong>{shortId(envelope.id)}</strong>
        <span>מתוכנן {Math.abs(planned).toLocaleString("he-IL")} ₪ · בפועל {Math.abs(actual).toLocaleString("he-IL")} ₪</span>
      </div>
      <label className={s.envelopeLabelField}>
        <span>תיוג אישי</span>
        <input list="riseup-known-labels" value={value} placeholder={UNLABELED}
          onChange={e => setValue(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />
      </label>
    </div>
  );
}

export default function RiseupSync({ data, setData, ready }) {
  const snapshot = data?.snapshot || null;
  const lastError = data?.lastError || null;
  const labels = data?.envelopeLabels || {};
  const notConfigured = lastError?.code === "not_configured";
  const [busy, setBusy] = useState(false); // רק דגל UI - לא נשמר, לא חלק מה-store הפר-משתמש

  async function syncNow() {
    if (!setData || busy) return;
    setBusy(true);
    try {
      const response = await fetchBudget();
      const { snapshot: next } = buildSyncedSnapshot(snapshot, response);
      setData(prev => ({ ...prev, snapshot: next, lastError: null }));
    } catch (e) {
      if (e.notConfigured) {
        setData(prev => ({ ...prev, snapshot, lastError: { code: "not_configured", message: e.message, at: new Date().toISOString() } }));
      } else {
        setData(prev => ({ ...prev, snapshot: markSyncFailed(snapshot, e.message), lastError: { code: e.code || "error", message: e.message, at: new Date().toISOString() } }));
      }
    } finally {
      setBusy(false);
    }
  }

  const onLabel = (id, value) => setData(prev => ({ ...prev, envelopeLabels: setEnvelopeLabel(prev?.envelopeLabels, id, value) }));

  if (!ready) return <div style={{ padding: 40, textAlign: "center", opacity: .6 }}>טוען...</div>;

  // מחושב חי מה-envelopes הגולמיים השמורים + התיוגים הנוכחיים - עריכת תיוג משפיעה מיד על
  // הפילוח, בלי לדרוש סנכרון חוזר (הסיכום עצמו לא נשמר בצילום, ראו riseup-sync-model.js).
  const summary = snapshot ? summarizeEnvelopes(snapshot.envelopes, labels) : null;
  // פילוח עסקה-עסקה (תאריך+עסק+סכום) - לא רק סיכום לפי מעטפה, בקשה מפורשת שזה ייראה
  // "בדיוק כמו ברייזאפ". מגיע מ-envelope.actuals[], ראו lib/riseup-service.mjs.
  const transactions = snapshot ? summarizeTransactions(snapshot.envelopes, labels) : [];
  const options = knownLabels(labels);
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
              <caption>הוצאות לפי תיוג אישי (מתוכנן מול בפועל)</caption>
              <thead><tr><th>תיוג</th><th>מתוכנן</th><th>בפועל</th><th>מעטפות</th></tr></thead>
              <tbody>
                {summary.byLabel.map(row => (
                  <tr key={row.label}><td>{row.label}</td><td>{row.planned.toLocaleString("he-IL")} ₪</td><td>{row.actual.toLocaleString("he-IL")} ₪</td><td>{row.count}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={s.footnote}>
            RiseUp לא חושף שם/קטגוריה למעטפה עצמה — רק סכום ומזהה. עד שמעטפה מתויגת ידנית למטה (לדוגמה "סופר", "דלק", "מסעדות"), כל העסקאות שבה מופיעות תחת "{UNLABELED}". התיוג נשמר אצלך ומזהה את אותה מעטפה גם בסנכרונים הבאים.
          </p>

          {transactions.length > 0 && (
            <div className={s.table}>
              <table>
                <caption>עסקאות אחרונות ({transactions.length}) — תאריך, עסק, קטגוריה וסכום, כמו ברייזאפ</caption>
                <thead><tr><th>תאריך</th><th>עסק</th><th>קטגוריה</th><th>סכום</th></tr></thead>
                <tbody>
                  {transactions.map(t => (
                    <tr key={t.id}>
                      <td><bdi dir="ltr">{t.date ? new Date(t.date).toLocaleDateString("he-IL") : "—"}</bdi></td>
                      <td>{t.business || "—"}{t.isInstallment && t.paymentNumber && t.totalPayments ? ` (תשלום ${t.paymentNumber}/${t.totalPayments})` : ""}</td>
                      <td>{t.label}</td>
                      <td style={{ color: t.isIncome ? "#9ae8e0" : "inherit" }}>{t.isIncome ? "+" : "-"}{Math.abs(t.amount).toLocaleString("he-IL")} ₪</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <datalist id="riseup-known-labels">{options.map(o => <option key={o} value={o} />)}</datalist>
          <h3 className={s.envelopesTitle}>תיוג מעטפות ({snapshot.envelopes.length})</h3>
          <div className={s.envelopeList}>
            {snapshot.envelopes.map(envelope => (
              <EnvelopeRow key={envelope.id} envelope={envelope} label={labels[envelope.id]} options={options} onLabel={onLabel} />
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
