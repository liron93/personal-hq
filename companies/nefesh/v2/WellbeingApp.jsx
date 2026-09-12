"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronLeft, CircleHelp, HeartHandshake, ListChecks, MoreHorizontal, Pencil, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { INIT, STORE_KEY, localISO, normalize, uid, weekKey } from "../model";
import css from "./wellbeing-v2.module.css";

const TABS = [
  ["today", "היום", Check],
  ["focus", "מיקוד", ListChecks],
  ["support", "תמיכה", HeartHandshake],
  ["week", "השבוע", MoreHorizontal],
  ["privacy", "פרטיות", ShieldCheck],
];

function IconButton({ label, children, ...props }) {
  return <button className={css.iconButton} aria-label={label} {...props}>{children}</button>;
}

function Header({ tab, setTab }) {
  return <header className={css.header}>
    <div>
      <Link href="/" className={css.back}><ChevronLeft size={16} /> חזרה למנכ״ל</Link>
      <p className={css.eyebrow}>המרחב האישי שלך</p>
      <h1>רווחה נפשית</h1>
    </div>
    <nav className={css.desktopNav} aria-label="ניווט חברת רווחה נפשית">
      {TABS.map(([id, label, Icon]) => <button key={id} className={tab === id ? css.active : ""} onClick={() => setTab(id)}><Icon size={18} />{label}</button>)}
    </nav>
  </header>;
}

function Today({ data, setData, setTab }) {
  const date = localISO();
  const current = data.today.date === date ? data.today : { date, step: "", status: "open", feeling: "" };
  const [draft, setDraft] = useState(current.step);
  const persist = patch => setData(previous => {
    const next = normalize(previous);
    const entry = { ...current, ...patch, id: current.id || uid(), updatedAt: new Date().toISOString() };
    return { ...next, today: entry, history: [entry, ...next.history.filter(item => item.date !== date)] };
  });
  return <div className={css.stack}>
    <section className={css.hero}>
      <p className={css.eyebrow}>היום · {new Date().toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })}</p>
      <h2>מה יעשה את היום הזה קצת יותר אפשרי?</h2>
      <p>לא צריך לפתור הכול. מספיק לבחור דבר אחד קטן.</p>
    </section>
    <section className={css.card}>
      <label className={css.label}>הצעד שלי להיום
        <textarea className={css.field} value={draft} onChange={event => setDraft(event.target.value)} placeholder="למשל: לדבר עם מישהו, לצאת לעשר דקות, או להסדיר דבר אחד" />
      </label>
      <div className={css.actions}>
        <button className={css.primary} onClick={() => persist({ step: draft.trim() })}>שמירת הצעד</button>
        <button className={css.quiet} onClick={() => { setDraft(""); persist({ step: "", status: "skip" }); }}>לא היום</button>
      </div>
      <div className={css.statusRow} aria-label="מצב הצעד">
        {[["open", "נשאר פתוח"], ["done", "בוצע"], ["skip", "לא היום"]].map(([id, label]) => <button key={id} onClick={() => persist({ step: draft.trim(), status: id })} className={current.status === id ? css.statusActive : ""}>{label}</button>)}
      </div>
    </section>
    <section className={css.card}>
      <div className={css.sectionHead}><div><h2 className={css.sectionTitle}>מהתמונה הגדולה</h2><p className={css.subtle}>התוכנית השבועית נותנת כיוון בלי להפוך לעוד רשימת משימות.</p></div><button className={css.textButton} onClick={() => setTab("focus")}>למיקוד</button></div>
      <div className={css.miniPlan}><span>לקדם</span><strong>{data.weekly.focus || "עוד לא נבחר"}</strong><span>לדחות</span><strong>{data.weekly.defer || "עוד לא נבחר"}</strong></div>
    </section>
  </div>;
}

