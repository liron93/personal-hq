
"use client";
import { useState } from "react";
import { Activity, Apple, CalendarDays, Check, CirclePlus, Dumbbell, Pencil, Settings, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { STORE_KEY, INIT, summarize, todayISO, uid } from "./model";
import { INK, BG, CARD, ACCENT, GREEN, MUTED, LINE, cardStyle, primaryBtn, tabBtn } from "@/lib/theme";

const TABS = [
  { id: "today", label: "היום שלי", icon: Activity },
  { id: "plan", label: "תוכנית אימונים", icon: CalendarDays },
  { id: "food", label: "יומן אוכל", icon: Apple },
  { id: "workouts", label: "יומן אימונים", icon: Dumbbell },
  { id: "progress", label: "התקדמות", icon: Activity },
  { id: "settings", label: "הגדרות ומגבלות", icon: Settings },
];

const field = { width: "100%", padding: "12px", minHeight: 44, border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 16, fontFamily: "inherit", background: CARD, color: INK };
const button = { ...primaryBtn, minHeight: 44, borderRadius: 8, justifyContent: "center", fontSize: 15 };
const ghost = { minHeight: 40, border: `1px solid ${LINE}`, borderRadius: 8, background: "transparent", color: INK, padding: "0 12px", cursor: "pointer", fontFamily: "inherit", fontSize: 14 };

function DateField({ value, onChange }) {
  return <input aria-label="תאריך" type="date" value={value} onChange={e => onChange(e.target.value)} style={{ ...field, direction: "ltr" }} />;
}

function ActionRow({ onEdit, onDelete }) {
  return <div style={{ display: "flex", gap: 8 }}>
    <button aria-label="עריכה" onClick={onEdit} style={ghost}><Pencil size={15} /></button>
    <button aria-label="מחיקה" onClick={onDelete} style={{ ...ghost, color: "#A33" }}><Trash2 size={15} /></button>
  </div>;
}

function Onboarding({ d, setD }) {
  const [draft, setDraft] = useState(d.profile);
  const save = () => setD(p => ({ ...p, profile: { ...draft, complete: true } }));
  return <section>
    <p style={{ color: MUTED, margin: "0 0 12px", lineHeight: 1.7 }}>כמה פרטים קצרים יעזרו לסדר את היומן. אפשר לדלג על מה שלא מתאים ולשנות הכול בהמשך.</p>
    <div style={{ display: "grid", gap: 14 }}>
      <label>מה הכיוון שלך כרגע?<select value={draft.goal} onChange={e => setDraft({ ...draft, goal: e.target.value })} style={field}><option value="">בחירה אופציונלית</option><option>לחזור לשגרה</option><option>להרגיש חזק/ה יותר</option><option>להתמיד בפעילות</option><option>לסדר את האכילה</option><option>אחר</option></select></label>
      <label>ניסיון באימון<select value={draft.experience} onChange={e => setDraft({ ...draft, experience: e.target.value })} style={field}><option value="">לא צוין</option><option>מתחיל/ה</option><option>חוזר/ת אחרי הפסקה</option><option>מתאמן/ת באופן קבוע</option></select></label>
      <label>כמה ימים בדרך כלל נוח לך לפנות?<select value={draft.availability} onChange={e => setDraft({ ...draft, availability: e.target.value })} style={field}><option value="">לא צוין</option><option>1–2 ימים</option><option>3–4 ימים</option><option>5 ימים ומעלה</option></select></label>
      <label>ציוד או מסגרת<textarea value={draft.equipment} onChange={e => setDraft({ ...draft, equipment: e.target.value })} placeholder="לדוגמה: חדר כושר, בית, הליכות" style={field} /></label>
      <label>מגבלה או דבר שחשוב שנדע<textarea value={draft.limitations} onChange={e => setDraft({ ...draft, limitations: e.target.value })} placeholder="אפשר להשאיר ריק" style={field} /></label>
      <div style={{ padding: 14, background: "#FFF7ED", borderRadius: 8, lineHeight: 1.6, fontSize: 14 }}>אם יש פציעה חדשה או מחמירה, כאב חזה, התעלפות, הריון/הנקה, מצב רפואי או תרופה רלוונטיים, אלרגיה משמעותית, או קושי סביב אוכל — נשאיר את היומן ניטרלי ולא נציע התאמה אוטומטית. כדאי להתייעץ עם איש/אשת מקצוע.</div>
      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14, lineHeight: 1.5 }}><input type="checkbox" checked={draft.sensitiveFlag} onChange={e => setDraft({ ...draft, sensitiveFlag: e.target.checked })} />יש מידע רגיש שדורש שלא תוצע לי התאמה אוטומטית כרגע</label>
      <button onClick={save} style={button}>שמור והמשך ליומן</button>
    </div>
  </section>;
}

