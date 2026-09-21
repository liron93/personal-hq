"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Activity, Apple, CalendarDays, Check, ChevronLeft, CirclePlus, Dumbbell, MoreHorizontal, Pencil, Settings, Trash2, TrendingUp, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { STORE_KEY, INIT, uid } from "../model";
import { resolveProgram } from "../plan.mjs";
import { weekSummary } from "../goals.mjs";
import { startLive } from "../live.mjs";
import { sessionLogEntry } from "../today.mjs";
import { TodayScreen, WorkoutTab } from "./WorkoutFlow";
import LiveWorkout from "./LiveWorkout";
import PlanEditor from "./PlanEditor";
import GoalsView from "./GoalsView";
import PlanBuilder from "./PlanBuilder";
import css from "./health-v2.module.css";

const NAV = [
  ["today", "היום", Activity],
  ["workout", "אימון", Dumbbell],
  ["nutrition", "תזונה", Apple],
  ["progress", "התקדמות", TrendingUp],
  ["more", "עוד", MoreHorizontal],
];
const localISO = () => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const fmt = value => new Date(value + "T12:00").toLocaleDateString("he-IL", { weekday:"short", day:"numeric", month:"short" });
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0,10); };

function Empty({ children }) { return <div className={css.empty}>{children}</div>; }
function IconButton({ label, children, ...props }) { return <button aria-label={label} className={css.iconButton} {...props}>{children}</button>; }
function Header() { return <header className={css.header}><div><Link href="/" className={css.back}>חזרה למנכ״ל</Link><p className={css.eyebrow}>מרחב האימון והתזונה שלך</p><h1 className={css.title}>אימון ותזונה</h1></div></header>; }
function Nav({ tab, onNavigate }) { return <><aside className={css.desktopAside}>{NAV.map(([id,label,Icon])=><button key={id} onClick={()=>onNavigate(id)} className={tab===id?css.active:""}><Icon size={18}/> {label}</button>)}</aside><nav className={css.bottomNav} aria-label="ניווט חברת אימון ותזונה">{NAV.map(([id,label,Icon])=><button key={id} onClick={()=>onNavigate(id)} className={css.navItem+" "+(tab===id?css.active:"")} aria-current={tab===id?"page":undefined}><Icon/><span>{label}</span></button>)}</nav></>; }