function Focus({ data, setData }) {
  const weekly = data.weekly.weekOf === weekKey() ? data.weekly : { ...data.weekly, weekOf: weekKey(), focus: "", defer: "", ask: "", reviewNote: "" };
  const [plan, setPlan] = useState(weekly);
  const [decision, setDecision] = useState({ title: "", company: "כללי", next: "" });
  const [conversation, setConversation] = useState({ person: "", goal: "", ask: "" });
  const savePlan = () => setData(previous => ({ ...normalize(previous), weekly: { ...plan, weekOf: weekKey() } }));
  const addDecision = event => {
    event.preventDefault();
    if (!decision.title.trim()) return;
    setData(previous => ({ ...normalize(previous), decisions: [{ ...decision, id: uid(), title: decision.title.trim(), status: "open", createdAt: new Date().toISOString() }, ...normalize(previous).decisions] }));
    setDecision({ title: "", company: "כללי", next: "" });
  };
  const closeDecision = id => setData(previous => ({ ...normalize(previous), decisions: normalize(previous).decisions.map(item => item.id === id ? { ...item, status: item.status === "open" ? "closed" : "open" } : item) }));
  const addConversation = event => {
    event.preventDefault();
    if (!conversation.person.trim() && !conversation.goal.trim()) return;
    setData(previous => ({ ...normalize(previous), conversations: [{ ...conversation, id: uid(), person: conversation.person.trim(), goal: conversation.goal.trim(), status: "open" }, ...normalize(previous).conversations] }));
    setConversation({ person: "", goal: "", ask: "" });
  };
  return <div className={css.stack}>
    <section className={css.heroSmall}><p className={css.eyebrow}>חדר הבקרה שלך</p><h2>מיקוד לשבוע</h2><p>שלוש החלטות טובות מונעות עשר משימות לא נחוצות.</p></section>
    <section className={css.card + " " + css.stack}>
      <label className={css.label}>דבר אחד שמקדם אותי השבוע<textarea className={css.field} value={plan.focus} onChange={event => setPlan({ ...plan, focus: event.target.value })} placeholder="הדבר החשוב ביותר, לא כל מה שחשוב" /></label>
      <label className={css.label}>מה אני מחליט לדחות?<textarea className={css.field} value={plan.defer} onChange={event => setPlan({ ...plan, defer: event.target.value })} placeholder="משהו שלא חייב לקבל ממני אנרגיה עכשיו" /></label>
      <label className={css.label}>ממי או איך לבקש עזרה?<textarea className={css.field} value={plan.ask} onChange={event => setPlan({ ...plan, ask: event.target.value })} placeholder="בקשה אחת ברורה שתקדם אותי" /></label>
      <button className={css.primary} onClick={savePlan}>שמירת המיקוד</button>
    </section>
    <section className={css.card}>
      <h2 className={css.sectionTitle}>החלטות שצריך לסגור</h2>
      <p className={css.subtle}>כאן נכנסות החלטות, לא כל המשימות. לכל החלטה מצמידים צעד הבא.</p>
      <form className={css.compactForm} onSubmit={addDecision}>
        <input className={css.field} value={decision.title} onChange={event => setDecision({ ...decision, title: event.target.value })} placeholder="למשל: מה עושים עם הצעת המחיר?" />
        <div className={css.formRow}><select className={css.field} value={decision.company} onChange={event => setDecision({ ...decision, company: event.target.value })}><option>כללי</option><option>בית חדש</option><option>כספים</option><option>קריירה</option><option>בריאות</option></select><input className={css.field} value={decision.next} onChange={event => setDecision({ ...decision, next: event.target.value })} placeholder="הצעד הבא" /></div>
        <button className={css.secondary} type="submit"><Plus size={17} />הוספת החלטה</button>
      </form>
      <div className={css.list}>{!data.decisions.length ? <p className={css.empty}>אין החלטות פתוחות כרגע.</p> : data.decisions.map(item => <article className={css.decision} key={item.id}><button className={item.status === "closed" ? css.checkDone : css.check} onClick={() => closeDecision(item.id)} aria-label="שינוי מצב ההחלטה">{item.status === "closed" && <Check size={14} />}</button><div><strong>{item.title}</strong><span>{item.company}{item.next ? " · " + item.next : ""}</span></div></article>)}</div>
    </section>
    <section className={css.card}>
      <h2 className={css.sectionTitle}>הכנה לשיחה חשובה</h2>
      <p className={css.subtle}>כדי להגיע רגוע יותר וברור יותר — בלי לשלוח דבר מכאן.</p>
      <form className={css.compactForm} onSubmit={addConversation}>
        <input className={css.field} value={conversation.person} onChange={event => setConversation({ ...conversation, person: event.target.value })} placeholder="עם מי השיחה?" />
        <input className={css.field} value={conversation.goal} onChange={event => setConversation({ ...conversation, goal: event.target.value })} placeholder="מה חשוב שיקרה בשיחה?" />
        <input className={css.field} value={conversation.ask} onChange={event => setConversation({ ...conversation, ask: event.target.value })} placeholder="מה אני מבקש, אם יש בקשה?" />
        <button className={css.secondary} type="submit"><Plus size={17} />שמירת הכנה</button>
      </form>
      <div className={css.list}>{!data.conversations.length ? <p className={css.empty}>אין שיחות מוכנות כרגע.</p> : data.conversations.map(item => <article className={css.conversation} key={item.id}><strong>{item.person || "שיחה ללא שם"}</strong><span>{item.goal || "מטרה לא הוגדרה"}{item.ask ? " · בקשה: " + item.ask : ""}</span></article>)}</div>
    </section>
  </div>;
}

