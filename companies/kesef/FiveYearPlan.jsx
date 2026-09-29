"use client";
import { useMemo, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { INK, BG, GREEN, AMBER, RUST, MUTED, LINE, cardStyle } from "@/lib/theme";
import { ils, toN } from "@/lib/format";
import { Sec, Row, Metric, LabeledInput, EditableNum } from "@/lib/ui";
import { cp } from "@/lib/store";
import { assetsTotal as kesefAssetsTotal } from "./model";
import {
  ensurePlanState, monthsOf, projectPlan, forecastVsActual, planAlerts, goalsProgress,
  setStartMonth, setIncome, setAllocationPct,
  addRecurring, removeRecurring, addOneOff, removeOneOff, addGoal, removeGoal, recordActual,
  DEVIATION_THRESHOLD_PERCENT, INSUFFICIENT_DATA,
} from "./five-year-plan-model";

// recharts מסתדר LTR — עוטפים כדי שלא יתהפך בתוך העמוד ה-RTL (בדיוק כמו History.jsx).
const mLabel = m => { const [y, mo] = m.split("-"); return `${mo}/${y.slice(2)}`; };
const ACCENT_COLOR = "#1B3A5C";
const INSUFFICIENT_DATA_NOTE = `${INSUFFICIENT_DATA} לחודש הזה — הטבלה למעלה מציגה תכנון בלבד עד שיוזן דיווח.`;

const KIND_LABEL = { income: "הכנסה", expense: "הוצאה" };
const GOAL_STATUS = {
  ahead: { label: "לפני הקצב", color: GREEN },
  on_track: { label: "בקצב", color: GREEN },
  behind: { label: "מאחור", color: RUST },
  out_of_range: { label: "מחוץ לטווח התכנון", color: MUTED },
};

function AddRow({ fields, onAdd, submitLabel }) {
  const [open, setOpen] = useState(false);
  const empty = Object.fromEntries(fields.map(f => [f.key, f.def ?? ""]));
  const [draft, setDraft] = useState(empty);
  if (!open) return <button className="finance-secondary" onClick={() => setOpen(true)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}><Plus size={15} />{submitLabel}</button>;
  // ה-CSS הקיים (.finance-form-card, app/finance-control-room.css) כבר עובר ל-2 עמודות (minmax(0,1fr))
  // מתחת ל-700px, כולל gutter וגלישה תקינה של שדות נוספים לשורה הבאה — לא מגדירים כאן grid משלנו.
  return (
    <div className="finance-form-card">
      {fields.map(f => f.type === "select" ? (
        <select key={f.key} value={draft[f.key]} onChange={e => setDraft({ ...draft, [f.key]: e.target.value })}>
          {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input key={f.key} type={f.type || "text"} inputMode={f.type === "number" ? "decimal" : undefined} placeholder={f.placeholder}
          value={draft[f.key]} onChange={e => setDraft({ ...draft, [f.key]: e.target.value })} />
      ))}
      <button className="finance-primary" onClick={() => { onAdd(draft); setDraft(empty); setOpen(false); }}>הוספה</button>
      <button className="finance-secondary" onClick={() => { setDraft(empty); setOpen(false); }}>ביטול</button>
    </div>
  );
}

export default function FiveYearPlan({ planData, setPlanData, d, core }) {
  const state = ensurePlanState(planData);
  const [monthCursor, setMonthCursor] = useState(state.startMonth);
  const [actualDraft, setActualDraft] = useState({ income: "", expenses: "", invested: "" });
  const [includeMortgage, setIncludeMortgage] = useState(true);

  const mortgageMonthly = includeMortgage && !core?.frozen ? Number(core?.mortgageMonthly || 0) : 0;
  const seedAssetsTotal = kesefAssetsTotal(d?.assets);

  const months = useMemo(() => monthsOf(state.startMonth, state.horizonMonths), [state.startMonth, state.horizonMonths]);
  const rows = useMemo(() => projectPlan(state, { mortgageMonthly, seedAssetsTotal }), [state, mortgageMonthly, seedAssetsTotal]);
  const statuses = useMemo(() => forecastVsActual(state, rows), [state, rows]);
  const alerts = useMemo(() => planAlerts(state, rows), [state, rows]);
  const goals = useMemo(() => goalsProgress(state, rows), [state, rows]);

  const update = fn => setPlanData(prev => fn(cp(ensurePlanState(prev))));

  const chartRows = rows.map(r => ({ month: mLabel(r.month), invested: r.cumulativeInvested, assets: r.projectedAssets }));
  const last = rows[rows.length - 1];
  const first = rows[0];
  const statusByMonth = useMemo(() => Object.fromEntries(statuses.map(s => [s.month, s])), [statuses]);
  const actualForCursor = (state.actuals || []).find(a => a.month === monthCursor) || null;

  const saveActual = () => {
    const entry = { month: monthCursor, income: toN(actualDraft.income), expenses: toN(actualDraft.expenses), invested: toN(actualDraft.invested) };
    update(s => recordActual(s, entry));
    setActualDraft({ income: "", expenses: "", invested: "" });
  };

  return (
    <div>
      <div className="finance-page-intro">
        <div><span className="finance-kicker">תכנון פיננסי</span><h2>60 חודשים קדימה</h2><p>תחזית מהנחות שהוזנו ידנית בלבד — בלי חיבור בנק, בלי מסחר אוטומטי, בלי נתוני שוק חיים.</p></div>
      </div>

      {/* ---------- הגדרות בסיס ---------- */}
      <Sec title="נקודת פתיחה" />
      <div style={cardStyle}>
        <Row label="חודש התחלה">
          <input type="month" className="hq-field" defaultValue={state.startMonth} onBlur={e => e.target.value && update(s => setStartMonth(s, e.target.value))} style={{ direction: "ltr", padding: "4px 6px", fontFamily: "inherit" }} />
        </Row>
        <Row label="טווח תכנון"><span style={{ fontSize: 14 }}>{state.horizonMonths} חודשים</span></Row>
        <Row label="הכנסה חודשית — שלי"><EditableNum value={state.income.mine} onChange={v => update(s => setIncome(s, "mine", v))} /></Row>
        <Row label="הכנסה חודשית — בן/בת זוג"><EditableNum value={state.income.spouse} onChange={v => update(s => setIncome(s, "spouse", v))} /></Row>
        <Row label="הכנסה חודשית — אחר"><EditableNum value={state.income.other} onChange={v => update(s => setIncome(s, "other", v))} /></Row>
        <Row label="אחוז הקצאה להשקעה מהמזומן הפנוי"><EditableNum value={state.allocationPct} onChange={v => update(s => setAllocationPct(s, v))} /></Row>
        <Row last label="כולל החזר משכנתא מנתוני הליבה">
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={includeMortgage} onChange={e => setIncludeMortgage(e.target.checked)} />
            {core?.frozen ? "משכנתא מוקפאת כרגע" : ils(core?.mortgageMonthly || 0) + " לחודש"}
          </label>
        </Row>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <Metric label="מזומן פנוי החודש" value={ils(first?.freeCash || 0)} color={first?.freeCash >= 0 ? GREEN : RUST} />
        <Metric label="מושקע החודש" value={ils(first?.investedThisMonth || 0)} />
        <Metric label={`סה״כ הושקע עד סוף התכנון (${months[months.length - 1] ? mLabel(months[months.length - 1]) : ""})`} value={ils(last?.cumulativeInvested || 0)} />
        <Metric label="שווי נכסים מתוכנן בסוף התכנון" value={ils(last?.projectedAssets || 0)} color={GREEN} />
      </div>

      {/* ---------- הכנסות/הוצאות חוזרות ---------- */}
      <div className="finance-section-head"><div><h2>הכנסות והוצאות חוזרות</h2><p>פעילות מהחודש שהוגדר ועד endMonth (או עד סוף התכנון אם לא הוגדר).</p></div></div>
      <div style={cardStyle} className="finance-list">
        {(state.recurring || []).length === 0 && <div className="finance-empty">אין עדיין הכנסות/הוצאות חוזרות מעבר להכנסה הבסיסית.</div>}
        {(state.recurring || []).map(r => (
          <div className="finance-commitment" key={r.id}>
            <div className="finance-commitment-copy"><strong>{r.label}</strong><span>{KIND_LABEL[r.kind]} · מ-{mLabel(r.startMonth)}{r.endMonth ? ` עד ${mLabel(r.endMonth)}` : " ועד סוף התכנון"}</span></div>
            <b style={{ color: r.kind === "income" ? GREEN : RUST }}>{r.kind === "income" ? "+" : "-"}{ils(r.amount)}</b>
            <button aria-label="מחיקה" className="finance-icon" onClick={() => update(s => removeRecurring(s, r.id))}><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
      <AddRow submitLabel="הוספת הכנסה/הוצאה חוזרת"
        fields={[
          { key: "label", placeholder: "תיאור" },
          { key: "amount", type: "number", placeholder: "סכום חודשי" },
          { key: "kind", type: "select", def: "expense", options: [{ value: "expense", label: "הוצאה" }, { value: "income", label: "הכנסה" }] },
          { key: "startMonth", type: "month", def: state.startMonth },
          { key: "endMonth", type: "month", placeholder: "עד (אופציונלי)" },
        ]}
        onAdd={v => update(s => addRecurring(s, { label: v.label, amount: toN(v.amount), kind: v.kind, startMonth: v.startMonth || state.startMonth, endMonth: v.endMonth || null }))}
      />

      {/* ---------- חד-פעמי ---------- */}
      <div className="finance-section-head"><div><h2>הכנסות והוצאות חד-פעמיות</h2><p>סכום אחד בחודש ספציפי — בונוס, תיקון גדול וכד'.</p></div></div>
      <div style={cardStyle} className="finance-list">
        {(state.oneOff || []).length === 0 && <div className="finance-empty">אין עדיין פריטים חד-פעמיים.</div>}
        {(state.oneOff || []).map(o => (
          <div className="finance-commitment" key={o.id}>
            <div className="finance-commitment-copy"><strong>{o.label}</strong><span>{KIND_LABEL[o.kind]} · {mLabel(o.month)}</span></div>
            <b style={{ color: o.kind === "income" ? GREEN : RUST }}>{o.kind === "income" ? "+" : "-"}{ils(o.amount)}</b>
            <button aria-label="מחיקה" className="finance-icon" onClick={() => update(s => removeOneOff(s, o.id))}><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
      <AddRow submitLabel="הוספת פריט חד-פעמי"
        fields={[
          { key: "label", placeholder: "תיאור" },
          { key: "amount", type: "number", placeholder: "סכום" },
          { key: "kind", type: "select", def: "expense", options: [{ value: "expense", label: "הוצאה" }, { value: "income", label: "הכנסה" }] },
          { key: "month", type: "month", def: state.startMonth },
        ]}
        onAdd={v => update(s => addOneOff(s, { label: v.label, amount: toN(v.amount), kind: v.kind, month: v.month || state.startMonth }))}
      />

      {/* ---------- גרף + טבלה ---------- */}
      <Sec title="מסלול מצטבר — הושקע מול שווי נכסים מתוכנן" />
      <div style={{ ...cardStyle, padding: "14px 8px 6px", direction: "ltr" }}>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartRows} margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
            <CartesianGrid stroke={LINE} vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={{ stroke: LINE }} interval={5} />
            <YAxis tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} width={52} tickFormatter={v => (v === 0 ? "₪0" : "₪" + Math.round(v / 1000) + "k")} />
            <Tooltip formatter={(value, name) => [ils(value), name === "assets" ? "שווי נכסים מתוכנן" : "הושקע מצטבר"]} labelStyle={{ color: INK }} contentStyle={{ fontSize: 12, borderRadius: 4, border: `1px solid ${LINE}`, direction: "rtl" }} />
            <Area type="monotone" dataKey="assets" stroke={GREEN} fill={GREEN} fillOpacity={0.18} />
            <Area type="monotone" dataKey="invested" stroke={ACCENT_COLOR} fill={ACCENT_COLOR} fillOpacity={0.35} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <Sec title="טבלה חודשית" />
      <div style={{ ...cardStyle, padding: 0, overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 640, fontSize: 12 }}>
          <thead>
            <tr style={{ background: BG }}>
              {["חודש", "הכנסה", "הוצאה", "מזומן פנוי", "הושקע", "מצטבר", "שווי מתוכנן", "ביצוע"].map(h => (
                <th key={h} style={{ padding: "8px 10px", textAlign: "right", color: MUTED, fontWeight: 500, whiteSpace: "nowrap", borderBottom: `1px solid ${LINE}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const st = statusByMonth[r.month];
              return (
                <tr key={r.month} style={{ borderBottom: `1px solid ${LINE}` }}>
                  <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>{mLabel(r.month)}</td>
                  <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>{ils(r.income)}</td>
                  <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>{ils(r.expenses)}</td>
                  <td style={{ padding: "7px 10px", whiteSpace: "nowrap", color: r.freeCash >= 0 ? GREEN : RUST }}>{ils(r.freeCash)}</td>
                  <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>{ils(r.investedThisMonth)}</td>
                  <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>{ils(r.cumulativeInvested)}</td>
                  <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>{ils(r.projectedAssets)}</td>
                  <td style={{ padding: "7px 10px", whiteSpace: "nowrap", color: MUTED }}>{st?.hasActuals ? (st.deviations.length ? <span style={{ color: AMBER }}>סטייה</span> : <span style={{ color: GREEN }}>תואם</span>) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---------- הזנת ביצוע בפועל ---------- */}
      <Sec title="דיווח ביצוע בפועל" />
      <div style={cardStyle}>
        {/* flex-wrap + min-width:0, כמו Metric ב-lib/ui.jsx — לא grid חדש, כדי שיתנהג נכון גם ב-375px */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <div style={{ flex: "1 1 120px", minWidth: 0 }}>
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 3 }}>חודש</div>
            <select className="hq-field" value={monthCursor} onChange={e => { setMonthCursor(e.target.value); setActualDraft({ income: "", expenses: "", invested: "" }); }} style={{ width: "100%", padding: "7px 4px", fontFamily: "inherit" }}>
              {months.map(m => <option key={m} value={m}>{mLabel(m)}</option>)}
            </select>
          </div>
          <div style={{ flex: "1 1 120px", minWidth: 0 }}><LabeledInput label="הכנסה בפועל" value={actualDraft.income || actualForCursor?.income || 0} onBlur={v => setActualDraft({ ...actualDraft, income: v })} /></div>
          <div style={{ flex: "1 1 120px", minWidth: 0 }}><LabeledInput label="הוצאה בפועל" value={actualDraft.expenses || actualForCursor?.expenses || 0} onBlur={v => setActualDraft({ ...actualDraft, expenses: v })} /></div>
          <div style={{ flex: "1 1 120px", minWidth: 0 }}><LabeledInput label="הושקע בפועל" value={actualDraft.invested || actualForCursor?.invested || 0} onBlur={v => setActualDraft({ ...actualDraft, invested: v })} /></div>
        </div>
        <button className="finance-primary" style={{ marginTop: 10 }} onClick={saveActual}>{actualForCursor ? "עדכון ביצוע לחודש" : "שמירת ביצוע לחודש"}</button>
        {!actualForCursor && <div style={{ marginTop: 8, fontSize: 12, color: MUTED }}>{INSUFFICIENT_DATA_NOTE}</div>}
      </div>

      {/* ---------- התראות ---------- */}
      <Sec title={`התראות חריגה (סף ${DEVIATION_THRESHOLD_PERCENT}%)`} />
      {alerts.length === 0 ? (
        <div className="finance-ok-panel"><div><CheckCircle2 size={18} color={GREEN} /><div><strong>אין חריגות מעל הסף</strong><span>כל החודשים שדווח עבורם ביצוע תואמים לתכנון, בטווח הסביר.</span></div></div></div>
      ) : (
        <div style={cardStyle} className="finance-list">
          {alerts.map(a => (
            <div className="finance-commitment" key={a.id}>
              <AlertTriangle size={16} color={a.level === "critical" ? RUST : AMBER} />
              <div className="finance-commitment-copy"><span>{a.message}</span></div>
            </div>
          ))}
        </div>
      )}

      {/* ---------- יעדים ---------- */}
      <div className="finance-section-head"><div><h2>יעדים</h2><p>התקדמות המסלול המתוכנן (מצטבר + שווי נכסים קיים) מול יעד וחודש מטרה.</p></div></div>
      <div style={cardStyle} className="finance-list">
        {goals.length === 0 && <div className="finance-empty">אין עדיין יעדים מוגדרים.</div>}
        {goals.map(g => {
          const cfg = GOAL_STATUS[g.status];
          return (
            <div className="finance-commitment" key={g.id}>
              <div className="finance-commitment-copy">
                <strong>{g.label}</strong>
                <span>{g.message}</span>
              </div>
              <b style={{ color: cfg.color, whiteSpace: "nowrap" }}>{cfg.label}</b>
              <button aria-label="מחיקת יעד" className="finance-icon" onClick={() => update(s => removeGoal(s, g.id))}><Trash2 size={16} /></button>
            </div>
          );
        })}
      </div>
      <AddRow submitLabel="הוספת יעד"
        fields={[
          { key: "label", placeholder: "תיאור היעד" },
          { key: "targetAmount", type: "number", placeholder: "סכום יעד" },
          { key: "targetMonth", type: "month", def: months[months.length - 1] || state.startMonth },
        ]}
        onAdd={v => update(s => addGoal(s, { label: v.label, targetAmount: toN(v.targetAmount), targetMonth: v.targetMonth }))}
      />
    </div>
  );
}
