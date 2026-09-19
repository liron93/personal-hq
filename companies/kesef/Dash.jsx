"use client";
import { AlertTriangle, ArrowLeft, CheckCircle2, CircleAlert, LoaderCircle, WalletCards } from "lucide-react";
import { GREEN, RUST, AMBER, MUTED, cardStyle } from "@/lib/theme";
import { ils } from "@/lib/format";
import { Sec, Row, Metric } from "@/lib/ui";
import { ASSET_KEYS, bEff, assetsTotal } from "./model";
import { createFinanceAdapter } from "./adapter";

export default function Dash({ d, core, onOpenBudget }) {
  const netWorth = assetsTotal(d.assets);
  const finance = createFinanceAdapter({ core, finance: d });
  const income = (core.mySalary || 0) + (core.wifeSalary || 0);
  const budgetTotal = d.budget.reduce((s, b) => s + bEff(b), 0);
  const mortgage = core.frozen ? 0 : (core.mortgageMonthly || 0);
  const left = income - budgetTotal - mortgage;
  const alerts = finance.alerts;
  const commitments = (d.commitments || []).filter(x => x.status !== "שולם");
  const commitmentTotal = commitments.reduce((sum, x) => sum + Number(x.amount || 0), 0);
  // זה עודף תזרימי בלבד: לפני כרית ביטחון וללא אישור השקעה. אסור להציגו ככסף להשקעה.
  const cashSurplusBeforeBuffer = left - commitmentTotal;

  if (finance.state === "loading") return <div className="finance-command"><section className="finance-state"><LoaderCircle className="finance-spin" size={26}/><strong>מעדכנים את מרכז הבקרה</strong><span>המסך יתעדכן כשהנתונים יהיו מוכנים.</span></section></div>;
  if (finance.state === "error") return <div className="finance-command"><section className="finance-state is-error"><CircleAlert size={26}/><strong>לא הצלחנו לעדכן את הנתונים</strong><span>המידע הידני נשמר. אפשר לנסות שוב לאחר שחיבור ה־API יוגדר.</span></section></div>;

  return (
    <div className="finance-command">
      <div className="finance-page-intro">
        <div><span className="finance-kicker">חברת הכספים</span><h2>מה דורש החלטה עכשיו?</h2><p>תמונת מצב שמבדילה בין כסף פנוי, התחייבויות וחריגות.</p></div>
        <div className="finance-fresh"><WalletCards size={17}/>{finance.mode === "demo" ? "מצב Demo · נתונים ידניים בלבד" : "API מחובר"}</div>
      </div>
      <div className="finance-summary-grid finance-summary-grid--four">
        <Metric label="התחייבויות פתוחות" value={ils(commitmentTotal)} sub={`${commitments.length} פריטים בתזרים`} color={commitmentTotal ? AMBER : GREEN} />
        <Metric label="עודף תזרימי לפני כרית ביטחון" value={ils(cashSurplusBeforeBuffer)} sub="לא קיבולת השקעה" color={cashSurplusBeforeBuffer >= 0 ? GREEN : RUST} />
        <Metric label="קיבולת השקעה" value="דורשת אישור" sub="כרית ביטחון, התחייבויות ואישור מפורש" color={AMBER} />
        <Metric label="חריגות תקציב" value={String(alerts.length)} sub={alerts.length ? "דורשות בדיקה" : "אין חריגות כרגע"} color={alerts.length ? RUST : GREEN} />
      </div>

      <section className={alerts.length ? "finance-alert-panel" : "finance-ok-panel"}>
        <div>{alerts.length ? <AlertTriangle size={20}/> : <CheckCircle2 size={20}/>}<div><strong>{alerts.length ? "יש חריגות שדורשות תשומת לב" : "התקציב נראה בשליטה"}</strong><span>{alerts.length ? alerts[0].message : "כשתזין הוצאות בפועל, נתריע ב־80% וב־100% מכל קטגוריה."}</span></div></div>
        <button className="finance-alert-action" onClick={onOpenBudget}>{alerts.length ? "עבור לתקציב" : "המשך לעקוב"}<ArrowLeft size={16}/></button>
      </section>

      {finance.state === "empty" && <section className="finance-state"><WalletCards size={26}/><strong>נתחיל מתמונת מצב קצרה</strong><span>הוסף קטגוריית תקציב או התחייבות אחת כדי להפעיל את מרכז הבקרה.</span></section>}

      <section className="finance-radar" aria-label="מרכז התראות">
        <div className="radar-orbit"><span className="radar-core" /><span className="radar-pulse" /></div>
        <div><span className="finance-kicker">מרכז התראות</span><strong>{alerts.length ? `${alerts.length} פריטים דורשים בדיקה` : "אין חריגות פעילות"}</strong><p>{finance.commitments.length ? `${finance.commitments.length} התחייבויות פתוחות משפיעות על הכסף הפנוי.` : "הוסף התחייבויות קרובות כדי להשלים את תמונת התזרים."}</p></div>
      </section>

      <Sec title="שווי נקי — פירוט לפי אפיק" />
      <div style={cardStyle}>
        <Row label="סך הכל" bold><span style={{ fontSize: 17, color: GREEN }}>{ils(netWorth)}</span></Row>
        {ASSET_KEYS.map(({ k, l }, i) => {
          const v = d.assets[k] || 0;
          const pct = netWorth > 0 ? Math.round((v / netWorth) * 100) : 0;
          return (
            <Row key={k} label={l} last={i === ASSET_KEYS.length - 1}>
              <span style={{ fontSize: 13 }}>{ils(v)}<span style={{ color: MUTED, fontSize: 12 }}> · {pct}%</span></span>
            </Row>
          );
        })}
      </div>

      <Sec title="תזרים חודשי" />
      <div style={cardStyle}>
        <Row label="הכנסה (שלי + אשתי)"><span style={{ fontSize: 14, color: GREEN }}>{ils(income)}</span></Row>
        <Row label="תקציב חודשי — סך הקטגוריות"><span style={{ fontSize: 14, color: RUST }}>−{ils(budgetTotal)}</span></Row>
        <Row label={core.frozen ? "החזר משכנתא קיימת (מוקפאת)" : "החזר משכנתא קיימת"}>
          <span style={{ fontSize: 14, color: RUST }}>−{ils(mortgage)}</span>
        </Row>
        <Row last label="עודף תזרימי לפני כרית ביטחון" bold>
          <span style={{ fontSize: 17, color: left >= 0 ? GREEN : RUST }}>{ils(left)}</span>
        </Row>
      </div>
    </div>
  );
}