function Support({ data, setData }) {
  const [form, setForm] = useState(null);
  const [draft, setDraft] = useState({ name: "", role: "", method: "" });
  const open = item => { setDraft(item || { name: "", role: "", method: "" }); setForm(item?.id || "new"); };
  const save = event => {
    event.preventDefault();
    if (!draft.name.trim()) return;
    setData(previous => {
      const next = normalize(previous);
      const person = { ...draft, name: draft.name.trim(), id: form === "new" ? uid() : form };
      const exists = next.supports.some(item => item.id === person.id);
      return { ...next, supports: exists ? next.supports.map(item => item.id === person.id ? person : item) : [person, ...next.supports] };
    });
    setForm(null);
  };
  const remove = id => setData(previous => ({ ...normalize(previous), supports: normalize(previous).supports.filter(person => person.id !== id) }));
  if (form) return <form className={css.card + " " + css.stack} onSubmit={save}>
    <div className={css.formHead}><h2 className={css.sectionTitle}>{form === "new" ? "אדם חדש" : "עריכת אדם"}</h2><IconButton label="סגירה" onClick={() => setForm(null)}><X size={18} /></IconButton></div>
    <label className={css.label}>איך נוח לקרוא לו?<input className={css.field} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="למשל: אחותי, חבר קרוב או מטפל" /></label>
    <label className={css.label}>במה הוא יכול לעזור? <span>אופציונלי</span><input className={css.field} value={draft.role} onChange={event => setDraft({ ...draft, role: event.target.value })} placeholder="למשל: להקשיב, לחשוב יחד, עזרה מעשית" /></label>
    <label className={css.label}>דרך פנייה מועדפת <span>אופציונלי</span><input className={css.field} value={draft.method} onChange={event => setDraft({ ...draft, method: event.target.value })} placeholder="למשל: שיחה או הודעה" /></label>
    <button className={css.primary}>שמירה</button>
  </form>;
  return <div className={css.stack}>
    <section className={css.heroSmall}><p className={css.eyebrow}>לא צריך לעבור הכול לבד</p><h2>אנשי תמיכה</h2><p>רשימה פרטית שלך. האפליקציה לא יוצרת קשר עם אף אחד.</p></section>
    <button className={css.primary + " " + css.addButton} onClick={() => open(null)}><Plus size={18} />הוספת אדם</button>
    <section className={css.card}>{!data.supports.length ? <p className={css.empty}>אין עדיין אנשים ברשימה. אפשר להוסיף כינוי בלבד.</p> : data.supports.map(person => <article className={css.person} key={person.id}><div><strong>{person.name}</strong>{person.role && <span>{person.role}</span>}{person.method && <small>נוח לפנות ב: {person.method}</small>}</div><div><IconButton label="עריכת אדם" onClick={() => open(person)}><Pencil size={17} /></IconButton><IconButton label="מחיקת אדם" onClick={() => remove(person.id)}><Trash2 size={17} /></IconButton></div></article>)}</section>
  </div>;
}

