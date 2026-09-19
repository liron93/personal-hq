"use client";
import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { GREEN, RUST, AMBER, MUTED, LINE, cardStyle } from "@/lib/theme";
import { ils, toN, uid } from "@/lib/format";
import { cp } from "@/lib/store";

const types = ["בית חדש", "שיפוץ", "משכנתה", "קבועה", "אחר"];

export default function Flow({ d, setD, core }) {
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState({ name: "", amount: "", dueDate: "", kind: "בית חדש" });
  const commitments = d.commitments || [];
  const unpaid = commitments.filter(x => x.status !== "שולם");
  const total = unpaid.reduce((sum, x) => sum + Number(x.amount || 0), 0);
  const income = Number(core.mySalary || 0) + Number(core.wifeSalary || 0) + Number(core.athensMonthly || 0);
  const monthly = d.budget.reduce((sum, x) => sum + Number(x.act || x.est || 0), 0) + (core.frozen ? 0 : Number(core.mortgageMonthly || 0));
  const available = income - monthly - total;
  const ordered = useMemo(() => [...commitments].sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999")), [commitments]);
  const save = () => {
    if (!draft.name.trim() || !Number(draft.amount)) return;
    setD(prev => { const next = cp(prev); next.commitments = [...(next.commitments || []), { ...draft, id: uid(), amount: toN(draft.amount), status: "מתוכנן" }]; return next; });
    setDraft({ name: "", amount: "", dueDate: "", kind: "בית חדש" }); setAddOpen(false);
  };
  const update = (id, patch) => setD(prev => { const next = cp(prev); next.commitments = (next.commitments || []).map(x => x.id === id ? { ...x, ...patch } : x); return next; });
  const remove = id => setD(prev => { const next = cp(prev); next.commitments = (next.commitments || []).filter(x => x.id !== id); return next; });
  return <div>
    <div className="finance-hero">
      <div><span className="finance-kicker">תזרים 30 הימים הקרובים</span><strong style={{ color: available >= 0 ? GREEN : RUST }}>{ils(available)}</strong><p>לאחר הוצאות חודשיות והתחייבויות שהוזנו</p></div>
      <div className="finance-hero-note"><AlertCircle size={18} color={AMBER} />זה חישוב ידני עד לחיבור מאושר למקור נתונים</div>
    </div>
    <section className="finance-summary-grid">
      <div><span>הכנסה חודשית</span><strong>{ils(income)}</strong></div><div><span>הוצאות חודשיות</span><strong>{ils(monthly)}</strong></div><div><span>התחייבויות פתוחות</span><strong style={{ color: total ? RUST : GREEN }}>{ils(total)}</strong></div>
    </section>
    <div className="finance-section-head"><div><h2>התחייבויות קרובות</h2><p>בית, שיפוץ, משכנתה והוצאות שדורשות כיסוי.</p></div><button className="finance-primary" onClick={() => setAddOpen(true)}><Plus size={17}/>הוספת התחייבות</button></div>
    {addOpen && <div className="finance-form-card">
      <input autoFocus placeholder="למשל: מקדמה לנגרות" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}/>
      <input inputMode="decimal" placeholder="סכום בש״ח" value={draft.amount} onChange={e => setDraft({ ...draft, amount: e.target.value })}/>
      <input type="date" value={draft.dueDate} onChange={e => setDraft({ ...draft, dueDate: e.target.value })}/>
      <select value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value })}>{types.map(x => <option key={x}>{x}</option>)}</select>
      <button className="finance-primary" onClick={save}>שמירה</button><button className="finance-secondary" onClick={() => setAddOpen(false)}>ביטול</button>
    </div>}
    <div style={cardStyle} className="finance-list">
      {!ordered.length && <div className="finance-empty">עדיין אין התחייבויות. הוספת הראשונות תיתן תמונת תזרים שימושית.</div>}
      {ordered.map(item => <div className="finance-commitment" key={item.id}>
        <button aria-label={item.status === "שולם" ? "החזרת התחייבות לפתוחה" : "סימון כשולם"} className="finance-check" onClick={() => update(item.id, { status: item.status === "שולם" ? "מתוכנן" : "שולם" })}>{item.status === "שולם" ? <CheckCircle2 size={20}/> : <span/>}</button>
        <div className="finance-commitment-copy"><strong>{item.name}</strong><span>{item.kind}{item.dueDate ? ` · ${new Intl.DateTimeFormat("he-IL", { day:"numeric", month:"short" }).format(new Date(`${item.dueDate}T12:00:00`))}` : " · ללא תאריך"}</span></div>
        <b className={item.status === "שולם" ? "is-paid" : ""}>{ils(item.amount)}</b><button aria-label="מחיקת התחייבות" className="finance-icon" onClick={() => remove(item.id)}><Trash2 size={16}/></button>
      </div>)}
    </div>
  </div>;
}