function Onboarding({ d, setD, onExit }) {
  const steps = [
    { key:"goal", title:"מה חשוב לך להשיג?", help:"אפשר לבחור יותר ממטרה אחת.", multi:true, options:["להיכנס לכושר לקראת החתונה","לבנות כוח ומסת שריר","לרדת במשקל","לחזור לכושר","להרגיש יותר אנרגיה","לשפר ביטחון עצמי","לשפר סיבולת"] },
    { key:"focus", title:"מה תרצה/י לכלול בתוכנית?", help:"אפשר לבחור כמה כיוונים.", multi:true, options:["אימוני כוח","כושר אירובי","ניידות וגמישות","תזונה והרגלים","שילוב מאוזן","רק להתחיל בעדינות"] },
    { key:"experience", title:"מה נקודת הפתיחה שלך?", help:"בחירה אחת שתעזור לקבוע קצב התחלתי.", options:["מתחיל/ה מאפס","חוזר/ת אחרי הפסקה","מתאמן/ת לסירוגין","מתאמן/ת קבוע"] },
    { key:"place", title:"איפה נוח לך להתאמן?", help:"אפשר לבחור יותר מאפשרות אחת.", multi:true, options:["חדר כושר","בבית עם ציוד","בבית בלי ציוד","בחוץ","סטודיו או קבוצה"] },
    { key:"availability", title:"כמה אימונים ריאליים בשבוע?", help:"נבנה סביב מה שאפשר לשמור עליו.", options:["1","2","3","4","5 או יותר","עדיין לא יודע/ת"] },
    { key:"sessionLength", title:"כמה זמן יש לך לאימון?", help:"נעדיף זמן אמיתי על תוכנית מושלמת.", options:["10–15 דקות","20–30 דקות","40–45 דקות","שעה או יותר","משתנה"] },
    { key:"trainingDays", title:"באילו ימים בדרך כלל אפשר?", help:"אפשר לבחור כמה ימים; אפשר לשנות בכל שבוע.", multi:true, options:["א׳","ב׳","ג׳","ד׳","ה׳","ו׳","שבת","משתנה"] },
    { key:"trainingTime", title:"מתי הכי נוח לך להתאמן?", help:"אפשר לבחור יותר מחלון זמן אחד.", multi:true, options:["בוקר","צהריים","ערב","לילה","משתנה"] },
    { key:"comfort", title:"איזה סגנון מרגיש לך נכון?", help:"המערכת תעדיף פעולות שמתאימות לך.", options:["קצר ופשוט","מובנה ומסודר","גמיש לפי היום","עם תזכורות","לנסות ולגלות"] },
    { key:"likes", title:"אילו פעילויות אתה אוהב?", help:"אפשר לבחור כמה, כדי שהתוכנית תהיה כזו שתרצה באמת לבצע.", multi:true, options:["הליכה","ריצה","אימוני כוח","מכונות","משקולות חופשיים","תרגילי משקל גוף","אופניים","שחייה","יוגה / פילאטיס"] },
    { key:"dislikes", title:"מה פחות מתאים לך?", help:"אפשר לבחור כמה; נמנע מלהכניס אותם כברירת מחדל.", multi:true, options:["ריצה","קפיצות","תרגילים על הרצפה","חדר כושר עמוס","אימונים ארוכים","אימוני קבוצה","לא בטוח/ה"] },
    { key:"stepsBaseline", title:"כמה צעדים יש לך ביום ממוצע?", help:"זה רק קו פתיחה ליעד אישי שניתן לשנות.", options:["עד 3,000","3,000–5,000","5,000–7,500","7,500–10,000","מעל 10,000","לא יודע/ת"] },
    { key:"safety", title:"יש משהו שחשוב לקחת בחשבון?", help:"אם יש כאב, פציעה או מגבלה — לא בונים כאן תוכנית מותאמת. כדאי להתייעץ עם איש/ת מקצוע.", options:["לא ידוע לי על מגבלה","יש מגבלה ואני מתייעץ/ת עם איש מקצוע","לא בטוח/ה"] },
  ];
  const [step, setStep] = useState(Math.min(d.profile.onboardingStep || 0, steps.length - 1));
  const [draft, setDraft] = useState(d.profile);
  const [attempted, setAttempted] = useState(false);
  const current = steps[step];
  const selectedValues = Array.isArray(draft[current.key]) ? draft[current.key] : draft[current.key] ? [draft[current.key]] : [];
  const hasSelection = selectedValues.length > 0;
  const select = value => setDraft(profile => {
    const old = Array.isArray(profile[current.key]) ? profile[current.key] : profile[current.key] ? [profile[current.key]] : [];
    return { ...profile, [current.key]: current.multi ? (old.includes(value) ? old.filter(item => item !== value) : [...old, value]) : value };
  });
  const persist = nextStep => { setD(data => ({ ...data, profile:{ ...data.profile, ...draft, onboardingStep:nextStep } })); setStep(nextStep); };
  const next = () => { if (!hasSelection) { setAttempted(true); return; } setAttempted(false); if (step < steps.length - 1) persist(step + 1); else setD(data => ({ ...data, profile:{ ...data.profile, ...draft, onboardingStep:steps.length, complete:true, editingProfile:false } })); };
  const previous = () => { if (step > 0) { setAttempted(false); persist(step - 1); } };
  return <main className={css.onboard}>
    <div className={css.onboardingActions}><button className={css.back} onClick={onExit}>חזרה לדשבורד</button><Link href="/" className={css.back}>חזרה למנכ״ל</Link></div>
    <p className={css.eyebrow}>פרופיל האימונים שלך · {step + 1} מתוך {steps.length}</p>
    <div className={css.progressLine}>{steps.map((_,i) => <i key={i} className={i <= step ? css.done : ""} />)}</div>
    <section className={css.card+" "+css.stack}>
      <h2 className={css.title}>{current.title}</h2><p className={css.subtle}>{current.help}</p>
      <div className={css.choiceGrid}>{current.options.map(value => <button key={value} aria-pressed={selectedValues.includes(value)} onClick={() => {setAttempted(false);select(value)}} className={css.choice+" "+(selectedValues.includes(value) ? css.selected : "")}>{value}</button>)}</div>
      {attempted && <p className={css.validation} role="alert">כדי להמשיך, צריך לבחור לפחות אפשרות אחת.</p>}
      <div className={css.onboardingActions}>{step > 0 && <button className={css.secondary} onClick={previous}>חזרה</button>}<button className={css.primary} onClick={next}>{step === steps.length - 1 ? "בניית התוכנית" : "המשך"}<ChevronLeft size={18}/></button></div>
    </section>
  </main>;
}
function Composer({ kind, onClose, d, setD, onSaved }) {
  const [type,setType]=useState(kind === "walk" ? "move" : kind || "food"),[more,setMore]=useState(false),[draft,setDraft]=useState({name:kind === "walk" ? "הליכה" : "",date:localISO(),duration:"",note:"",feeling:""});
  const save=e=>{e.preventDefault();if(!draft.name.trim())return; const item={...draft,id:uid(),createdAt:new Date().toISOString()};setD(p=>type==="food"?{...p,meals:[item,...p.meals]}:{...p,workouts:[item,...p.workouts]});onSaved(type==="food"?"הארוחה נרשמה.":"הפעילות נרשמה.");};
  return <section className={css.composer}><div className={css.composerHead}><h2>תיעוד מהיר</h2><IconButton label="סגירה" onClick={onClose}><X size={18}/></IconButton></div><div className={css.toggle}><button onClick={()=>setType("food")} className={type==="food"?css.active:""}>🍽️ אוכל</button><button onClick={()=>setType("move")} className={type==="move"?css.active:""}>🚶 תנועה</button></div><form className={css.form} onSubmit={save}><label>{type==="food"?"מה היה?":"מה עשית?"}<input autoFocus className={css.field} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})} placeholder={type==="food"?"למשל כריך, קפה או ארוחה בבית":"למשל הליכה, חדר כושר או מתיחות"}/></label>{type==="move"&&<label>משך, אם מתאים<select className={css.field} value={draft.duration} onChange={e=>setDraft({...draft,duration:e.target.value})}><option value="">לא לציין</option><option>10 דקות</option><option>20 דקות</option><option>30 דקות</option><option>אחר</option></select></label>}<button type="button" className={css.optional} onClick={()=>setMore(!more)}>{more?"פחות פרטים":"הוספת פרטים"}</button>{more&&<><label>תאריך<input className={css.field} dir="ltr" type="date" value={draft.date} onChange={e=>setDraft({...draft,date:e.target.value})}/></label><label>איך הרגיש לך?<select className={css.field} value={draft.feeling} onChange={e=>setDraft({...draft,feeling:e.target.value})}><option value="">לא לציין</option><option>טוב</option><option>סביר</option><option>מאתגר</option><option>לא בטוח/ה</option></select></label><label>הערה<textarea className={css.field} value={draft.note} onChange={e=>setDraft({...draft,note:e.target.value})}/></label></>}<button className={css.primary+" "+css.wide} type="submit">שמירה</button></form></section>;
}
function Journal({ d, setD, setComposer, remove, mode }) {
  const [filter,setFilter]=useState(mode||"all"), [edit,setEdit]=useState(null);
  const entries=useMemo(()=>[...d.meals.map(x=>({...x,type:"food"})),...d.workouts.map(x=>({...x,type:"move"}))].filter(x=>filter==="all"||x.type===filter).sort((a,b)=>(b.date||"").localeCompare(a.date||"")),[d,filter]);
  const grouped=entries.reduce((acc,x)=>{const key=x.date||localISO();(acc[key]??=[]).push(x);return acc;},{});
  const saveEdit=e=>{e.preventDefault();if(!edit.name.trim())return;setD(p=>edit.type==="food"?{...p,meals:p.meals.map(x=>x.id===edit.id?edit:x)}:{...p,workouts:p.workouts.map(x=>x.id===edit.id?edit:x)});setEdit(null);};
  if(edit)return <section className={css.composer}><div className={css.composerHead}><h2>עריכת תיעוד</h2><IconButton label="סגירה" onClick={()=>setEdit(null)}><X/></IconButton></div><form className={css.form} onSubmit={saveEdit}><label>מה היה?<input className={css.field} value={edit.name} onChange={e=>setEdit({...edit,name:e.target.value})}/></label><div className={css.row}><label>תאריך<input className={css.field} dir="ltr" type="date" value={edit.date} onChange={e=>setEdit({...edit,date:e.target.value})}/></label>{edit.type==="move"&&<label>משך<input className={css.field} value={edit.duration||""} onChange={e=>setEdit({...edit,duration:e.target.value})}/></label>}</div><label>הערה<textarea className={css.field} value={edit.note||""} onChange={e=>setEdit({...edit,note:e.target.value})}/></label><button className={css.primary+" "+css.wide}>שמירת שינויים</button></form></section>;
  return <><div className={css.sectionHead}><h2>{mode==="food"?"מה תיעדת":mode==="move"?"היסטוריית פעילות":"היומן שלך"}</h2><button className={css.primary} onClick={()=>setComposer(mode||"food")}><CirclePlus size={17}/> תיעוד</button></div>{!mode&&<div className={css.journalTabs}><button className={filter==="all"?css.active:""} onClick={()=>setFilter("all")}>הכול</button><button className={filter==="food"?css.active:""} onClick={()=>setFilter("food")}>אוכל</button><button className={filter==="move"?css.active:""} onClick={()=>setFilter("move")}>תנועה</button></div>}<section className={css.card}>{!entries.length?<Empty>עוד לא נרשם דבר.<br/>אפשר להתחיל בארוחה או בתנועה אחת.</Empty>:Object.entries(grouped).map(([date,items])=><div key={date}><p className={css.eyebrow}>{fmt(date)}</p>{items.map(item=><article className={css.entry} key={item.id}><div className={css.entryTitle}><span className={css.badge+" "+(item.type==="food"?css.food:css.move)}>{item.type==="food"?<Apple size={17}/>:<Dumbbell size={17}/>}</span><div><strong>{item.name}</strong><small>{item.duration||item.feeling||"תיעוד קצר"}{item.note?" · "+item.note:""}</small></div></div><div className={css.entryActions}><button aria-label="עריכה" onClick={()=>setEdit(item)}><Pencil size={17}/></button><button aria-label="מחיקה" onClick={()=>remove(item)}><Trash2 size={17}/></button></div></article>)}</div>)}</section></>;
}
function NutritionTab({ d, today, children }) { const w=weekSummary(d,today); return <div className={css.stack}><section className={css.card}><div className={css.weekLine}><span>ימי תיעוד אוכל השבוע</span><strong>{w.foodDays}{w.foodGoal?" מתוך "+w.foodGoal:""}</strong></div><p className={css.subtle}>כאן מוצג מה שתיעדת בלבד. אין ספירת קלוריות או תפריט.</p></section>{children}</div>; }
function SettingsView({ d,setD,editProfile }) {const [confirm,setConfirm]=useState(false);const exp=()=>{const blob=new Blob([JSON.stringify(d,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="personal-hq-health.json";a.click();URL.revokeObjectURL(a.href)};return <div className={css.stack}><section className={css.card}><h2>הפרופיל שלי</h2><p className={css.subtle}>פרטי פתיחה והעדפות. אין צורך בפרופיל כדי להתאמן, והוא לא משנה את תוכנית האימונים שלך.</p><button className={css.secondary} onClick={editProfile}>עדכון פרופיל האימונים</button></section><section className={css.card}><h2>פרטיות ומידע</h2><p className={css.subtle}>המידע נשמר בחשבון המאובטח שלך. מידע על מגבלות אינו משמש להצעה אוטומטית.</p><button className={css.secondary} onClick={exp}>ייצוא הנתונים</button></section><section className={css.card}><h2>גבולות המערכת</h2><p className={css.subtle}>כלי לתיעוד והרגלים, לא תחליף לייעוץ רפואי או תזונתי. אם משהו כואב, מחמיר או מרגיש חריג — עוצרים ופונים לאיש מקצוע.</p></section><section className={css.card}><h2>מחיקת הנתונים</h2><p className={css.subtle}>הפעולה מוחקת את כל נתוני חברת האימון והתזונה.</p><button className={css.status+" "+css.skipped} onClick={()=>confirm?(setD(INIT),setConfirm(false)):setConfirm(true)}>{confirm?"לחיצה נוספת למחיקה":"מחיקת כל הנתונים"}</button></section></div>}

export default function HealthApp() {
 const {data:d,setData:setD,ready}=useStore(STORE_KEY,INIT);const [tab,setTab]=useState("today"),[composer,setComposer]=useState(null),[deleted,setDeleted]=useState(null),[toast,setToast]=useState(""),[liveOpen,setLiveOpen]=useState(false),[exitReq,setExitReq]=useState(null),[planView,setPlanView]=useState(null);
 // ניווט בזמן אימון חי: לא יוצאים בשקט, מבקשים אישור (או זורקים אימון ריק).
 const navigate = nextTab => { if(liveOpen&&d.liveWorkout){setExitReq({tab:nextTab});return;} setComposer(null); setPlanView(null); setTab(nextTab); };
 // עדכון פרופיל נפתח רק מ"עוד", ביוזמת המשתמש. לא משנים את complete.
 const editProfile = () => setD(data => ({ ...data, profile:{ ...data.profile, onboardingStep:0, editingProfile:true } }));
 const exitProfileEdit = () => setD(data => ({ ...data, profile:{ ...data.profile, editingProfile:false } }));
 const notify=(message)=>{setComposer(null);setToast(message+" יפה שפינית לזה רגע.");setTimeout(()=>setToast(""),5000)};
 const remove=item=>{setD(p=>item.type==="food"?{...p,meals:p.meals.filter(x=>x.id!==item.id)}:{...p,workouts:p.workouts.filter(x=>x.id!==item.id)});setDeleted(item);setToast("הפריט נמחק.");setTimeout(()=>setDeleted(null),7000)};
 const undo=()=>{if(!deleted)return;setD(p=>deleted.type==="food"?{...p,meals:[deleted,...p.meals]}:{...p,workouts:[deleted,...p.workouts]});setDeleted(null);setToast("הפריט הוחזר.");};
 if(!ready)return <div className={css.empty}>טוען את היומן…</div>;
 if(d.profile.editingProfile)return <div className={css.shell}><Onboarding d={d} setD={setD} onExit={exitProfileEdit}/></div>;
 const today=localISO();
 const toastFor=msg=>{setToast(msg);setTimeout(()=>setToast(""),5000)};
 const program=resolveProgram(d);
 const startSession=id=>{setComposer(null);if(d.liveWorkout){setLiveOpen(true);return;}const live=startLive(program,id,{id:uid(),now:Date.now(),workouts:d.workouts});if(!live)return;setD(p=>({...p,liveWorkout:live}));setLiveOpen(true);};
 const logShort=()=>{setD(p=>({...p,workouts:[sessionLogEntry(null,{today,id:uid(),now:new Date().toISOString(),short:true}),...p.workouts]}));toastFor("האימון הקצר נרשם. צעד קטן נספר.");};
 const finishLive=entry=>{setD(p=>({...p,workouts:[entry,...p.workouts],liveWorkout:null}));setLiveOpen(false);setExitReq(null);setTab("today");toastFor("אימון "+entry.session+" נשמר ביומן. כל הכבוד.");};
 // keep=false: אימון שבוטל או ריק נמחק; keep=true: נשאר ב-data.liveWorkout וניתן להמשיך.
 const leaveLive=(nextTab,keep)=>{if(!keep)setD(p=>({...p,liveWorkout:null}));setLiveOpen(false);setExitReq(null);setComposer(null);setPlanView(null);setTab(nextTab||"today");};
 const savePlan=next=>{setD(p=>({...p,program:next}));setPlanView(null);toastFor("התוכנית נשמרה.");};
 const loadPlan=next=>{setD(p=>({...p,program:next}));setPlanView("editor");toastFor("התוכנית נטענה. אפשר לערוך ולשמור.");};
 const live=liveOpen&&d.liveWorkout?<LiveWorkout key={d.liveWorkout.id} initial={d.liveWorkout} today={today} onCommit={l=>setD(p=>({...p,liveWorkout:l}))} onFinish={finishLive} onLeave={leaveLive} exitReq={exitReq} onRequestExit={t=>setExitReq({tab:t})} onDismissExit={()=>setExitReq(null)}/>:null;
 const build=()=>{setComposer(null);setTab("workout");setPlanView("builder");};
 const workoutTab=<><WorkoutTab d={d} onStart={startSession} onResume={()=>setLiveOpen(true)} onEditPlan={()=>setPlanView("editor")} onBuildPlan={()=>setPlanView("builder")}/><Journal d={d} setD={setD} setComposer={setComposer} remove={remove} mode="move"/></>;
 const content=composer?<Composer kind={composer} onClose={()=>setComposer(null)} d={d} setD={setD} onSaved={notify}/>:live?live:planView==="builder"?<PlanBuilder onLoad={loadPlan} onManual={()=>setPlanView("editor")} onClose={()=>setPlanView(null)}/>:planView==="editor"?<PlanEditor program={program} onSave={savePlan} onClose={()=>setPlanView(null)}/>:tab==="today"?<TodayScreen d={d} today={today} onStart={startSession} onResume={()=>setLiveOpen(true)} onLogShort={logShort} onOpenJournal={()=>navigate("workout")} onBuildPlan={build}/>:tab==="workout"?workoutTab:tab==="nutrition"?<NutritionTab d={d} today={today}><Journal d={d} setD={setD} setComposer={setComposer} remove={remove} mode="food"/></NutritionTab>:tab==="progress"?<GoalsView d={d} setD={setD} today={today} uid={uid}/>:<SettingsView d={d} setD={setD} editProfile={editProfile}/>;
 return <div className={css.shell}><Header/><Nav tab={tab} onNavigate={navigate}/><main className={css.content}>{content}</main>{toast&&<div className={css.toast} role="status"><span>{toast}</span>{deleted&&<button onClick={undo}>ביטול</button>}</div>}</div>;
}