function Today({ d, setD, onTab }) {
  const today = todayISO();
  const meals = d.meals.filter(x => x.date === today).length;
  const workouts = d.workouts.filter(x => x.date === today).length;
  const feedback = meals + workouts === 0 ? "לא צריך לזכור הכול — אפשר להתחיל בדבר אחד שתועד היום." : meals && workouts ? "תועדה ארוחה ופעילות היום. הצעד הבא: להוסיף רק מה שעוד תרצה לזכור." : meals ? "תועדה ארוחה היום. אם מתאים, אפשר לתעד גם תנועה או איך הרגיש היום." : "תועדה פעילות היום. אם מתאים, אפשר לתעד גם ארוחה אחת.";
  return <section style={{ display: "grid", gap: 14 }}>
    <div style={{ background: INK, color: BG, padding: 20, borderRadius: 10 }}><div style={{ opacity: .7, fontSize: 14, marginBottom: 8 }}>היום, {new Date().toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })}</div><strong style={{ fontSize: 22 }}>צעד קטן מספיק להיום.</strong></div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <button onClick={() => onTab("food")} style={{ ...cardStyle, margin: 0, padding: 16, textAlign: "right", cursor: "pointer" }}><Apple color={GREEN} /><div style={{ marginTop: 12, fontWeight: 600 }}>אוכל</div><div style={{ color: MUTED, fontSize: 14 }}>{meals ? `${meals} תועדו היום` : "טרם תועד"}</div></button>
      <button onClick={() => onTab("workouts")} style={{ ...cardStyle, margin: 0, padding: 16, textAlign: "right", cursor: "pointer" }}><Dumbbell color={ACCENT} /><div style={{ marginTop: 12, fontWeight: 600 }}>אימון</div><div style={{ color: MUTED, fontSize: 14 }}>{workouts ? `${workouts} תועדו היום` : "טרם תועד"}</div></button>
    </div>
    <div style={{ ...cardStyle, padding: 16 }}><div style={{ fontSize: 13, color: ACCENT, marginBottom: 6 }}>פידבק להיום</div><div style={{ lineHeight: 1.7 }}>{feedback}</div></div>
    <div style={{ display: "flex", gap: 10 }}><button onClick={() => onTab("food")} style={{ ...button, flex: 1 }}><CirclePlus size={18} /> ארוחה</button><button onClick={() => onTab("workouts")} style={{ ...button, flex: 1 }}><CirclePlus size={18} /> אימון</button></div>
  </section>;
}

