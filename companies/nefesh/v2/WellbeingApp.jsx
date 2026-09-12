"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronLeft, CircleHelp, HeartHandshake, MoreHorizontal, Pencil, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { INIT, STORE_KEY, localISO, normalize, uid } from "../model";
import css from "./wellbeing-v2.module.css";

const TABS = [
  ["today", "היום", Check],
  ["week", "השבוע", MoreHorizontal],
  ["support", "תמיכה", HeartHandshake],
  ["privacy", "פרטיות", ShieldCheck],
];

function IconButton({ label, children, ...props }) {
  return <button className={css.iconButton} aria-label={label} {...props}>{children}</button>;
}

function Status({ value, onChange }) {
  const options = [
    ["open", "נשאר פתוח"],
    ["done", "בוצע"],
    ["skip", "לא היום"],
  ];
  return <div className={css.statusRow} aria-label="מצב הצעד">{options.map(([id, label]) => (
    <button key={id} onClick={() => onChange(id)} className={value === id ? css.statusActive : ""}>{label}</button>
  ))}</div>;
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

function Today({ data, setData }) {
  const day = localISO();
  const current = data.today.date === day ? data.today : { date: day, step: "", status: "open", feeling: "" };
  const [draft, setDraft] = useState(current.step);
  const save = () => setData(previous => {
    const next = normalize(previous);
    const entry = { ...current, step: draft.trim(), id: current.id || uid(), updatedAt: new Date().toISOString() };
    const history = next.history.filter(item => item.date !== day);
    return { ...next, today: entry, history: [entry, ...history] };
  });
  const setStatus = status => {
    setData(previous => {
      const next = normalize(previous);
      const entry = { ...current, step: draft.trim(), status, id: current.id || uid(), updatedAt: new Date().toISOString() };
      const history = next.history.filter(item => item.date !== day);
      return { ...next, today: entry, history: [entry, ...history] };
    });
  };
  const feelingChoices = ["רגוע יחסית", "עמוס", "מותש", "צריך מרחב"];
  return <div className={css.stack}>
    <section className={css.hero}>
      <p className={css.eyebrow}>היום · {new Date().toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })}</p>
      <h2>מה יכול להקל עליך היום?</h2>
      <p>לא צריך לפתור הכול. מספיק לבחור דבר אחד קטן שאפשר לעשות.</p>
    </section>
    <section className={css.card}>
      <label className={css.label}>הצעד שלי להיום
        <textarea className={css.field} value={draft} onChange={event => setDraft(event.target.value)} placeholder="למשל: לדבר עם מישהו, לצאת לעשר דקות, או להסדיר דבר אחד" />
      </label>
      <div className={css.actions}>
        <button className={css.primary} onClick={save}>שמירת הצעד</button>
        <button className={css.quiet} onClick={() => { setDraft(""); setStatus("skip"); }}>לא היום</button>
      </div>
      <Status value={current.status} onChange={setStatus} />
    </section>
    <section className={css.card}>
      <h2 className={css.sectionTitle}>בדיקת מצב קצרה</h2>
      <p className={css.subtle}>רק אם מתאים לך. זה מידע פרטי ולא נשלח לאף אחד.</p>
      <div className={css.choiceGrid}>{feelingChoices.map(value => (
        <button key={value} onClick={() => setData(previous => ({ ...normalize(previous), today: { ...current, feeling: value, id: current.id || uid() } }))} className={current.feeling === value ? css.choiceActive : ""}>{value}</button>
      ))}</div>
    </section>
  </div>;
}

function Week({ data }) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - index);
    return date.toISOString().slice(0, 10);
  }), []);
  const byDate = new Map(data.history.map(item => [item.date, item]));
  return <div className={css.stack}>
    <section className={css.heroSmall}><p className={css.eyebrow}>מבט עדין לאחור</p><h2>השבוע שלך</h2><p>אין ציון ואין רצף. רק תמונה שתעזור לך להבין מה היה אפשרי.</p></section>
    <section className={css.card}>{days.map(date => {
      const item = byDate.get(date);
      const label = new Date(date + "T12:00").toLocaleDateString("he-IL", { weekday: "short", day: "numeric" });
      return <article className={css.weekRow} key={date}><div><strong>{label}</strong><span>{item?.step || "לא נבחר צעד"}</span></div><small>{item?.status === "done" ? "בוצע" : item?.status === "skip" ? "לא היום" : item ? "פתוח" : ""}</small></article>;
    })}</section>
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
      const item = { ...draft, name: draft.name.trim(), id: form === "new" ? uid() : form };
      const exists = next.supports.some(person => person.id === item.id);
      return { ...next, supports: exists ? next.supports.map(person => person.id === item.id ? item : person) : [item, ...next.supports] };
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

function Privacy({ data, setData }) {
  const choices = [
    ["private", "לא לשתף", "המידע נשאר בחברה הזאת בלבד."],
    ["steady", "אפשר להציג מצב יציב", "ההנהלה תראה נקודה ירוקה בלבד."],
    ["need-help", "צריך להוריד עומס", "ההנהלה תראה נקודה צהובה בלבד."],
  ];
  return <div className={css.stack}>
    <section className={css.heroSmall}><p className={css.eyebrow}>שליטה אצלך</p><h2>פרטיות ושיתוף</h2><p>טקסטים, הערות ואנשי תמיכה לא עוברים להנהלה.</p></section>
    <section className={css.card}><h2 className={css.sectionTitle}>מה לשתף עם עמית?</h2>{choices.map(([id, label, description]) => <button key={id} onClick={() => setData(previous => ({ ...normalize(previous), shareStatus: id }))} className={css.shareOption + " " + (data.shareStatus === id ? css.shareActive : "")}><strong>{label}</strong><span>{description}</span></button>)}</section>
    <section className={css.help}>
      <CircleHelp size={20} />
      <div><strong>במצוקה חריפה או בסכנה מיידית</strong><p>פנה לאדם קרוב, למוקד חירום או לער״ן בטלפון 1201 ובאתר ער״ן. זהו כלי ארגון, לא תחליף לעזרה אנושית מקצועית.</p><a href="https://www.eran.org.il/services/" target="_blank" rel="noreferrer">לאתר ער״ן</a></div>
    </section>
  </div>;
}

export default function WellbeingApp() {
  const { data, setData, ready } = useStore(STORE_KEY, INIT);
  const [tab, setTab] = useState("today");
  if (!ready) return <main className={css.loading}>טוען את המרחב שלך…</main>;
  const normalized = normalize(data);
  const content = tab === "today" ? <Today data={normalized} setData={setData} /> : tab === "week" ? <Week data={normalized} /> : tab === "support" ? <Support data={normalized} setData={setData} /> : <Privacy data={normalized} setData={setData} />;
  return <main className={css.shell}><Header tab={tab} setTab={setTab} /><div className={css.content}>{content}</div><nav className={css.bottomNav} aria-label="ניווט רווחה נפשית">{TABS.map(([id, label, Icon]) => <button key={id} className={tab === id ? css.active : ""} onClick={() => setTab(id)} aria-current={tab === id ? "page" : undefined}><Icon size={20} /><span>{label}</span></button>)}</nav></main>;
}
