"use client";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { addWeighIn, removeWeighIn, addSteps, removeSteps, cleanKg, cleanSteps, goalTarget, movingAverage, forecast, weekSummary, MIN_POINTS, MIN_SPAN_DAYS, WINDOW_DAYS } from "../goals.mjs";
import { addDaysISO } from "../today.mjs";
import css from "./health-v2.module.css";

const shortDate = iso => new Date(iso + "T12:00").toLocaleDateString("he-IL", { day: "numeric", month: "short" });
const longDate = iso => new Date(iso + "T12:00").toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" });
const kg = n => (n === null || n === undefined ? "—" : `${n} ק״ג`);

function forecastText(f) {
  switch (f.status) {
    case "no-target": return { title: "אין עדיין משקל יעד", body: "קבעו משקל יעד כדי לראות תחזית." };
    case "insufficient":
      if (f.reason === "stale") return { title: "אין תחזית כרגע", body: `השקילה האחרונה ישנה (${shortDate(f.lastDate)}). שקילה חדשה תעדכן את המגמה.` };
      if (f.reason === "span") return { title: "אין עדיין מספיק נתונים לתחזית", body: `יש ${f.have.points} שקילות, אבל הן פרושות על ${f.have.spanDays} ימים בלבד. צריך לפחות ${MIN_SPAN_DAYS} ימים.` };
      return { title: "אין עדיין מספיק נתונים לתחזית", body: `צריך לפחות ${MIN_POINTS} שקילות ב-${WINDOW_DAYS / 7} השבועות האחרונים, פרושות על ${MIN_SPAN_DAYS} ימים לפחות. יש כרגע ${f.have.points}.` };
    case "reached": return { title: "קרוב מאוד ליעד", body: "לפי המגמה, המשקל כבר קרוב למשקל היעד." };
    case "stable": return { title: "אין תחזית לתאריך", body: "המשקל יציב בשבועות האחרונים, ולכן אי אפשר להעריך מתי יגיעו ליעד." };
    case "away": return { title: "אין תחזית לתאריך", body: "המגמה בשבועות האחרונים היא בכיוון ההפוך מהיעד. תחזית תופיע כשהמגמה תשתנה." };
    case "too-far": return { title: "אין תחזית לתאריך", body: "בקצב הנוכחי היעד רחוק מעבר לשנתיים, ולכן לא מוצגת תחזית." };
    default: return f.openEnded
      ? { title: `החל מ-${longDate(f.from)}`, body: "הקצב משתנה מאוד בין שקילות, ולכן אין גבול עליון ברור לטווח." }
      : { title: `בין ${shortDate(f.from)} ל-${longDate(f.to)}`, body: "טווח משוער לפי המגמה של השבועות האחרונים." };
  }
}

function WeightChart({ series }) {
  if (series.length < 2) return null;
  const W = 300, H = 110, P = 8;
  const xs = series.map(p => new Date(p.date + "T12:00").getTime());
  const ys = series.flatMap(p => [p.kg, p.avg]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys) - 0.5, y1 = Math.max(...ys) + 0.5;
  const X = t => P + ((t - x0) / Math.max(1, x1 - x0)) * (W - 2 * P), Y = v => H - P - ((v - y0) / Math.max(0.1, y1 - y0)) * (H - 2 * P);
  const path = series.map((p, i) => `${i ? "L" : "M"}${X(xs[i]).toFixed(1)},${Y(p.avg).toFixed(1)}`).join(" ");
  return <div className={css.chartWrap}>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`גרף משקל: ${series.length} שקילות, ממוצע נע של 7 ימים`} className={css.chart}>
      {series.map((p, i) => <circle key={p.date} cx={X(xs[i])} cy={Y(p.kg)} r="3" className={css.chartDot} />)}
      <path d={path} className={css.chartLine} fill="none" />
    </svg>
    <div className={css.chartAxis}><span>{shortDate(series[0].date)}</span><span>נקודות: שקילות · קו: ממוצע נע 7 ימים</span><span>{shortDate(series[series.length - 1].date)}</span></div>
  </div>;
}