function Week({ data, setData }) {
  const [note, setNote] = useState(data.weekly.reviewNote || "");
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => { const date = new Date(); date.setDate(date.getDate() - index); return date.toISOString().slice(0, 10); }), []);
  const byDate = new Map(data.history.map(item => [item.date, item]));
  return <div className={css.stack}>
    <section className={css.heroSmall}><p className={css.eyebrow}>סגירת שבוע</p><h2>מה עבד ומה צריך לשנות?</h2><p>המטרה היא ללמוד, לא לשפוט.</p></section>
    <section className={css.card}>{days.map(date => { const item = byDate.get(date); const label = new Date(date + "T12:00").toLocaleDateString("he-IL", { weekday: "short", day: "numeric" }); return <article className={css.weekRow} key={date}><div><strong>{label}</strong><span>{item?.step || "לא נבחר צעד"}</span></div><small>{item?.status === "done" ? "בוצע" : item?.status === "skip" ? "לא היום" : item ? "פתוח" : ""}</small></article>; })}</section>
    <section className={css.card + " " + css.stack}><label className={css.label}>תובנה אחת לשבוע הבא<textarea className={css.field} value={note} onChange={event => setNote(event.target.value)} placeholder="למשל: הייתי צריך פחות התחייבויות ביום המעבר" /></label><button className={css.primary} onClick={() => setData(previous => ({ ...normalize(previous), weekly: { ...normalize(previous).weekly, reviewNote: note } }))}>שמירת התובנה</button></section>
  </div>;
}

function Privacy({ data, setData }) {
  const choices = [["private", "לא לשתף", "המידע נשאר בחברה הזאת בלבד."], ["steady", "אפשר להציג מצב יציב", "ההנהלה תראה נקודה ירוקה בלבד."], ["need-help", "צריך להוריד עומס", "ההנהלה תראה נקודה צהובה בלבד."]];
  return <div className={css.stack}>
    <section className={css.heroSmall}><p className={css.eyebrow}>שליטה אצלך</p><h2>פרטיות ושיתוף</h2><p>טקסטים, הערות ואנשי תמיכה לא עוברים להנהלה.</p></section>
    <section className={css.card}><h2 className={css.sectionTitle}>מה לשתף עם עמית?</h2>{choices.map(([id, label, description]) => <button key={id} onClick={() => setData(previous => ({ ...normalize(previous), shareStatus: id }))} className={css.shareOption + " " + (data.shareStatus === id ? css.shareActive : "")}><strong>{label}</strong><span>{description}</span></button>)}</section>
    <section className={css.help}><CircleHelp size={20} /><div><strong>במצוקה חריפה או בסכנה מיידית</strong><p>פנה לאדם קרוב, למוקד חירום או לער״ן בטלפון 1201 ובאתר ער״ן. זהו כלי ארגון, לא תחליף לעזרה אנושית מקצועית.</p><a href="https://www.eran.org.il/services/" target="_blank" rel="noreferrer">לאתר ער״ן</a></div></section>
  </div>;
}

export default function WellbeingApp() {
  const { data, setData, ready } = useStore(STORE_KEY, INIT);
  const [tab, setTab] = useState("today");
  if (!ready) return <main className={css.loading}>טוען את המרחב שלך…</main>;
  const normalized = normalize(data);
  const content = tab === "today" ? <Today data={normalized} setData={setData} setTab={setTab} /> : tab === "focus" ? <Focus data={normalized} setData={setData} /> : tab === "support" ? <Support data={normalized} setData={setData} /> : tab === "week" ? <Week data={normalized} setData={setData} /> : <Privacy data={normalized} setData={setData} />;
  return <main className={css.shell}><Header tab={tab} setTab={setTab} /><div className={css.content}>{content}</div><nav className={css.bottomNav} aria-label="ניווט רווחה נפשית">{TABS.map(([id, label, Icon]) => <button key={id} className={tab === id ? css.active : ""} onClick={() => setTab(id)} aria-current={tab === id ? "page" : undefined}><Icon size={19} /><span>{label}</span></button>)}</nav></main>;
}
