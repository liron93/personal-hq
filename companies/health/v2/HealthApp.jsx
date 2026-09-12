"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Activity, Apple, CalendarDays, Check, ChevronLeft, CirclePlus, Dumbbell, MoreHorizontal, Pencil, Settings, Trash2, TrendingUp, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { STORE_KEY, INIT, uid } from "../model";
import css from "./health-v2.module.css";

const NAV = [
  ["today", "היום", Activity],
  ["journal", "תיעוד", CirclePlus],
  ["plan", "תוכנית", CalendarDays],
  ["progress", "התקדמות", TrendingUp],
];
const localISO = () => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const fmt = value => new Date(value + "T12:00").toLocaleDateString("he-IL", { weekday:"short", day:"numeric", month:"short" });
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0,10); };

function Empty({ children }) { return <div className={css.empty}>{children}</div>; }
function IconButton({ label, children, ...props }) { return <button aria-label={label} className={css.iconButton} {...props}>{children}</button>; }
function Header({ tab, setTab, more, setMore }) {
  return <><header className={css.header}><div><Link href="/" className={css.back}>חזרה למנכ״ל</Link><p className={css.eyebrow}>מרחב האימון והתזונה שלך</p><h1 className={css.title}>אימון ותזונה</h1></div><button onClick={()=>setMore(!more)} className={css.avatar} aria-label="עוד אפשרויות"><MoreHorizontal /></button></header>
  {more && <aside className={css.card+" "+css.settings}><details open><summary>המידע שלך</summary><p>המידע נשמר בחשבון המאובטח שלך. זהו כלי לתיעוד והרגלים, לא אבחון, טיפול או תוכנית רפואית.</p><button className={css.secondary} onClick={()=>setTab("settings")}>פרטיות והגדרות</button></details></aside>}</>;
}
function Nav({ tab, setTab }) { return <><aside className={css.desktopAside}>{NAV.map(([id,label,Icon])=><button key={id} onClick={()=>setTab(id)} className={tab===id?css.active:""}><Icon size={18}/> {label}</button>)}</aside><nav className={css.bottomNav} aria-label="ניווט חברת אימון ותזונה">{NAV.map(([id,label,Icon])=><button key={id} onClick={()=>setTab(id)} className={css.navItem+" "+(tab===id?css.active:"")} aria-current={tab===id?"page":undefined}><Icon/><span>{label}</span></button>)}</nav></>; }

