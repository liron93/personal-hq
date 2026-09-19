"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronLeft, Clock3, ExternalLink, Plus, Radar, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { INIT, STORE_KEY, normalize, uid } from "../model";
import css from "./wellbeing-v6.module.css";

const tomorrowISO=()=>{const d=new Date();d.setDate(d.getDate()+1);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)};
const TABS=[["today","היום"],["soon","מחר ויומיים"],["follow","מעקב"]];
const owner=(task)=>task.owner||"לירון";
const source=(task)=>task.source||"אוריה";
const taskLink=(task)=>/^https?:\/\//i.test(task?.link?.trim()||"") ? task.link.trim() : "";

export default function OriaControlRoom(){
 const {data,setData,ready}=useStore(STORE_KEY,INIT);
 const [tab,setTab]=useState("today"),[title,setTitle]=useState(""),[link,setLink]=useState(""),[slot,setSlot]=useState("today"),[notice,setNotice]=useState("");
 const state=normalize(data),tasks=Array.isArray(state.tasks)?state.tasks:[],waiting=Array.isArray(state.waiting)?state.waiting:[],decisions=Array.isArray(state.decisionLog)?state.decisionLog:[];
 const today=tasks.filter(x=>x.bucket==="today"&&!x.done),tomorrow=tasks.filter(x=>x.bucket==="tomorrow"&&!x.done),later=tasks.filter(x=>x.bucket==="week"&&!x.done);
 const now=today[0]||tomorrow[0]||null;
 const tell=(text)=>{setNotice(text);window.setTimeout(()=>setNotice(""),2500)};
 const mutate=(fn)=>setData(prev=>({...normalize(prev),tasks:fn(normalize(prev).tasks||[])}));
 const add=()=>{if(!title.trim())return;const bucket=slot==="tomorrow"?"tomorrow":slot==="later"?"inbox":"today";mutate(xs=>[{id:uid(),title:title.trim(),bucket,due:slot==="tomorrow"?tomorrowISO():"",source:"אוריה",owner:"לירון",link:taskLink({link}),done:false},...xs]);setTitle("");setLink("");tell("הפעולה נוספה.");};
 const done=(id)=>mutate(xs=>xs.map(x=>x.id===id?{...x,done:!x.done}:x));
 const remove=(id)=>{if(!window.confirm("למחוק את הפעולה?"))return;mutate(xs=>xs.filter(x=>x.id!==id));tell("הפעולה הוסרה.");};
 const row=(task)=><article key={task.id} className={css.commandRow}><button className={css.check} onClick={()=>done(task.id)} aria-label="סמן שבוצע"><Check size={15}/></button><div className={css.rowMain}><strong>{task.title}</strong><span><i>{source(task)}</i> · בעלים: {owner(task)}</span>{taskLink(task)?<a className={css.taskLink} href={taskLink(task)} target="_blank" rel="noreferrer"><ExternalLink size={14}/>פתיחת קישור</a>:<span className={css.noLink}>אין קישור לפעולה זו</span>}</div><button className={css.delete} onClick={()=>remove(task.id)} aria-label="מחיקה"><Trash2 size={17}/></button></article>;
 const sortedWaiting=useMemo(()=>waiting.filter(x=>!x.done),[waiting]);
 if(!ready)return <main className={css.loading}>טוען את מרכז השליטה…</main>;
 return <main className={css.shell} dir="rtl"><header className={css.commandHeader}><Link href="/" className={css.back}><ChevronLeft size={17}/>חזרה למנכ״ל</Link><div><p>ORIA / DAILY COMMAND</p><h1>מרכז השליטה האישי</h1></div><span className={css.orbit} aria-hidden="true"><Radar size={22}/></span></header>
 {notice&&<div className={css.toast} role="status" aria-live="polite">{notice}</div>}
 <nav className={css.tabs}>{TABS.map(([id,label])=><button key={id} className={tab===id?css.active:""} onClick={()=>setTab(id)}>{label}</button>)}</nav>
 {tab==="today"&&<section className={css.stack}><section className={css.nowCard}><p>הפעולה הבאה</p>{now?<><h2>{now.title}</h2><span>מקור: {source(now)} · בעלים: {owner(now)}</span>{taskLink(now)&&<a className={css.nowLink} href={taskLink(now)} target="_blank" rel="noreferrer"><ExternalLink size={15}/>פתיחת קישור</a>}<button onClick={()=>done(now.id)}><Check size={17}/>סימון בוצע</button></>:<><h2>אין פעולה בוערת כרגע.</h2><span>זה זמן טוב להכניס דבר אחד שחשוב לך.</span></>}</section>
 <article className={css.card}><div className={css.head}><h2>הכנסה מהירה</h2><span>בלי תאריך ידני</span></div><textarea className={css.field} value={title} onChange={e=>setTitle(e.target.value)} placeholder="מה צריך לטפל בו?" /><input className={css.linkField} type="url" dir="ltr" value={link} onChange={e=>setLink(e.target.value)} placeholder="https:// קישור רלוונטי (לא חובה)" /><div className={css.quickChoices}><button className={slot==="today"?css.chosen:""} onClick={()=>setSlot("today")}>היום</button><button className={slot==="tomorrow"?css.chosen:""} onClick={()=>setSlot("tomorrow")}>מחר</button><button className={slot==="later"?css.chosen:""} onClick={()=>setSlot("later")}>לא חשוב כרגע</button><button className={css.primary} onClick={add}><Plus size={18}/>הוספה</button></div></article>
 <article className={css.card}><div className={css.head}><div><h2>כל המשימות להיום</h2><p className={css.hint}>כל משימה מוצגת עם המקור, הבעלים והקישור שלה. שלוש הראשונות הן רק נקודת התחלה.</p></div><span>{today.length} משימות</span></div>{!today.length?<p className={css.empty}>בחר פעולה אחת. לא צריך לתכנן את כל החיים היום.</p>:today.map(row)}</article>
 {today.length>3&&<article className={css.reliefCard}><Clock3 size={20}/><div><strong>מבט ריאלי על היום</strong><p>יש {today.length} משימות, וכולן גלויות. אם אחת לא באמת צריכה לקרות היום, אפשר להשאיר אותה כאן בינתיים או לתכנן אותה מחדש למחר.</p></div></article>}</section>}
 {tab==="soon"&&<section className={css.stack}><section className={css.hero+" "+css.light}><p>48 השעות הבאות</p><h2>מה מתקרב?</h2><span>כל פעולה כוללת מקור, בעלים וקישור כשנוסף לה.</span></section><article className={css.card}><h2>מחר · {new Date(tomorrowISO()+"T12:00").toLocaleDateString("he-IL",{weekday:"long",day:"numeric",month:"long"})}</h2>{!tomorrow.length?<p className={css.empty}>אין פעולות מתוכננות למחר.</p>:tomorrow.map(row)}</article><article className={css.card}><h2>יומיים קדימה</h2>{!later.length?<p className={css.empty}>אין פעולה מתוכננת מעבר למחר כרגע.</p>:later.map(row)}</article></section>}
 {tab==="follow"&&<section className={css.stack}><section className={css.hero+" "+css.light}><p>בלי לזכור לבד</p><h2>מה ממתין?</h2><span>דברים אצל אחרים והחלטות פתוחות נשארים כאן עד שסוגרים אותם.</span></section><article className={css.card}><h2>ממתין לבעלים</h2>{!sortedWaiting.length?<p className={css.empty}>אין כרגע מעקבים פתוחים.</p>:sortedWaiting.map(x=><div className={css.commandRow} key={x.id}><span className={css.waitDot}/><div className={css.rowMain}><strong>{x.title}</strong><span>בעלים: {x.owner||"לא הוגדר"}</span></div></div>)}</article><article className={css.card}><h2>החלטות פתוחות</h2>{!decisions.filter(x=>!x.done).length?<p className={css.empty}>אין החלטות פתוחות כרגע.</p>:decisions.filter(x=>!x.done).map(x=><div className={css.commandRow} key={x.id}><span className={css.waitDot}/><div className={css.rowMain}><strong>{x.title}</strong><span>בעלים: לירון</span></div></div>)}</article></section>}
 </main>;
}