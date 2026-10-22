"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Activity, Apple, CalendarDays, Check, ChevronLeft, CirclePlus, Dumbbell, MoreHorizontal, Pencil, Settings, Sparkles, Trash2, TrendingUp, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { STORE_KEY, INIT, uid } from "../model";
import { resolveProgram, normalizeProgram, applyLoads } from "../plan.mjs";
import { weekSummary } from "../goals.mjs";
import { startLive } from "../live.mjs";
import { sessionLogEntry } from "../today.mjs";
import { TodayScreen, WorkoutTab } from "./WorkoutFlow";
import LiveWorkout from "./LiveWorkout";
import PlanEditor from "./PlanEditor";
import GoalsView from "./GoalsView";
import PlanBuilder from "./PlanBuilder";
import HevyConnect from "./HevyConnect";
import Coach from "./Coach";
import css from "./health-v2.module.css";

// גל (P1, ביקורת שחרור): 6 פריטים בניווט התחתון צפופים מדי במובייל - עד 5. "תזונה" (יומן
// בלבד, לא חברה מרכזית) עברה ל"עוד" (SettingsView) במקום להיות כפתור ניווט ראשי - סדר
// שאר הפריטים (Today/Workout/Coach/Progress/More) בדיוק כמו שהתבקש.
const NAV = [
  ["today", "היום", Activity],
  ["workout", "אימון", Dumbbell],
  ["coach", "מאמן", Sparkles],
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
    { section:"היעד", key:"goal", title:"מה אתה רוצה להשיג?", help:"אפשר לבחור יותר ממטרה אחת. נשתמש בזה כדי לקבוע סדר עדיפויות, לא כדי לתת סיסמה כללית.", multi:true, options:["לרדת במשקל ולהיות חטוב","להיכנס לכושר לקראת החתונה","לבנות כוח ומסת שריר","לשפר סיבולת","להרגיש יותר אנרגיה","לחזור לכושר","לשפר ביטחון עצמי"] },
    { section:"היעד", key:"goalPriority", title:"אם נצליח רק בדבר אחד ב-90 הימים הקרובים — מה הוא יהיה?", help:"בחירה אחת. היא תכריע בין אימון, תזונה, צעדים והתאוששות כשהכול מתנגש.", options:["לרדת במשקל","להתמיד בשגרה שאני נהנה ממנה","להתחזק באימוני כוח","להרגיש טוב ואנרגטי יותר","להתכונן לאירוע או תאריך"] },
    { section:"היעד", key:"goalHorizon", title:"מה מסגרת הזמן שלך?", help:"נשתמש בה כדי לבנות קצב מציאותי, לא הבטחה לא מציאותית.", options:["אין תאריך — חשוב לי תהליך יציב","עד 3 חודשים","3–6 חודשים","יותר מחצי שנה","יש אירוע קרוב"] },
    { section:"הגוף", key:"currentWeight", title:"מה המשקל הנוכחי שלך בק״ג?", help:"מספר מדויק מאפשר לחשב מגמה אמיתית. אפשר לעדכן אותו אחר כך בכל עת.", kind:"number", inputMode:"decimal", placeholder:"למשל 92", suffix:"ק״ג" },
    { section:"הגוף", key:"targetWeight", title:"לאיזה משקל אתה רוצה להגיע, אם יש לך יעד?", help:"אם אין מספר ברור, בחר ‘עוד לא יודע’ בשלב הבא של היעדים. היעד ניתן לשינוי תמיד.", kind:"number", inputMode:"decimal", placeholder:"למשל 82", suffix:"ק״ג" },
    { section:"הגוף", key:"heightCm", title:"מה הגובה שלך בס״מ?", help:"נשתמש בו רק לתמונת פתיחה ולמדדים שלך.", kind:"number", inputMode:"numeric", placeholder:"למשל 183", suffix:"ס״מ" },
    { section:"הגוף", key:"ageRange", title:"באיזו קבוצת גיל אתה?", help:"זה עוזר להתאים קצב התאוששות כללי. אין צורך בתאריך לידה.", options:["18–24","25–34","35–44","45–54","55+","מעדיף לא לציין"] },
    { section:"בריאות והתאוששות", key:"safety", title:"יש משהו שחשוב לקחת בחשבון לפני שבונים עומס?", help:"אם יש כאב, פציעה, מגבלה רפואית או אי־ודאות — לא נבנה עבורך תוכנית מותאמת אוטומטית. עדיף איש/ת מקצוע.", options:["אין כאב או מגבלה שידועים לי","יש מגבלה ואני כבר מתייעץ עם איש/ת מקצוע","יש כאב או פציעה פעילים","לא בטוח"] },
    { section:"בריאות והתאוששות", key:"sleep", title:"כמה שעות שינה יש לך בדרך כלל בלילה?", help:"בלי התאוששות, עוד נפח אימון לא בהכרח יקדם אותך.", options:["פחות מ-5","5–6","6–7","7–8","יותר מ-8","משתנה מאוד"] },
    { section:"בריאות והתאוששות", key:"stress", title:"איך נראה העומס שלך בתקופה הזו?", help:"התוכנית צריכה להתאים לחיים שלך, לא להתחרות בהם.", options:["נמוך יחסית","בינוני","גבוה","משתנה מאוד"] },
    { section:"אימונים", key:"experience", title:"מה נקודת הפתיחה שלך?", help:"בחירה אחת שתעזור לקבוע נפח וקצב התקדמות התחלתי.", options:["מתחיל מאפס","חוזר אחרי הפסקה","מתאמן לסירוגין","מתאמן קבוע כבר חצי שנה או יותר"] },
    { section:"אימונים", key:"currentFrequency", title:"כמה אימונים ביצעת בפועל בשבוע ממוצע בחודש האחרון?", help:"לא מה שכתוב בתוכנית — מה שבאמת קרה.", options:["0","1","2","3","4","5 או יותר"] },
    { section:"אימונים", key:"place", title:"איפה יש לך גישה להתאמן?", help:"אפשר לבחור יותר מאפשרות אחת.", multi:true, options:["חדר כושר מלא","בית עם משקולות/ספסל","בית בלי ציוד","בחוץ","סטודיו או קבוצה"] },
    { section:"אימונים", key:"availability", title:"כמה אימוני כוח אתה רוצה להתחייב אליהם בשבוע?", help:"זו התחייבות בסיס, לא תקרת זכוכית. נבנה כך שתוכל לנצח גם בשבוע עמוס.", options:["2","3","4","5","עוד לא בטוח"] },
    { section:"אימונים", key:"sessionLength", title:"כמה זמן אמיתי יש לך לאימון כוח?", help:"כולל חימום ומקלחת? חשוב לבחור מציאות ולא גרסה אידאלית שלך.", options:["עד 30 דקות","40–50 דקות","60 דקות","75 דקות או יותר","משתנה"] },
    { section:"אימונים", key:"trainingDays", title:"באילו ימים לרוב אפשר להתאמן?", help:"אפשר לבחור כמה ימים. זה יקבע את פיזור ההתאוששות.", multi:true, options:["א׳","ב׳","ג׳","ד׳","ה׳","ו׳","שבת","משתנה"] },
    { section:"אימונים", key:"trainingTime", title:"מתי הכי נוח לך להתאמן?", help:"אפשר לבחור יותר מחלון אחד.", multi:true, options:["בוקר","צהריים","ערב","לילה","משתנה"] },
    { section:"אימונים", key:"likes", title:"מה אתה באמת נהנה לעשות?", help:"אפשר לבחור כמה. תרגילים שתאהב יקבלו עדיפות בתוכנית.", multi:true, options:["מכונות","משקולות חופשיים","תרגילי גוף","הליכה","אופניים","ריצה","שחייה","אימונים קצרים ומהירים","אימון מובנה ומסודר"] },
    { section:"אימונים", key:"dislikes", title:"מה אתה לא רוצה לראות בתוכנית כברירת מחדל?", help:"אפשר לבחור כמה. אפשר תמיד לשנות את דעתך בהמשך.", multi:true, options:["ריצה","קפיצות","תרגילים על הרצפה","סקוואט/דדליפט חופשי","אימונים ארוכים","חדר כושר עמוס","אימוני קבוצה","קרדיו משעמם"] },
    { section:"אימונים", key:"cardioPreference", title:"איזה אירובי אתה מוכן לעשות בקביעות?", help:"לא חייבים לבחור ריצה. המטרה היא פעילות שאפשר להחזיק לאורך זמן.", multi:true, options:["הליכה בחוץ","הליכון בשיפוע","אופניים","אליפטיקל","שחייה","ספורט עם חברים","לא רוצה אירובי מובנה כרגע"] },
    { section:"יום־יום", key:"stepsBaseline", title:"כמה צעדים יש לך ביום ממוצע?", help:"זה קו ההתחלה; לא נזרוק עליך 10,000 צעדים בלי לדעת איפה אתה היום.", options:["עד 3,000","3,000–5,000","5,000–7,500","7,500–10,000","מעל 10,000","לא יודע"] },
    { section:"יום־יום", key:"workActivity", title:"כמה אתה זז במהלך יום עבודה רגיל?", help:"זה משפיע על יעד הצעדים ועל ההתאוששות.", options:["בעיקר יושב","תערובת של ישיבה ותנועה","עומד/הולך הרבה","עבודה פיזית","משתנה מאוד"] },
    { section:"תזונה", key:"foodPattern", title:"איך נראה האוכל שלך כרגע?", help:"בחר את התיאור הכי קרוב, בלי שיפוט. מכאן נבנה שינוי אחד או שניים, לא דיאטה בלתי אפשרית.", options:["מסודר רוב הזמן","טוב ביום, נשבר בערב","הרבה אוכל בחוץ / משלוחים","מדלג על ארוחות ואז רעב מאוד","משתנה ואין לי שגרה","אני כבר עוקב אחרי תזונה"] },
    { section:"תזונה", key:"mealControl", title:"עד כמה יש לך שליטה על הכנת האוכל?", help:"נבנה תוכנית שמתאימה למציאות שלך.", options:["מכין רוב הארוחות בבית","חלק בבית וחלק בחוץ","בעיקר קונה/מזמין","מישהו אחר מבשל לרוב","משתנה"] },
    { section:"תזונה", key:"nutritionPriority", title:"מה יפיל אותך הכי מהר מתוכנית תזונה?", help:"אפשר לבחור יותר מאפשרות אחת. זה חשוב לא פחות מהקלוריות על הנייר.", multi:true, options:["רעב בין ארוחות","מתוקים","נשנושים בערב","סופי שבוע","אכילה בחוץ","חוסר זמן","אני לא יודע מה לאכול","אין לי בעיה מרכזית"] },
    { section:"ביצוע", key:"comfort", title:"איזה סגנון מעקב יעזור לך לבצע?", help:"נבנה את הדשבורד ואת היעדים סביב זה.", options:["רשימת משימות ברורה","מספרים ומדדים","תוכנית יומית קצרה","גמישות לפי היום","תזכורות ודחיפה"] },
    { section:"ביצוע", key:"checkIn", title:"כמה פעמים בשבוע מתאים לך לבצע בדיקת מצב קצרה?", help:"בדיקה של 2–3 דקות: משקל, צעדים, אימונים ואיך היה השבוע.", options:["פעם בשבוע","פעמיים בשבוע","כל יום","רק כשצריך"] },
  ];
  const [step, setStep] = useState(Math.min(d.profile.onboardingStep || 0, steps.length - 1));
  const [draft, setDraft] = useState(d.profile);
  const [attempted, setAttempted] = useState(false);
  const current = steps[step];
  const selectedValues = Array.isArray(draft[current.key]) ? draft[current.key] : draft[current.key] ? [draft[current.key]] : [];
  const numericValue = Number(draft[current.key]);
  const hasSelection = current.kind === "number" ? (current.key === "heightCm" ? numericValue >= 100 && numericValue <= 250 : numericValue >= 20 && numericValue <= 400) : selectedValues.length > 0;
  const select = value => setDraft(profile => {
    const old = Array.isArray(profile[current.key]) ? profile[current.key] : profile[current.key] ? [profile[current.key]] : [];
    return { ...profile, [current.key]: current.multi ? (old.includes(value) ? old.filter(item => item !== value) : [...old, value]) : value };
  });
  const persist = nextStep => { setD(data => ({ ...data, profile:{ ...data.profile, ...draft, onboardingStep:nextStep } })); setStep(nextStep); };
  const next = () => { if (!hasSelection) { setAttempted(true); return; } setAttempted(false); if (step < steps.length - 1) persist(step + 1); else setD(data => ({ ...data, profile:{ ...data.profile, ...draft, onboardingStep:steps.length, complete:true, editingProfile:false }, goal:{ ...(data.goal || {}), targetKg:Number(draft.targetWeight) || data.goal?.targetKg }, weighIns:(data.weighIns || []).length ? data.weighIns : (Number(draft.currentWeight) ? [{ id:uid(), date:localISO(), kg:Number(draft.currentWeight), createdAt:new Date().toISOString() }] : []) })); };
  const previous = () => { if (step > 0) { setAttempted(false); persist(step - 1); } };
  return <main className={css.onboard}>
    <div className={css.onboardingActions}><button className={css.back} onClick={onExit}>חזרה לדשבורד</button><Link href="/" className={css.back}>חזרה למנכ״ל</Link></div>
    <p className={css.eyebrow}>{current.section} · אבחון לבניית תוכנית אישית · {step + 1} מתוך {steps.length}</p>
    <div className={css.progressLine}>{steps.map((_,i) => <i key={i} className={i <= step ? css.done : ""} />)}</div>
    <section className={css.card+" "+css.stack}>
      <h2 className={css.title}>{current.title}</h2><p className={css.subtle}>{current.help}</p>
      {current.kind === "number" ? <label className={css.questionNumber}>{current.suffix}<input autoFocus className={css.field} type="number" inputMode={current.inputMode} min="1" step={current.inputMode === "decimal" ? "0.1" : "1"} value={draft[current.key] || ""} onChange={e => { setAttempted(false); setDraft(profile => ({ ...profile, [current.key]:e.target.value })); }} placeholder={current.placeholder} /></label> : <div className={css.choiceGrid}>{current.options.map(value => <button key={value} aria-pressed={selectedValues.includes(value)} onClick={() => {setAttempted(false);select(value)}} className={css.choice+" "+(selectedValues.includes(value) ? css.selected : "")}>{value}</button>)}</div>}
      {attempted && <p className={css.validation} role="alert">{current.kind === "number" ? "הזינו מספר תקין כדי להמשיך." : "כדי להמשיך, צריך למלא את השאלה הזו."}</p>}
      <div className={css.onboardingActions}>{step > 0 && <button className={css.secondary} onClick={previous}>חזרה</button>}<button className={css.primary} onClick={next}>{step === steps.length - 1 ? "שמירה ובניית התוכנית" : "המשך"}<ChevronLeft size={18}/></button></div>
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
function SettingsView({ d,setD,editProfile,openHevy,openNutrition }) {const [confirm,setConfirm]=useState(false);const exp=()=>{const blob=new Blob([JSON.stringify(d,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="personal-hq-health.json";a.click();URL.revokeObjectURL(a.href)};return <div className={css.stack}><section className={css.card}><h2>הפרופיל שלי</h2><p className={css.subtle}>פרטי פתיחה והעדפות. אין צורך בפרופיל כדי להתאמן, והוא לא משנה את תוכנית האימונים שלך.</p><button className={css.secondary} onClick={editProfile}>עדכון פרופיל האימונים</button></section><section className={css.card}><h2>תזונה - יומן</h2><p className={css.subtle}>יומן תיעוד ארוחות בלבד - אין תוכנית תזונה או יעדי קלוריות.</p><button className={css.secondary} onClick={openNutrition}>פתיחת היומן</button></section><section className={css.card}><h2>חיבור Hevy</h2><p className={css.subtle}>ייבוא קריאה-בלבד של היסטוריית אימונים מ-Hevy, אם משתמשים בו.</p><button className={css.secondary} onClick={openHevy}>חיבור Hevy</button></section><section className={css.card}><h2>פרטיות ומידע</h2><p className={css.subtle}>המידע נשמר בחשבון המאובטח שלך. מידע על מגבלות אינו משמש להצעה אוטומטית.</p><button className={css.secondary} onClick={exp}>ייצוא הנתונים</button></section><section className={css.card}><h2>גבולות המערכת</h2><p className={css.subtle}>כלי לתיעוד והרגלים, לא תחליף לייעוץ רפואי או תזונתי. אם משהו כואב, מחמיר או מרגיש חריג — עוצרים ופונים לאיש מקצוע.</p></section><section className={css.card}><h2>מחיקת הנתונים</h2><p className={css.subtle}>הפעולה מוחקת את כל נתוני חברת האימון והתזונה.</p><button className={css.status+" "+css.skipped} onClick={()=>confirm?(setD(INIT),setConfirm(false)):setConfirm(true)}>{confirm?"לחיצה נוספת למחיקה":"מחיקת כל הנתונים"}</button></section></div>}

export default function HealthApp() {
 const {data:d,setData:setD,ready}=useStore(STORE_KEY,INIT);const [tab,setTab]=useState("today"),[composer,setComposer]=useState(null),[deleted,setDeleted]=useState(null),[toast,setToast]=useState(""),[liveOpen,setLiveOpen]=useState(false),[exitReq,setExitReq]=useState(null),[planView,setPlanView]=useState(null),[hevyOpen,setHevyOpen]=useState(false);
 // ניווט בזמן אימון חי: לא יוצאים בשקט, מבקשים אישור (או זורקים אימון ריק).
 const navigate = nextTab => { if(liveOpen&&d.liveWorkout){setExitReq({tab:nextTab});return;} setComposer(null); setPlanView(null); setHevyOpen(false); setTab(nextTab); };
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
 const loadPlan=next=>{setD(p=>({...p,programBackup:p.program||p.programBackup,program:next}));setPlanView("editor");toastFor("התוכנית נטענה. אפשר לערוך ולשמור.");};
 const updatePlan=(sid,exId,loads)=>setD(p=>{const cur=normalizeProgram(p.program);return cur?{...p,program:applyLoads(cur,sid,exId,loads,new Date().toISOString())}:p;});
 const live=liveOpen&&d.liveWorkout?<LiveWorkout key={d.liveWorkout.id} initial={d.liveWorkout} today={today} onCommit={l=>setD(p=>({...p,liveWorkout:l}))} onFinish={finishLive} onLeave={leaveLive} exitReq={exitReq} onRequestExit={t=>setExitReq({tab:t})} onDismissExit={()=>setExitReq(null)} onUpdatePlan={updatePlan}/>:null;
 const build=()=>{setComposer(null);setTab("workout");setPlanView("builder");};
 const workoutTab=<><WorkoutTab d={d} onStart={startSession} onResume={()=>setLiveOpen(true)} onEditPlan={()=>setPlanView("editor")} onBuildPlan={()=>setPlanView("builder")}/><Journal d={d} setD={setD} setComposer={setComposer} remove={remove} mode="move"/></>;
 const content=hevyOpen?<HevyConnect d={d} setD={setD} onClose={()=>setHevyOpen(false)} onImported={()=>{setHevyOpen(false);setTab("progress");}}/>:composer?<Composer kind={composer} onClose={()=>setComposer(null)} d={d} setD={setD} onSaved={notify}/>:live?live:planView==="builder"?<PlanBuilder hasExisting={!program.empty} onLoad={loadPlan} onManual={()=>setPlanView("editor")} onClose={()=>setPlanView(null)}/>:planView==="editor"?<PlanEditor program={program} onSave={savePlan} onClose={()=>setPlanView(null)}/>:tab==="today"?<TodayScreen d={d} today={today} onStart={startSession} onResume={()=>setLiveOpen(true)} onLogShort={logShort} onOpenJournal={()=>navigate("workout")} onBuildPlan={build}/>:tab==="workout"?workoutTab:tab==="nutrition"?<NutritionTab d={d} today={today}><Journal d={d} setD={setD} setComposer={setComposer} remove={remove} mode="food"/></NutritionTab>:tab==="progress"?<GoalsView d={d} setD={setD} today={today} uid={uid}/>:tab==="coach"?<Coach d={d} today={today}/>:<SettingsView d={d} setD={setD} editProfile={editProfile} openHevy={()=>setHevyOpen(true)} openNutrition={()=>navigate("nutrition")}/>;
 return <div className={css.shell}><Header/><Nav tab={tab} onNavigate={navigate}/><main className={css.content}>{content}</main>{toast&&<div className={css.toast} role="status"><span>{toast}</span>{deleted&&<button onClick={undo}>ביטול</button>}</div>}</div>;
}