export default function GoalsView({ d, setD, today, uid }) {
  const [offset, setOffset] = useState(0);
  const [weight, setWeight] = useState(""), [wDate, setWDate] = useState(today), [wErr, setWErr] = useState("");
  const [target, setTarget] = useState(""), [tErr, setTErr] = useState(""), [editTarget, setEditTarget] = useState(false);
  const [steps, setSteps] = useState(""), [sDate, setSDate] = useState(today), [sErr, setSErr] = useState("");

  const weighIns = d.weighIns || [];
  const tgt = goalTarget(d);
  const fc = useMemo(() => forecast(weighIns, tgt, today), [weighIns, tgt, today]);
  const series = useMemo(() => movingAverage(weighIns, 7).slice(-30), [weighIns]);
  const anchor = addDaysISO(today, offset * 7);
  const wk = weekSummary(d, anchor);
  const fText = forecastText(fc);
  const goalFromBaseline = !d.goal?.targetKg && tgt !== null;

  const saveWeight = e => {
    e.preventDefault();
    if (cleanKg(weight) === null) { setWErr("הזינו משקל בין 20 ל-400 ק״ג."); return; }
    if (!wDate || wDate > today) { setWErr("אפשר לתעד שקילה רק עד היום."); return; }
    setD(p => ({ ...p, weighIns: addWeighIn(p.weighIns, { date: wDate, kg: weight, id: uid(), now: new Date().toISOString() }) }));
    setWeight(""); setWErr("");
  };
  const saveTarget = e => {
    e.preventDefault();
    const v = cleanKg(target);
    if (v === null) { setTErr("הזינו משקל יעד בין 20 ל-400 ק״ג."); return; }
    setD(p => ({ ...p, goal: { ...(p.goal || {}), targetKg: v } })); setTErr(""); setEditTarget(false); setTarget("");
  };
  const saveSteps = e => {
    e.preventDefault();
    if (cleanSteps(steps) === null) { setSErr("הזינו מספר צעדים תקין."); return; }
    if (!sDate || sDate > today) { setSErr("אפשר לתעד צעדים רק עד היום."); return; }
    setD(p => ({ ...p, steps: addSteps(p.steps, { date: sDate, count: steps, id: uid() }) }));
    setSteps(""); setSErr("");
  };
  const weekSteps = (d.steps || []).filter(s => s.date >= wk.start && s.date <= wk.end);
  const recent = [...weighIns].reverse().slice(0, 5);

  return <div className={css.stack}>
    <div className={css.sectionHead}><h2>התקדמות ויעדים</h2></div>

    <section className={css.card + " " + css.stack}>
      <div className={css.weekNav}>
        <button className={css.iconButton} aria-label="השבוע הקודם" onClick={() => setOffset(o => o - 1)}><ChevronRight size={18} /></button>
        <div><strong>{offset === 0 ? "השבוע" : `${shortDate(wk.start)} – ${shortDate(wk.end)}`}</strong>{offset === 0 && <small className={css.dim}>{shortDate(wk.start)} – {shortDate(wk.end)}</small>}</div>
        <button className={css.iconButton} aria-label="השבוע הבא" disabled={offset >= 0} onClick={() => setOffset(o => Math.min(0, o + 1))}><ChevronLeft size={18} /></button>
      </div>
      <div className={css.weekRows}>
        <div><span>אימונים</span><strong>{wk.workouts}{wk.workoutGoal ? ` מתוך ${wk.workoutGoal}` : ""}</strong></div>
        <div><span>צעדים (ממוצע ליום מתועד)</span><strong>{wk.stepsAvg === null ? "אין נתונים" : wk.stepsAvg.toLocaleString("he-IL")}{wk.stepsAvg !== null && wk.stepGoal ? ` · יעד ${wk.stepGoal.toLocaleString("he-IL")}` : ""}</strong></div>
        <div><span>ימי תיעוד אוכל</span><strong>{wk.foodDays}{wk.foodGoal ? ` מתוך ${wk.foodGoal}` : ""}</strong></div>
        <div><span>משקל (ממוצע השבוע)</span><strong>{wk.weightAvg === null ? "אין שקילה" : kg(wk.weightAvg)}{wk.weightChange !== null ? ` · ${wk.weightChange > 0 ? "+" : ""}${wk.weightChange} מול שבוע קודם` : ""}</strong></div>
      </div>
      {weekSteps.length > 0 && <div className={css.chips}>{weekSteps.map(s => <span key={s.id} className={css.chip}>{shortDate(s.date)}: {s.count.toLocaleString("he-IL")}<button aria-label={`מחיקת צעדים ${shortDate(s.date)}`} onClick={() => setD(p => ({ ...p, steps: removeSteps(p.steps, s.id) }))}>×</button></span>)}</div>}
      <form className={css.inlineForm} onSubmit={saveSteps}>
        <label>תיעוד צעדים ליום<input className={css.field} inputMode="numeric" value={steps} onChange={e => { setSteps(e.target.value); setSErr(""); }} placeholder="למשל 7500" /></label>
        <label>תאריך<input className={css.field} dir="ltr" type="date" max={today} value={sDate} onChange={e => setSDate(e.target.value)} /></label>
        <button className={css.secondary}>שמירה</button>
      </form>
      {sErr && <p className={css.validation} role="alert">{sErr}</p>}
    </section>

    <section className={css.card + " " + css.stack}>
      <div className={css.sessionHead}><h3>משקל ויעד</h3>{tgt !== null && !editTarget && <button className={css.linkButton} onClick={() => { setTarget(String(tgt)); setEditTarget(true); }}>עדכון יעד</button>}</div>
      {tgt !== null && !editTarget ? <p className={css.subtle}>משקל יעד: <strong>{kg(tgt)}</strong>{goalFromBaseline ? " (נלקח מנקודת הפתיחה)" : ""}</p>
        : <form className={css.inlineForm} onSubmit={saveTarget}><label>משקל יעד (ק״ג)<input className={css.field} inputMode="decimal" value={target} onChange={e => { setTarget(e.target.value); setTErr(""); }} placeholder="למשל 75" /></label><button className={css.secondary}>שמירת יעד</button></form>}
      {tErr && <p className={css.validation} role="alert">{tErr}</p>}
      <form className={css.inlineForm} onSubmit={saveWeight}>
        <label>שקילה (ק״ג)<input className={css.field} inputMode="decimal" value={weight} onChange={e => { setWeight(e.target.value); setWErr(""); }} placeholder="למשל 82.4" /></label>
        <label>תאריך<input className={css.field} dir="ltr" type="date" max={today} value={wDate} onChange={e => setWDate(e.target.value)} /></label>
        <button className={css.primary}>שמירת שקילה</button>
      </form>
      {wErr && <p className={css.validation} role="alert">{wErr}</p>}
      <WeightChart series={series} />
      {recent.length > 0 && <div>{recent.map(w => <div className={css.weighRow} key={w.id}><span>{longDate(w.date)}</span><strong>{kg(w.kg)}</strong><button className={css.iconButton} aria-label={`מחיקת שקילה ${shortDate(w.date)}`} onClick={() => setD(p => ({ ...p, weighIns: removeWeighIn(p.weighIns, w.id) }))}><Trash2 size={16} /></button></div>)}</div>}
      {weighIns.length === 0 && <p className={css.subtle}>עוד אין שקילות. שקילה אחת בכמה ימים מספיקה כדי לבנות מגמה.</p>}
    </section>

    <section className={css.card + " " + css.stack}>
      <p className={css.eyebrow}>תחזית להגעה ליעד</p>
      <h3 className={css.forecastTitle}>{fText.title}</h3>
      <p className={css.subtle}>{fText.body}</p>
      {(fc.status === "range" || fc.status === "stable" || fc.status === "away" || fc.status === "reached") && <p className={css.subtle}>קצב מגמה: {fc.slopePerWeek > 0 ? "+" : ""}{fc.slopePerWeek} ק״ג בשבוע · משקל מוערך: {kg(fc.current)}</p>}
      <p className={css.disclaimer}>הערכה מידע בלבד, מבוססת רק על השקילות שהזנתם. אינה ייעוץ רפואי ואינה הבטחה.</p>
    </section>
  </div>;
}