function FoodLog({ d, setD }) {
  const [draft, setDraft] = useState({ date: todayISO(), name: "", details: "", portion: "", note: "" });
  const [editing, setEditing] = useState(null);
  const save = () => { if (!draft.name.trim()) return; setD(p => ({ ...p, meals: editing ? p.meals.map(x => x.id === editing ? { ...draft, id: editing } : x) : [{ ...draft, id: uid() }, ...p.meals] })); setDraft({ date: todayISO(), name: "", details: "", portion: "", note: "" }); setEditing(null); };
  const edit = item => { setDraft(item); setEditing(item.id); };
  return <section><p style={{ color: MUTED, lineHeight: 1.7 }}>ארוחה אחת מספיקה להתחלה. הכמות חופשית, ואין חישוב קלוריות או דירוג לארוחות.</p><div style={{ display: "grid", gap: 10, marginBottom: 18 }}><DateField value={draft.date} onChange={v => setDraft({ ...draft, date: v })} /><input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="מה אכלת?" style={field} /><input value={draft.portion} onChange={e => setDraft({ ...draft, portion: e.target.value })} placeholder="כמות או תיאור, אם מתאים" style={field} /><textarea value={draft.details} onChange={e => setDraft({ ...draft, details: e.target.value })} placeholder="מרכיבים או הקשר, אופציונלי" style={field} /><textarea value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} placeholder="הערה, אופציונלי" style={field} /><button onClick={save} style={button}>{editing ? "שמור עריכה" : "תיעוד ארוחה"}</button></div><div style={{ display: "grid", gap: 10 }}>{d.meals.map(item => <div key={item.id} style={{ ...cardStyle, padding: 14 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><div><strong>{item.name}</strong><div style={{ color: MUTED, fontSize: 13 }}>{new Date(item.date + "T12:00").toLocaleDateString("he-IL")}{item.portion ? ` · ${item.portion}` : ""}</div>{[item.details, item.note].filter(Boolean).map(x => <div key={x} style={{ marginTop: 6, fontSize: 14 }}>{x}</div>)}</div><ActionRow onEdit={() => edit(item)} onDelete={() => setD(p => ({ ...p, meals: p.meals.filter(x => x.id !== item.id) }))} /></div></div>)}</div></section>;
}

function WorkoutLog({ d, setD }) {
  const [draft, setDraft] = useState({ date: todayISO(), name: "", duration: "", feeling: "", note: "", skipped: false, skipReason: "" });
  const [editing, setEditing] = useState(null);
  const save = () => { if (!draft.name.trim()) return; setD(p => ({ ...p, workouts: editing ? p.workouts.map(x => x.id === editing ? { ...draft, id: editing } : x) : [{ ...draft, id: uid() }, ...p.workouts] })); setDraft({ date: todayISO(), name: "", duration: "", feeling: "", note: "", skipped: false, skipReason: "" }); setEditing(null); };
  const edit = item => { setDraft(item); setEditing(item.id); };
  return <section><p style={{ color: MUTED, lineHeight: 1.7 }}>תעד סוג פעילות והתחושה שלך. בעתיד אפשר יהיה להוסיף תרגילים, סטים, חזרות, משקל ו־RPE רק אם זה מתאים לך.</p><div style={{ display: "grid", gap: 10, marginBottom: 18 }}><DateField value={draft.date} onChange={v => setDraft({ ...draft, date: v })} /><input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="איזו פעילות או אימון?" style={field} /><input value={draft.duration} onChange={e => setDraft({ ...draft, duration: e.target.value })} placeholder="משך, אופציונלי" style={field} /><select value={draft.feeling} onChange={e => setDraft({ ...draft, feeling: e.target.value })} style={field}><option value="">איך זה הרגיש? אופציונלי</option><option>קל</option><option>סביר</option><option>מאתגר</option><option>לא בטוח/ה</option></select><textarea value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} placeholder="הערה, אופציונלי" style={field} /><label style={{ fontSize: 14 }}><input type="checkbox" checked={draft.skipped} onChange={e => setDraft({ ...draft, skipped: e.target.checked })} /> דילגתי על אימון מתוכנן</label>{draft.skipped && <input value={draft.skipReason} onChange={e => setDraft({ ...draft, skipReason: e.target.value })} placeholder="סיבה, אם בא לך לשתף" style={field} />}<button onClick={save} style={button}>{editing ? "שמור עריכה" : draft.skipped ? "תעד דילוג" : "תיעוד אימון"}</button></div><div style={{ display: "grid", gap: 10 }}>{d.workouts.map(item => <div key={item.id} style={{ ...cardStyle, padding: 14 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><div><strong>{item.skipped ? "דולג: " : ""}{item.name}</strong><div style={{ color: MUTED, fontSize: 13 }}>{new Date(item.date + "T12:00").toLocaleDateString("he-IL")}{item.duration ? ` · ${item.duration}` : ""}{item.feeling ? ` · ${item.feeling}` : ""}</div>{item.note && <div style={{ marginTop: 6, fontSize: 14 }}>{item.note}</div>}{item.skipReason && <div style={{ marginTop: 6, fontSize: 14 }}>{item.skipReason}</div>}</div><ActionRow onEdit={() => edit(item)} onDelete={() => setD(p => ({ ...p, workouts: p.workouts.filter(x => x.id !== item.id) }))} /></div></div>)}</div></section>;
}

function Plan({ d, setD }) {
  const days = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
  const [text, setText] = useState("");
  const [day, setDay] = useState("א׳");
  const add = () => { if (!text.trim()) return; setD(p => ({ ...p, plan: [...p.plan, { id: uid(), day, text: text.trim(), status: "planned" }] })); setText(""); };
  return <section><p style={{ color: MUTED, lineHeight: 1.7 }}>תוכנית בסיסית היא מקום לסדר, לא התחייבות קשיחה. אפשר להזיז, לדלג או למחוק בכל עת.</p><div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 10, marginBottom: 16 }}><select value={day} onChange={e => setDay(e.target.value)} style={field}>{days.map(x => <option key={x}>{x}</option>)}</select><input value={text} onChange={e => setText(e.target.value)} placeholder="פעילות או הרגל לבחירתך" style={field} /></div><button onClick={add} style={{ ...button, width: "100%", marginBottom: 16 }}>הוסף לתוכנית</button><div style={{ display: "grid", gap: 8 }}>{days.map(dayName => <div key={dayName} style={{ ...cardStyle, padding: 12 }}><strong>{dayName}</strong>{d.plan.filter(x => x.day === dayName).map(item => <div key={item.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, paddingTop: 10 }}><span style={{ textDecoration: item.status === "done" ? "line-through" : "none" }}>{item.text}</span><div style={{ display: "flex", gap: 6 }}><button onClick={() => setD(p => ({ ...p, plan: p.plan.map(x => x.id === item.id ? { ...x, status: x.status === "done" ? "planned" : "done" } : x) }))} style={ghost}>{item.status === "done" ? <Check size={16} /> : "סיימתי"}</button><button onClick={() => setD(p => ({ ...p, plan: p.plan.filter(x => x.id !== item.id) }))} style={ghost}><Trash2 size={15} /></button></div></div>)}</div>)}</div></section>;
}