function Onboarding({ d, setD }) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(d.profile);
  const finish = () => setD(p => ({ ...p, profile: { ...draft, complete: true } }));
  const next = () => step < 3 ? setStep(step + 1) : finish();
  const titles = [
    "לאן חשוב לך להגיע?",
    "יש תאריך או אירוע שמניע אותך?",
    "מאיפה מתחילים?",
    "מה ריאלי בשבוע הקרוב?",
  ];
  const helper = [
    "כותבים את המטרה במילים שלך. לדוגמה: להיכנס לכושר לקראת החתונה.",
    "אפשר להשאיר ריק. זה רק עוזר לשמור על כיוון.",
    "אין כאן מבחן — רק נקודת פתיחה שנוחה לך.",
    "מתחילים ממה שבאמת אפשר לשמור עליו.",
  ];
  const choices = step === 2
    ? ["מתחיל/ה מאפס", "חוזר/ת אחרי הפסקה", "כבר בשגרה", "עוד לא בטוח/ה"]
    : ["פעם אחת", "פעמיים", "3 פעמים", "נלמד תוך כדי"];
  const choiceKey = step === 2 ? "experience" : "availability";
  const content = step === 0 ? (
    <label>היעד שלך<textarea className={css.field} value={draft.goal || ""} onChange={e => setDraft({ ...draft, goal: e.target.value })} placeholder="למשל: להיכנס לכושר לקראת החתונה, להרגיש חזק יותר, או לחזור לאנרגיה" /></label>
  ) : step === 1 ? (
    <div className={css.form}>
      <label>מה האירוע או התאריך?<input className={css.field} value={draft.event || ""} onChange={e => setDraft({ ...draft, event: e.target.value })} placeholder="למשל: החתונה שלנו" /></label>
      <label>מתי זה קורה? <span className={css.eyebrow}>אופציונלי</span><input className={css.field} dir="ltr" type="date" value={draft.targetDate || ""} onChange={e => setDraft({ ...draft, targetDate: e.target.value })} /></label>
    </div>
  ) : (
    <div className={css.choiceGrid}>{choices.map(value => <button key={value} onClick={() => setDraft({ ...draft, [choiceKey]: value })} className={css.choice+" "+(draft[choiceKey] === value ? css.selected : "")}>{value}</button>)}</div>
  );
  return <main className={css.onboard}><p className={css.eyebrow}>כמה שאלות קצרות · {step + 1} מתוך 4</p><div className={css.progressLine}>{[0,1,2,3].map(i => <i key={i} className={i <= step ? css.done : ""} />)}</div><section className={css.card+" "+css.stack}><h2 className={css.title}>{titles[step]}</h2><p className={css.subtle}>{helper[step]}</p>{content}<button className={css.primary+" "+css.wide} onClick={next}>{step === 3 ? "למסך היום" : "המשך"}<ChevronLeft size={18}/></button>{step < 3 && <button className={css.optional} onClick={next}>נמשיך בלי לבחור כרגע</button>}</section></main>;
}
function Today({ d, setTab, setComposer }) {
  const today=localISO(), meals=d.meals.filter(x=>x.date===today).length, workouts=d.workouts.filter(x=>x.date===today&&!x.skipped).length;
  const due=(d.plan||[]).filter(x=>x.date===today&&x.status!=="done").slice(0,2);
  const message=meals||workouts ? "נרשם משהו היום. אפשר להמשיך רק אם זה מתאים." : "אין צורך להספיק הכול. פעולה קטנה אחת מספיקה.";
  return <><section className={css.card+" "+css.hero}><p className={css.eyebrow}>היום · {fmt(today)}</p><h2>{message}</h2><p>{d.profile.goal ? "היעד שלך: "+d.profile.goal+(d.profile.event ? " · "+d.profile.event : "") : "אפשר להתחיל בתיעוד קצר, בלי לבנות הכול עכשיו."}</p><button className={css.primary+" "+css.mint} onClick={()=>setComposer("food")}>תיעוד מהיר <CirclePlus size={18}/></button></section>
  <div className={css.quickGrid}><button className={css.quick+" "+css.food} onClick={()=>setComposer("food")}><Apple size={23}/><strong>אוכל</strong><span>{meals?meals+" תיעודים היום":"לתעד מה היה"}</span></button><button className={css.quick+" "+css.move} onClick={()=>setComposer("move")}><Dumbbell size={23}/><strong>תנועה</strong><span>{workouts?workouts+" פעילויות היום":"לתעד תנועה"}</span></button></div>
  <div className={css.sectionHead}><h2>מה בתוכנית להיום</h2><button className={css.linkButton} onClick={()=>setTab("plan")}>לכל התוכנית</button></div>
  <section className={css.card}>{due.length?due.map(item=><div className={css.next} key={item.id}><span className={css.nextIcon}><CalendarDays size={19}/></span><div><strong>{item.text}</strong><span>{item.kind==="food"?"תזונה":"תנועה"} · גמיש לשינוי</span></div></div>):<Empty>עוד אין פעולה מתוכננת להיום.<br/>אפשר להוסיף משהו קטן לתוכנית.</Empty>}</section></>;
}
function Composer({ kind, onClose, d, setD, onSaved }) {
  const [type,setType]=useState(kind||"food"),[more,setMore]=useState(false),[draft,setDraft]=useState({name:"",date:localISO(),duration:"",note:"",feeling:""});
  const save=e=>{e.preventDefault();if(!draft.name.trim())return; const item={...draft,id:uid(),createdAt:new Date().toISOString()};setD(p=>type==="food"?{...p,meals:[item,...p.meals]}:{...p,workouts:[item,...p.workouts]});onSaved(type==="food"?"הארוחה נרשמה.":"הפעילות נרשמה.");};
  return <section className={css.composer}><div className={css.composerHead}><h2>תיעוד מהיר</h2><IconButton label="סגירה" onClick={onClose}><X size={18}/></IconButton></div><div className={css.toggle}><button onClick={()=>setType("food")} className={type==="food"?css.active:""}>🍽️ אוכל</button><button onClick={()=>setType("move")} className={type==="move"?css.active:""}>🚶 תנועה</button></div><form className={css.form} onSubmit={save}><label>{type==="food"?"מה היה?":"מה עשית?"}<input autoFocus className={css.field} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})} placeholder={type==="food"?"למשל כריך, קפה או ארוחה בבית":"למשל הליכה, חדר כושר או מתיחות"}/></label>{type==="move"&&<label>משך, אם מתאים<select className={css.field} value={draft.duration} onChange={e=>setDraft({...draft,duration:e.target.value})}><option value="">לא לציין</option><option>10 דקות</option><option>20 דקות</option><option>30 דקות</option><option>אחר</option></select></label>}<button type="button" className={css.optional} onClick={()=>setMore(!more)}>{more?"פחות פרטים":"הוספת פרטים"}</button>{more&&<><label>תאריך<input className={css.field} dir="ltr" type="date" value={draft.date} onChange={e=>setDraft({...draft,date:e.target.value})}/></label><label>איך הרגיש לך?<select className={css.field} value={draft.feeling} onChange={e=>setDraft({...draft,feeling:e.target.value})}><option value="">לא לציין</option><option>טוב</option><option>סביר</option><option>מאתגר</option><option>לא בטוח/ה</option></select></label><label>הערה<textarea className={css.field} value={draft.note} onChange={e=>setDraft({...draft,note:e.target.value})}/></label></>}<button className={css.primary+" "+css.wide} type="submit">שמירה</button></form></section>;
}
function Journal({ d, setD, setComposer, remove }) {
  const [filter,setFilter]=useState("all"), [edit,setEdit]=useState(null);
  const entries=useMemo(()=>[...d.meals.map(x=>({...x,type:"food"})),...d.workouts.map(x=>({...x,type:"move"}))].filter(x=>filter==="all"||x.type===filter).sort((a,b)=>(b.date||"").localeCompare(a.date||"")),[d,filter]);
  const grouped=entries.reduce((acc,x)=>{const key=x.date||localISO();(acc[key]??=[]).push(x);return acc;},{});
  const saveEdit=e=>{e.preventDefault();if(!edit.name.trim())return;setD(p=>edit.type==="food"?{...p,meals:p.meals.map(x=>x.id===edit.id?edit:x)}:{...p,workouts:p.workouts.map(x=>x.id===edit.id?edit:x)});setEdit(null);};
  if(edit)return <section className={css.composer}><div className={css.composerHead}><h2>עריכת תיעוד</h2><IconButton label="סגירה" onClick={()=>setEdit(null)}><X/></IconButton></div><form className={css.form} onSubmit={saveEdit}><label>מה היה?<input className={css.field} value={edit.name} onChange={e=>setEdit({...edit,name:e.target.value})}/></label><div className={css.row}><label>תאריך<input className={css.field} dir="ltr" type="date" value={edit.date} onChange={e=>setEdit({...edit,date:e.target.value})}/></label>{edit.type==="move"&&<label>משך<input className={css.field} value={edit.duration||""} onChange={e=>setEdit({...edit,duration:e.target.value})}/></label>}</div><label>הערה<textarea className={css.field} value={edit.note||""} onChange={e=>setEdit({...edit,note:e.target.value})}/></label><button className={css.primary+" "+css.wide}>שמירת שינויים</button></form></section>;
  return <><div className={css.sectionHead}><h2>היומן שלך</h2><button className={css.primary} onClick={()=>setComposer("food")}><CirclePlus size={17}/> תיעוד</button></div><div className={css.journalTabs}><button className={filter==="all"?css.active:""} onClick={()=>setFilter("all")}>הכול</button><button className={filter==="food"?css.active:""} onClick={()=>setFilter("food")}>אוכל</button><button className={filter==="move"?css.active:""} onClick={()=>setFilter("move")}>תנועה</button></div><section className={css.card}>{!entries.length?<Empty>עוד לא נרשם דבר.<br/>אפשר להתחיל בארוחה או בתנועה אחת.</Empty>:Object.entries(grouped).map(([date,items])=><div key={date}><p className={css.eyebrow}>{fmt(date)}</p>{items.map(item=><article className={css.entry} key={item.id}><div className={css.entryTitle}><span className={css.badge+" "+(item.type==="food"?css.food:css.move)}>{item.type==="food"?<Apple size={17}/>:<Dumbbell size={17}/>}</span><div><strong>{item.name}</strong><small>{item.duration||item.feeling||"תיעוד קצר"}{item.note?" · "+item.note:""}</small></div></div><div className={css.entryActions}><button aria-label="עריכה" onClick={()=>setEdit(item)}><Pencil size={17}/></button><button aria-label="מחיקה" onClick={()=>remove(item)}><Trash2 size={17}/></button></div></article>)}</div>)}</section></>;
}
function Plan({ d,setD }) {
 const [text,setText]=useState(""),[date,setDate]=useState(localISO()),[kind,setKind]=useState("move");const items=[...(d.plan||[])].map(x=>({...x,date:x.date||localISO()})).sort((a,b)=>a.date.localeCompare(b.date));
 const add=e=>{e.preventDefault();if(!text.trim())return;setD(p=>({...p,plan:[...p.plan,{id:uid(),text:text.trim(),date,kind,status:"planned"}]}));setText("");};
 const change=(id,status)=>setD(p=>({...p,plan:p.plan.map(x=>x.id===id?{...x,status,date:status==="tomorrow"?addDays(1):x.date}:x)}));
 return <><div className={css.sectionHead}><h2>התוכנית הגמישה שלך</h2></div><p className={css.subtle}>אפשר לדחות, להעביר או לוותר הפעם. זו לא מדידת הצלחה.</p><form className={css.card+" "+css.form} onSubmit={add}><label>פעולה קטנה<input className={css.field} value={text} onChange={e=>setText(e.target.value)} placeholder="למשל הליכה קצרה או להכין ארוחה בבית"/></label><div className={css.row}><label>מתי?<input className={css.field} type="date" dir="ltr" value={date} onChange={e=>setDate(e.target.value)}/></label><label>סוג<select className={css.field} value={kind} onChange={e=>setKind(e.target.value)}><option value="move">תנועה</option><option value="food">תזונה</option><option value="personal">אישי</option></select></label></div><button className={css.secondary}>הוספת פעולה</button></form><section className={css.card}>{!items.length?<Empty>אין תוכנית עדיין. לא צריך לבנות שבוע מושלם — אפשר להתחיל בפעולה אחת.</Empty>:items.map(item=><article className={css.entry} key={item.id}><div><strong>{item.text}</strong><small>{fmt(item.date)} · {item.status==="done"?"בוצע":item.status==="skipped"?"ויתרתי הפעם":item.status==="tomorrow"?"הועבר למחר":"מתוכנן"}</small></div><div className={css.entryActions}><button className={css.status+" "+(item.status==="done"?css.done:"")} onClick={()=>change(item.id,item.status==="done"?"planned":"done")}>{item.status==="done"?<Check size={16}/>:"בוצע"}</button><button className={css.status} onClick={()=>change(item.id,"tomorrow")}>מחר</button><button className={css.status+" "+(item.status==="skipped"?css.skipped:"")} onClick={()=>change(item.id,"skipped")}>לוותר</button></div></article>)}</section></>;
}
function Progress({ d }) {
 const days=Array.from({length:7},(_,i)=>addDays(i-6));const total=days.map(day=>d.meals.filter(x=>x.date===day).length+d.workouts.filter(x=>x.date===day&&!x.skipped).length);const logged=total.filter(Boolean).length, move=d.workouts.filter(x=>days.includes(x.date)&&!x.skipped).length, done=(d.plan||[]).filter(x=>days.includes(x.date||"")&&x.status==="done").length;
 return <><div className={css.sectionHead}><h2>התמונה של השבוע</h2></div><p className={css.subtle}>אין כאן ציון. רק תמונה שתעזור להבין מה עובד עבורך.</p><div className={css.metricGrid}><div className={css.card+" "+css.metric}><span>ימים עם תיעוד</span><strong>{logged}</strong></div><div className={css.card+" "+css.metric}><span>רגעי תנועה</span><strong>{move}</strong></div></div><section className={css.card}><div className={css.barGrid}>{days.map((day,i)=><div className={css.barWrap} key={day}><i className={css.bar} style={{height:(total[i]?Math.min(100,18+total[i]*30):6)+"%"}}/><span>{new Date(day+"T12:00").toLocaleDateString("he-IL",{weekday:"narrow"})}</span></div>)}</div></section><section className={css.card}><strong>{logged?"יש לך "+logged+" ימים עם תיעוד השבוע.":"כשתתעד/י כמה ימים, יתחילו להופיע כאן דפוסים."}</strong><p className={css.subtle}>{done?"נסגרו גם "+done+" פעולות מהתוכנית.":"אפשר להשאיר את זה פשוט גם מחר."}</p></section></>;
}
function SettingsView({ d,setD }) {const [confirm,setConfirm]=useState(false);const exp=()=>{const blob=new Blob([JSON.stringify(d,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="personal-hq-health.json";a.click();URL.revokeObjectURL(a.href)};return <div className={css.stack}><section className={css.card}><h2>פרטיות ומידע</h2><p className={css.subtle}>המידע נשמר בחשבון המאובטח שלך. מידע על מגבלות אינו משמש להצעה אוטומטית.</p><button className={css.secondary} onClick={exp}>ייצוא הנתונים</button></section><section className={css.card}><h2>גבולות המערכת</h2><p className={css.subtle}>כלי לתיעוד והרגלים, לא תחליף לייעוץ רפואי או תזונתי. אם משהו כואב, מחמיר או מרגיש חריג — עוצרים ופונים לאיש מקצוע.</p></section><section className={css.card}><h2>מחיקת הנתונים</h2><p className={css.subtle}>הפעולה מוחקת את כל נתוני חברת האימון והתזונה.</p><button className={css.status+" "+css.skipped} onClick={()=>confirm?(setD(INIT),setConfirm(false)):setConfirm(true)}>{confirm?"לחיצה נוספת למחיקה":"מחיקת כל הנתונים"}</button></section></div>}

export default function HealthApp() {
 const {data:d,setData:setD,ready}=useStore(STORE_KEY,INIT);const [tab,setTab]=useState("today"),[composer,setComposer]=useState(null),[more,setMore]=useState(false),[deleted,setDeleted]=useState(null),[toast,setToast]=useState("");
 const notify=(message)=>{setComposer(null);setToast(message+" יפה שפינית לזה רגע.");setTimeout(()=>setToast(""),5000)};
 const remove=item=>{setD(p=>item.type==="food"?{...p,meals:p.meals.filter(x=>x.id!==item.id)}:{...p,workouts:p.workouts.filter(x=>x.id!==item.id)});setDeleted(item);setToast("הפריט נמחק.");setTimeout(()=>setDeleted(null),7000)};
 const undo=()=>{if(!deleted)return;setD(p=>deleted.type==="food"?{...p,meals:[deleted,...p.meals]}:{...p,workouts:[deleted,...p.workouts]});setDeleted(null);setToast("הפריט הוחזר.");};
 if(!ready)return <div className={css.empty}>טוען את היומן…</div>;
 if(!d.profile.complete)return <div className={css.shell}><Onboarding d={d} setD={setD}/></div>;
 const content=composer?<Composer kind={composer} onClose={()=>setComposer(null)} d={d} setD={setD} onSaved={notify}/>:tab==="today"?<Today d={d} setTab={setTab} setComposer={setComposer}/>:tab==="journal"?<Journal d={d} setD={setD} setComposer={setComposer} remove={remove}/>:tab==="plan"?<Plan d={d} setD={setD}/>:tab==="progress"?<Progress d={d}/>:<SettingsView d={d} setD={setD}/>;
 return <div className={css.shell}><Header tab={tab} setTab={setTab} more={more} setMore={setMore}/><Nav tab={tab} setTab={setTab}/><main className={css.content}>{content}</main>{toast&&<div className={css.toast} role="status"><span>{toast}</span>{deleted&&<button onClick={undo}>ביטול</button>}</div>}</div>;
}
