"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Check, HeartHandshake, Plus, ShieldCheck, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { INIT, STORE_KEY, localISO, normalize, uid } from "../model";
import css from "./wellbeing-v4.module.css";

const TABS = [["today","היום"],["support","תמיכה"],["week","השבוע"],["private","פרטי"]];
const loads = [["light","קל"],["busy","עמוס"],["heavy","כבד"]];
const reliefs = [["shrink","להקטין התחייבות"],["defer","לדחות החלטה"],["ask","לבקש עזרה"]];

export default function WellbeingAppV4() {
  const { data, setData, ready } = useStore(STORE_KEY, INIT);
  const [tab, setTab] = useState("today");
  const [notice, setNotice] = useState("");
  const [supportForm, setSupportForm] = useState(null);
  const [draft, setDraft] = useState({name:"", role:"", method:"", when:"", ask:""});
  const state = normalize(data);
  const tell = (message) => { setNotice(message); window.setTimeout(() => setNotice(""), 3200); };
  const saveToday = (patch) => setData(previous => {
    const next=normalize(previous), date=localISO(), old=next.today.date===date ? next.today : {date,step:"",status:"open",load:"",reliefPlan:"",reliefNote:""};
    const entry={...old,...patch,id:old.id||uid(),updatedAt:new Date().toISOString()};
    return {...next,today:entry,history:[entry,...next.history.filter(item=>item.date!==date)]};
  });
  const today=state.today.date===localISO()?state.today:{date:localISO(),step:"",status:"open",load:"",reliefPlan:"",reliefNote:""};
  const history=useMemo(()=>state.history.slice(0,7),[state.history]);
  const openSupport=(person=null)=>{setDraft(person||{name:"",role:"",method:"",when:"",ask:""});setSupportForm(person?.id||"new");};
  const saveSupport=(event)=>{event.preventDefault();if(!draft.name.trim())return;setData(previous=>{const next=normalize(previous);const person={...draft,name:draft.name.trim(),id:supportForm==="new"?uid():supportForm};return {...next,supports:next.supports.some(x=>x.id===person.id)?next.supports.map(x=>x.id===person.id?person:x):[person,...next.supports]};});setSupportForm(null);tell("איש התמיכה נשמר.");};
  const removeSupport=(id)=>{if(!window.confirm("למחוק את איש התמיכה מהרשימה?"))return;setData(previous=>({...normalize(previous),supports:normalize(previous).supports.filter(x=>x.id!==id)}));tell("האיש הוסר מהרשימה.");};
  if(!ready)return <main className={css.loading}>טוען את המרחב שלך…</main>;
  return <main className={css.shell} dir="rtl">
    <header className={css.header}><Link href="/" className={css.back}><ChevronLeft size={17}/>חזרה למנכ״ל</Link><div><p>המרחב האישי שלך</p><h1>רווחה נפשית</h1></div></header>
    {notice&&<div className={css.toast} role="status" aria-live="polite">{notice}</div>}
    <nav className={css.tabs} aria-label="ניווט רווחה">{TABS.map(([id,label])=><button key={id} onClick={()=>setTab(id)} className={tab===id?css.active:""} aria-current={tab===id?"page":undefined}>{label}</button>)}</nav>
    {tab==="today"&&<section className={css.stack}>
      <div className={css.hero}><p>היום · {new Date().toLocaleDateString("he-IL",{weekday:"long",day:"numeric",month:"long"})}</p><h2>מה יעשה את היום קצת יותר אפשרי?</h2><span>לא אבחון ולא מדד. רק מקום לבחור צעד קטן.</span></div>
      <article className={css.card}><h2>עומס היום</h2><div className={css.choices}>{loads.map(([id,label])=><button key={id} className={today.load===id?css.selected:""} onClick={()=>{saveToday({load:id});tell("מצב העומס נשמר.");}}>{label}</button>)}</div>
      {today.load==="heavy"&&<div className={css.relief}><strong>בוא נוריד משהו מהכתפיים.</strong><p>בחר פעולה אחת, בלי להסביר ובלי לשפוט.</p><div className={css.reliefButtons}>{reliefs.map(([id,label])=><button key={id} className={today.reliefPlan===id?css.selected:""} onClick={()=>{saveToday({reliefPlan:id}); if(id==="ask")setTab("support"); tell("תוכנית ההקלה נשמרה.");}}>{label}</button>)}</div><input className={css.field} value={today.reliefNote||""} onChange={e=>saveToday({reliefNote:e.target.value})} placeholder="הערה קצרה, אם זה עוזר" /></div>}</article>
      <article className={css.card}><label>צעד קטן להיום<textarea className={css.field} value={today.step||""} onChange={e=>saveToday({step:e.target.value})} placeholder="למשל: לצאת לעשר דקות, לסיים טלפון אחד, או לנוח." /></label><div className={css.actions}><button className={css.primary} onClick={()=>{saveToday({status:"done"});tell("הצעד סומן כבוצע.");}}><Check size={17}/>סמן שבוצע</button><button className={css.quiet} onClick={()=>{saveToday({status:"skip",step:""});tell("היום שוחרר בלי משימה.");}}>לא היום</button></div></article>
      <aside className={css.help}><ShieldCheck size={20}/><div><strong>אם יש סכנה מיידית או מצוקה חריפה</strong><p>פנה לאדם קרוב, למוקד חירום, או לער״ן 1201. זהו כלי ארגון, לא תחליף לעזרה אנושית מקצועית.</p><a href="https://www.eran.org.il/services/" target="_blank" rel="noreferrer">לאתר ער״ן</a></div></aside>
    </section>}
    {tab==="support"&&<section className={css.stack}>
      <div className={css.hero + " " + css.soft}><p>לא צריך לעבור הכול לבד</p><h2>רשת התמיכה שלי</h2><span>שמות והערות פרטיים. שום הודעה לא נשלחת מכאן.</span></div>
      {supportForm?<form className={css.card+" "+css.stack} onSubmit={saveSupport}><div className={css.row}><h2>{supportForm==="new"?"אדם חדש":"עריכת אדם"}</h2><button type="button" className={css.icon} onClick={()=>setSupportForm(null)} aria-label="ביטול"><X size={18}/></button></div><label>שם או כינוי<input className={css.field} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})} required /></label><label>במה הוא יכול לעזור?<input className={css.field} value={draft.role} onChange={e=>setDraft({...draft,role:e.target.value})} placeholder="למשל: להקשיב, לחשוב יחד, עזרה מעשית" /></label><label>מתי טוב לפנות?<input className={css.field} value={draft.when} onChange={e=>setDraft({...draft,when:e.target.value})} placeholder="למשל: כשאני עמוס או לפני החלטה" /></label><label>מה אפשר לבקש?<input className={css.field} value={draft.ask} onChange={e=>setDraft({...draft,ask:e.target.value})} placeholder="למשל: עשר דקות שיחה או עזרה מעשית" /></label><button className={css.primary}>שמירה</button><button type="button" className={css.quiet} onClick={()=>setSupportForm(null)}>ביטול</button></form>:<><button className={css.primary} onClick={()=>openSupport()}><Plus size={17}/>הוספת אדם</button><article className={css.card}>{!state.supports.length?<p className={css.muted}>אין עדיין אנשים ברשימה. אפשר להתחיל בכינוי בלבד.</p>:state.supports.map(person=><div className={css.person} key={person.id}><div><strong>{person.name}</strong><span>{person.role}</span>{person.when&&<small>לפנות כש: {person.when}</small>}{person.ask&&<small>אפשר לבקש: {person.ask}</small>}</div><div><button className={css.linkButton} onClick={()=>openSupport(person)}>עריכה</button><button className={css.linkButton} onClick={()=>removeSupport(person.id)}>מחיקה</button></div></div>)}</article></>}
    </section>}
    {tab==="week"&&<section className={css.stack}><div className={css.hero + " " + css.soft}><p>סגירת שבוע</p><h2>מה עזר ומה כדאי לשחרר?</h2><span>מבט עדין לאחור, ללא ציון וללא רצף.</span></div><article className={css.card}><h2>השבוע האחרון</h2>{!history.length?<p className={css.muted}>אין עדיין מה לסכם, וזה בסדר.</p>:history.map(item=><div className={css.person} key={item.id||item.date}><div><strong>{new Date(item.date+"T12:00").toLocaleDateString("he-IL",{weekday:"short",day:"numeric"})}</strong><span>{item.step||"לא נבחר צעד"}</span></div><small>{item.status==="done"?"בוצע":item.status==="skip"?"לא היום":"פתוח"}{item.load==="heavy"?" · עומס כבד":""}</small></div>)}</article></section>}
    {tab==="private"&&<section className={css.stack}><div className={css.hero + " " + css.soft}><p>שליטה אצלך</p><h2>פרטיות</h2><span>אין כאן אבחון, טיפול או שיתוף אוטומטי.</span></div><article className={css.card}><h2>מה נשמר?</h2><p className={css.muted}>הצעדים, העומס, ההערות ורשת התמיכה נשמרים במרחב האישי שלך כדי שהחוויה תישאר רציפה. לא נשלחים לאנשי תמיכה ולא מועברים כטקסט להנהלה.</p></article></section>}
  </main>;
}
