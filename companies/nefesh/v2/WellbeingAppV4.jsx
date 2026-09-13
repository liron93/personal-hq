"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronLeft, Plus, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { INIT, STORE_KEY, localISO, normalize, uid } from "../model";
import css from "./wellbeing-v6.module.css";

const tabs=[["today","היום"],["plan","סדר היום"]];
const priorities=[["now","היום"],["soon","השבוע"],["later","בהמשך"]];

export default function WellbeingAppV6(){
 const {data,setData,ready}=useStore(STORE_KEY,INIT);
 const [tab,setTab]=useState("today"),[title,setTitle]=useState(""),[priority,setPriority]=useState("now"),[notice,setNotice]=useState("");
 const state=normalize(data),tasks=Array.isArray(state.tasks)?state.tasks:[];
 const notify=(text)=>{setNotice(text);window.setTimeout(()=>setNotice(""),2600)};
 const add=()=>{const value=title.trim();if(!value)return;setData(prev=>({...normalize(prev),tasks:[{id:uid(),title:value,priority,done:false,createdAt:new Date().toISOString()},...(normalize(prev).tasks||[])]}));setTitle("");notify("המשימה נוספה ליומן.");};
 const update=(id,patch)=>setData(prev=>({...normalize(prev),tasks:(normalize(prev).tasks||[]).map(task=>task.id===id?{...task,...patch}:task)}));
 const remove=(id)=>{if(!window.confirm("למחוק את המשימה?"))return;setData(prev=>({...normalize(prev),tasks:(normalize(prev).tasks||[]).filter(task=>task.id!==id)}));notify("המשימה נמחקה.");};
 const today=tasks.filter(t=>t.priority==="now"),open=tasks.filter(t=>!t.done);
 const renderTask=(task)=><article className={css.task} key={task.id}><button className={task.done?css.done:css.check} aria-label={task.done?"סמן כפתוח":"סמן שבוצע"} onClick={()=>update(task.id,{done:!task.done})}>{task.done&&<Check size={15}/>}</button><div className={css.taskText}><strong className={task.done?css.struck:""}>{task.title}</strong><select value={task.priority} onChange={e=>update(task.id,{priority:e.target.value})}>{priorities.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></div><button className={css.delete} onClick={()=>remove(task.id)} aria-label="מחיקת משימה"><Trash2 size={17}/></button></article>;
 if(!ready)return <main className={css.loading}>טוען את היומן שלך…</main>;
 return <main className={css.shell} dir="rtl">
  <header><Link href="/" className={css.back}><ChevronLeft size={17}/>חזרה למנכ״ל</Link><p>היד הימנית שלך</p><h1>אוריה · סדר החיים</h1></header>
  {notice&&<div className={css.toast} role="status" aria-live="polite">{notice}</div>}
  <nav className={css.tabs}>{tabs.map(([id,label])=><button key={id} onClick={()=>setTab(id)} className={tab===id?css.active:""}>{label}</button>)}</nav>
  {tab==="today"&&<section className={css.stack}>
   <div className={css.hero}><p>{new Date().toLocaleDateString("he-IL",{weekday:"long",day:"numeric",month:"long"})}</p><h2>בוא נסדר את היום.</h2><span>תכתוב כל דבר שמסתובב לך בראש. אחר כך נחליט יחד מה באמת צריך לקרות היום.</span></div>
   <article className={css.card}><h2>הוספת משימה</h2><textarea className={css.field} value={title} onChange={e=>setTitle(e.target.value)} placeholder="למשל: לדבר עם הבנק, לבחור מיטה, לקבוע אימון…" /><div className={css.addRow}><select className={css.select} value={priority} onChange={e=>setPriority(e.target.value)}>{priorities.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select><button className={css.primary} onClick={add}><Plus size={18}/>הוספה ליומן</button></div></article>
   <article className={css.card}><div className={css.head}><h2>המשימות שלי להיום</h2><span>{today.filter(t=>!t.done).length} פתוחות</span></div>{!today.length?<p className={css.empty}>עדיין אין משימות להיום. כתוב את הראשונה למעלה.</p>:today.map(renderTask)}</article>
  </section>}
  {tab==="plan"&&<section className={css.stack}><div className={css.hero+" "+css.light}><p>תמונה רחבה</p><h2>סדר היום שלך</h2><span>כאן רואים הכול בלי להפוך את זה לעוד מקום עמוס.</span></div><article className={css.card}><div className={css.head}><h2>כל המשימות הפתוחות</h2><span>{open.length} פתוחות</span></div>{!open.length?<p className={css.empty}>אין כרגע משימות פתוחות.</p>:open.map(renderTask)}</article></section>}
  {tab==="oria"&&<section className={css.stack}><div className={css.hero+" "+css.light}><p>עובדים יחד</p><h2>איפה אני נכנס לתמונה?</h2><span>לא עוד כפתור דמה. את העבודה המשותפת עושים כאן בשיחה איתי.</span></div><article className={css.card}><h2>מתי לכתוב לי?</h2><ul><li>כשיש יותר מדי משימות ואתה לא יודע מאיפה להתחיל.</li><li>כשאתה צריך לפרק משימה גדולה לצעד הבא.</li><li>כשצריך החלטה, ניסוח הודעה, או תכנון של יום/שבוע.</li></ul><p className={css.prompt}>פשוט כתוב: “אוריה, בוא נסדר את היום שלי” — ואני אעבור איתך על היומן, אאתגר סדרי עדיפויות, ואחזיר תוכנית ברורה.</p></article></section>}
 </main>;
}