function Progress({ d }) {
  const s = summarize(d);
  return <section style={{ display: "grid", gap: 12 }}><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}><Metric label="ארוחות שתועדו השבוע" value={s.weekMeals} /><Metric label="אימונים שתועדו השבוע" value={s.weekWorkouts} /></div><div style={{ ...cardStyle, padding: 16 }}><div style={{ color: ACCENT, fontSize: 13, marginBottom: 8 }}>מבט שבועי</div><p style={{ margin: 0, lineHeight: 1.7 }}>{s.weekMeals + s.weekWorkouts ? "יש כבר נתונים שמתחילים לספר מה עבד עבורך השבוע. השינוי הבא, אם יוצע, תמיד יגיע לבדיקה שלך." : "כשתתעד כמה ימים, יתחילו להופיע כאן דפוסים. לא שופטים שבוע בודד."}</p></div><div style={{ ...cardStyle, padding: 16 }}><div style={{ color: ACCENT, fontSize: 13, marginBottom: 8 }}>סיכום נפרד</div><div>תזונה: {s.weekMeals ? `${s.weekMeals} תיעודים` : "אין תיעודים עדיין"}</div><div style={{ marginTop: 6 }}>אימון: {s.weekWorkouts ? `${s.weekWorkouts} תיעודים` : "אין תיעודים עדיין"}</div></div></section>;
}

function Metric({ label, value }) { return <div style={{ ...cardStyle, margin: 0, padding: 14 }}><div style={{ color: MUTED, fontSize: 13 }}>{label}</div><div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>{value}</div></div>; }

function SettingsTab({ d, setD }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const exportData = () => { const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "personal-hq-health.json"; link.click(); URL.revokeObjectURL(link.href); };
  const wipe = () => { if (!confirmDelete) return setConfirmDelete(true); setD(INIT); setConfirmDelete(false); };
  return <section style={{ display: "grid", gap: 14 }}><div style={{ ...cardStyle, padding: 16 }}><strong>המידע שלך</strong><p style={{ color: MUTED, lineHeight: 1.7 }}>היומן נשמר במכשיר הנוכחי. בלי התחברות הוא אינו נשלח לענן. מידע רגיש משמש רק להצגת גבולות בטוחים בתוך המערכת, ואינו נשלח למודל חיצוני כברירת מחדל.</p><button onClick={exportData} style={ghost}>ייצוא הנתונים שלי</button></div><div style={{ ...cardStyle, padding: 16 }}><strong>מחיקת נתונים</strong><p style={{ color: MUTED, lineHeight: 1.7 }}>הפעולה מאפסת את יומן האוכל, האימונים, התוכנית וההגדרות של חברת האימון והתזונה.</p><button onClick={wipe} style={{ ...ghost, color: "#A33" }}>{confirmDelete ? "לחיצה נוספת למחיקה" : "מחיקת כל הנתונים"}</button></div></section>;
}

export default function Company() {
  const { data: d, setData: setD, ready } = useStore(STORE_KEY, INIT);
  const [tab, setTab] = useState("today");
  if (!ready) return <div style={{ padding: 40, textAlign: "center", color: MUTED }}>טוען...</div>;
  const content = !d.profile.complete ? <Onboarding d={d} setD={setD} /> : tab === "today" ? <Today d={d} setD={setD} onTab={setTab} /> : tab === "plan" ? <Plan d={d} setD={setD} /> : tab === "food" ? <FoodLog d={d} setD={setD} /> : tab === "workouts" ? <WorkoutLog d={d} setD={setD} /> : tab === "progress" ? <Progress d={d} /> : <SettingsTab d={d} setD={setD} />;
  return <div><div style={{ display: "flex", overflowX: "auto", gap: 4, marginBottom: 18 }}>{TABS.map(item => <button key={item.id} onClick={() => setTab(item.id)} style={tabBtn(tab === item.id)}>{item.label}</button>)}</div>{!d.profile.complete && <div style={{ color: ACCENT, fontSize: 13, marginBottom: 12 }}>קליטה ראשונית</div>}{content}</div>;
}
