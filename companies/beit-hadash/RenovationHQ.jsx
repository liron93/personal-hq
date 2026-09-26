"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, ExternalLink, AlertTriangle, Upload, X, Pencil, ChevronDown, Search } from "lucide-react";
import { useStore, cp } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { ACCEPT_ATTR, CUSTOM_CATEGORY, DOC_CATEGORIES, createHomeDocuments, formatSize, messageFor, objectPath, validateUpload } from "@/lib/home-documents";
import { STORE_KEY, INIT, DEFAULT_CHECKLIST, CHECKLIST_GROUPS, INSPIRATION_GROUPS, LINE_STATUSES, itemTotal, linesTotal } from "./model";
import ImageAttachments, { ImageBadge, ImageStrip, purgeImages, useImageTracker } from "./ImageAttachments";
import { imagesOf } from "./images";
import "./renovation-v2.css";

const NAV = [
  ["dash", "חדר מצב"], ["plan", "תוכנית וזמן"], ["items", "תקציב ורכש"],
  ["suppliers", "ספקים"], ["docs", "מסמכים ובדק"], ["checklist", "צ'ק ליסט"], ["inspirations", "השראות"],
];
const rooms = ["כניסה", "סלון", "מטבח", "פינת אוכל", "מרפסת", "חדר הורים", "חדר ילדים", "חדר עבודה", "חדר רחצה", "שירותי אורחים", "כביסה / מחסן", "מערכות"];
const categories = ["מיזוג", "חשמל ותאורה", "נגרות", "ריהוט", "פרקט וריצוף", "מוצרי חשמל", "צביעה וגמרים", "תקשורת", "אחר"];

const money = n => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(Number(n || 0));
const emptyLine = () => ({ id: crypto.randomUUID(), name: "", model: "", qty: 1, price: 0, link: "", status: "לבדיקה", note: "" });
const emptyItem = () => ({ id: crypto.randomUUID(), lines: [], name: "", room: rooms[0], category: categories[0], supplierId: "", supplierName: "", isCustomSupplier: false, isCustomCategory: false, estimate: 0, finalCost: 0, status: "לבחירה", dueDate: "", reminderDaysBefore: "", reminderNote: "", reminderDone: false, link: "", note: "", payments: [], files: [], beforeMove: true, updatedAt: new Date().toISOString() });
const emptySupplier = () => ({ id: crypto.randomUUID(), name: "", trade: "", phone: "", note: "", quoteUrl: "", documentUrl: "" });
// משלים שדות שנוספו אחרי שהנתונים נשמרו (צ'ק ליסט, קטגוריות, השראות); לא נוגע במה שכבר קיים,
// כך שמחיקת כל הפריטים נשארת מחוקה. מחזיר את אותו אובייקט כשאין מה להשלים.
function complete(data) {
  const checklist = Array.isArray(data.checklist) ? data.checklist : cp(DEFAULT_CHECKLIST);
  const categories = Array.isArray(data.checklistCategories) ? data.checklistCategories : cp(CHECKLIST_GROUPS);
  const inspirations = Array.isArray(data.inspirations) ? data.inspirations : [];
  const inspirationCategories = Array.isArray(data.inspirationCategories) ? data.inspirationCategories : cp(INSPIRATION_GROUPS);
  return checklist === data.checklist && categories === data.checklistCategories && inspirations === data.inspirations && inspirationCategories === data.inspirationCategories
    ? data : { ...data, checklist, checklistCategories: categories, inspirations, inspirationCategories };
}
function ensure(data) {
  if (data?.renovationV2) return complete(data);
  const legacy = data?.reno || [];
  return complete({ renovationV2: true, items: legacy.map(x => ({ ...emptyItem(), id: String(x.id), name: x.n || "", category: x.cat || "אחר", estimate: x.est || 0, finalCost: x.act || 0, note: x.note || "", link: x.link || "", payments: x.advance ? [{ id: crypto.randomUUID(), amount: x.advance, date: "", note: "מקדמה שהועברה מהמערכת הקודמת" }] : [], status: x.done ? "הושלם" : "לבחירה" })), suppliers: [], milestones: [{ id: "handover", name: "קבלת מפתח", date: "", status: "דורש אימות", blocker: "יש לאמת שנה ומועד" }, { id: "move", name: "כניסה לדירה", date: "", status: "דורש אימות", blocker: "יש לאמת שנה ומועד" }], documents: [] });
}
function setState(setData, updater) { setData(prev => ({ ...prev, ...updater(ensure(cp(prev))) })); }
function Btn({ children, onClick, secondary, disabled }) { return <button className={secondary ? "renovation-btn renovation-btn-secondary" : "renovation-btn"} disabled={disabled} onClick={onClick} style={{ minHeight: 44, border: secondary ? "1px solid #DCE3DE" : "none", borderRadius: 10, padding: "0 14px", background: secondary ? "#fff" : "#256B57", color: secondary ? "#18231E" : "#fff", font: "inherit", cursor: disabled ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 7 }}>{children}</button>; }
function Card({ children, style, className = "" }) { return <section className={`renovation-card ${className}`} style={{ background: "#fff", border: "1px solid #DCE3DE", borderRadius: 14, padding: 16, ...style }}>{children}</section>; }
function Field({ label, children }) { return <label style={{ display: "grid", gap: 5, fontSize: 14, color: "#44514A" }}><span>{label}</span>{children}</label>; }
const input = { minHeight: 44, width: "100%", border: "1px solid #C9D3CC", borderRadius: 9, padding: "0 10px", background: "#fff", font: "inherit", fontSize: 16, color: "#18231E" };
function ItemEditor({ item, suppliers, onSave, onClose }) {
  const [draft, setDraft] = useState(item || emptyItem());
  const tracker = useImageTracker(item?.images); // ניקוי תמונות יתומות בביטול
  const close = () => { tracker.settle(draft.images, false); onClose(); };
  const paid = draft.payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const total = itemTotal(draft);
  const patch = (key, value) => setDraft(d => ({ ...d, [key]: value }));
  const pay = (type = "חד-פעמי") => setDraft(d => ({ ...d, payments: [...d.payments, { id: crypto.randomUUID(), amount: 0, date: "", note: "", type, monthlyUntil: "" }] }));
  return <Card className="renovation-editor" style={{ position: "fixed", inset: 12, zIndex: 40, overflow: "auto", overscrollBehavior: "contain", maxWidth: 680, margin: "auto", height: "fit-content", maxHeight: "calc(100vh - 24px)", boxShadow: "0 20px 70px #18231e40" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 16 }}><h2 style={{ margin: 0, fontSize: 21 }}>{item ? "עריכת פריט" : "רכישה חדשה"}</h2><button aria-label="סגירה" onClick={close} style={{ border: 0, background: "transparent", flex: "none", minWidth: 44, minHeight: 44, display: "grid", placeItems: "center" }}><X /></button></div>
    <div style={{ display: "grid", gap: 12 }}>
      <Field label="שם הפריט"><input value={draft.name} onChange={e => patch("name", e.target.value)} style={input} /></Field>
      <div data-form-grid style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 10 }}><Field label="חדר / אזור"><select value={draft.room} onChange={e => patch("room", e.target.value)} style={input}>{rooms.map(x => <option key={x}>{x}</option>)}</select></Field><Field label="קטגוריה"><select value={draft.isCustomCategory ? "__custom__" : draft.category} onChange={e => { const value=e.target.value; if(value==="__custom__") setDraft(d=>({...d, category:"",isCustomCategory:true})); else patch("category",value); }} style={input}>{categories.map(x => <option key={x}>{x}</option>)}<option value="__custom__">קטגוריה אחרת — הזנה חופשית</option></select></Field></div>{draft.isCustomCategory && <Field label="קטגוריה חדשה"><input value={draft.category} onChange={e=>patch("category",e.target.value)} placeholder="לדוגמה: וילונות" style={input} /></Field>}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 10 }}><Field label="עלות משוערת"><input dir="ltr" inputMode="numeric" value={draft.estimate} onChange={e => patch("estimate", Number(e.target.value))} style={input} /></Field><Field label="עלות סופית"><input dir="ltr" inputMode="numeric" value={draft.finalCost} onChange={e => patch("finalCost", Number(e.target.value))} style={input} /></Field></div>
      <Field label="ספק"><select value={draft.isCustomSupplier ? "__custom__" : draft.supplierId} onChange={e => { const value = e.target.value; if (value === "__custom__") setDraft(d => ({ ...d, supplierId: "", supplierName: "", isCustomSupplier: true })); else setDraft(d => ({ ...d, supplierId: value, supplierName: "", isCustomSupplier: false })); }} style={input}><option value="">טרם נבחר</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}<option value="__custom__">ספק אחר — הזנה חופשית</option></select></Field>
      {draft.isCustomSupplier && <Field label="שם ספק אחר"><input value={draft.supplierName} onChange={e => patch("supplierName", e.target.value)} placeholder="לדוגמה: אבי מיזוג" style={input} /></Field>}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 10 }}><Field label="מצב"><select value={draft.status} onChange={e => patch("status", e.target.value)} style={input}>{["לבחירה","בהצעת מחיר","הוזמן","בהמתנה לאספקה","בהתקנה","הושלם","מעוכב"].map(x => <option key={x}>{x}</option>)}</select></Field><Field label="יעד"><input type="date" value={draft.dueDate} onChange={e => patch("dueDate", e.target.value)} style={input} /></Field></div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 10 }}><Field label="תזכורת לפני היעד"><select value={draft.reminderDaysBefore ?? ""} onChange={e => patch("reminderDaysBefore", e.target.value)} style={input}><option value="">ללא תזכורת</option><option value="7">שבוע לפני</option><option value="14">שבועיים לפני</option><option value="21">3 שבועות לפני</option><option value="30">חודש לפני</option></select></Field>{draft.reminderDaysBefore ? <Field label="מה להזכיר?"><input value={draft.reminderNote || ""} onChange={e => patch("reminderNote", e.target.value)} placeholder="לדוגמה: לתאם התקנה" style={input} /></Field> : <div />}</div>
      <div>
        <strong>פירוט הרכישה</strong><span style={{ color: "#63716A", marginInlineStart: 8 }}>{(draft.lines || []).length ? `סכום פירוט ${money(linesTotal(draft))}` : "אופציונלי"}</span>
        <p style={{ color: "#63716A", fontSize: 14, margin: "8px 0" }}>לכל פריט בתוך הרכישה (למשל מקרר, תנור): שם, דגם, כמות, מחיר וקישור. אם יש כמה הצעות לאותו מוצר, סמנו את מה שלא נבחר כ"נפסל" כדי שלא ייספר. עלות סופית שמוזנת למעלה גוברת על סכום הפירוט.</p>
        {(draft.lines || []).map((l, i) => { const setLine = (k, v) => setDraft(d => ({ ...d, lines: d.lines.map((q, j) => j === i ? { ...q, [k]: v } : q) })); return <div key={l.id} className="renovation-line-edit" style={{ display: "grid", gap: 8, padding: 10, marginTop: 8, border: "1px solid #DCE3DE", borderRadius: 10, background: "#FAFCFB" }}>
          <div data-form-grid style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 8 }}><Field label="שם"><input aria-label="שם שורת פירוט" value={l.name} onChange={e => setLine("name", e.target.value)} style={input} /></Field><Field label="יצרן ודגם"><input aria-label="יצרן ודגם" value={l.model || ""} onChange={e => setLine("model", e.target.value)} style={input} /></Field></div>
          <div style={{ display: "grid", gridTemplateColumns: "72px minmax(0,1fr) minmax(0,1fr)", gap: 8 }}><Field label="כמות"><input dir="ltr" inputMode="numeric" aria-label="כמות" value={l.qty} onChange={e => setLine("qty", Number(e.target.value))} style={input} /></Field><Field label="מחיר ליחידה"><input dir="ltr" inputMode="numeric" aria-label="מחיר ליחידה" value={l.price} onChange={e => setLine("price", Number(e.target.value))} style={input} /></Field><Field label="מצב"><select aria-label="מצב שורת פירוט" value={l.status || "לבדיקה"} onChange={e => setLine("status", e.target.value)} style={input}>{LINE_STATUSES.map(x => <option key={x}>{x}</option>)}</select></Field></div>
          <Field label="קישור"><input dir="ltr" aria-label="קישור לשורת פירוט" value={l.link || ""} onChange={e => setLine("link", e.target.value)} placeholder="https://" style={input} /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 44px", gap: 8, alignItems: "end" }}><Field label="הערה"><input aria-label="הערה לשורת פירוט" value={l.note || ""} onChange={e => setLine("note", e.target.value)} style={input} /></Field><button type="button" aria-label="הסרת שורת פירוט" onClick={() => setDraft(d => ({ ...d, lines: d.lines.filter((_, j) => j !== i) }))} style={{ minHeight: 44, border: 0, background: "transparent", color: "#B53A31" }}><Trash2 size={18} /></button></div>
        </div>; })}
        <div className="renovation-payment-actions" style={{ marginTop: 8 }}><button type="button" onClick={() => setDraft(d => ({ ...d, lines: [...(d.lines || []), emptyLine()] }))}>+ שורת פירוט</button></div>
      </div>
      <ImageAttachments images={draft.images} onChange={v => patch("images", v)} tracker={tracker} label="תמונות" />
      <Field label="קישור"><input dir="ltr" value={draft.link} onChange={e => patch("link", e.target.value)} style={input} /></Field>
      <Field label="הערה"><textarea value={draft.note} onChange={e => patch("note", e.target.value)} style={{ ...input, minHeight: 76, paddingTop: 8 }} /></Field>
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={draft.beforeMove} onChange={e => patch("beforeMove", e.target.checked)} /> חובה לפני כניסה</label>
      <div><strong>תשלומי ספק</strong><span style={{ color: "#63716A", marginInlineStart: 8 }}>שולם {money(paid)} · יתרה {money(Math.max(0, total - paid))}</span><p style={{color:"#63716A",fontSize:14,margin:"8px 0"}}>בחר סוג תשלום והזן סכום. בהוראת קבע מזינים את הסכום החודשי ואת החודש האחרון.</p><div className="renovation-payment-actions"><button type="button" onClick={()=>pay("מקדמה")}>+ מקדמה</button><button type="button" onClick={()=>pay("חד-פעמי")}>+ תשלום שבוצע</button><button type="button" onClick={()=>pay("הוראת קבע חודשית")}>+ הוראת קבע חודשית</button></div>{draft.payments.map((p, i) => <div key={p.id} className="renovation-payment-line" data-form-grid style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) 44px", gap: 8, marginTop: 8 }}><Field label="סוג"><select aria-label="סוג תשלום" value={p.type || "חד-פעמי"} onChange={e=>setDraft(d=>({...d,payments:d.payments.map((q,j)=>j===i?{...q,type:e.target.value}:q)}))} style={input}><option>חד-פעמי</option><option>מקדמה</option><option>הוראת קבע חודשית</option></select></Field><Field label={p.type==="הוראת קבע חודשית"?"סכום חודשי":"כמה שולם"}><input dir="ltr" inputMode="numeric" aria-label={p.type==="הוראת קבע חודשית"?"סכום חודשי":"כמה שולם"} value={p.amount} onChange={e => setDraft(d => ({ ...d, payments: d.payments.map((q, j) => j === i ? { ...q, amount: Number(e.target.value) } : q) }))} style={input} /></Field>{p.type==="הוראת קבע חודשית"?<Field label="תאריך סיום"><input type="date" aria-label="תאריך סיום הוראת קבע" value={p.monthlyUntil||""} onChange={e=>setDraft(d=>({...d,payments:d.payments.map((q,j)=>j===i?{...q,monthlyUntil:e.target.value}:q)}))} style={input}/></Field>:<Field label="מתי שולם?"><input type="date" aria-label="תאריך תשלום" value={p.date} onChange={e => setDraft(d => ({ ...d, payments: d.payments.map((q, j) => j === i ? { ...q, date: e.target.value } : q) }))} style={input} /></Field>}<button aria-label="הסרת תשלום" onClick={() => setDraft(d => ({ ...d, payments: d.payments.filter((_, j) => j !== i) }))} style={{ alignSelf:"end",minHeight:44,border:0,background:"transparent",color:"#B53A31" }}><Trash2 size={18} /></button></div>)}</div>
      <div style={{ display: "flex", justifyContent: "end", gap: 8 }}><Btn secondary onClick={close}>ביטול</Btn><Btn onClick={() => { if (draft.name.trim()) { tracker.settle(draft.images, true); onSave({ ...draft, isCustomCategory: false, updatedAt: new Date().toISOString() }); } }}>שמירת פריט</Btn></div>
    </div>
  </Card>;
}
function Dashboard({ data, select }) {
  const items = data.items || []; const paid = items.reduce((s, i) => s + i.payments.reduce((a, p) => a + Number(p.amount || 0), 0), 0); const plan = items.reduce((s, i) => s + itemTotal(i), 0); const urgent = items.filter(i => i.beforeMove && i.status !== "הושלם");
  const reminders = items.filter(i => i.reminderDaysBefore && i.dueDate && !i.reminderDone).map(i => { const date = new Date(`${i.dueDate}T12:00:00`); date.setDate(date.getDate() - Number(i.reminderDaysBefore)); return { item: i, date }; }).sort((a,b) => a.date - b.date);
  return <div style={{ display: "grid", gap: 14 }}><div className="renovation-control-header"><div><p className="renovation-kicker" style={{ margin: "0 0 4px" }}>מרכז שליטה · בית חדש</p><h2 style={{ margin: 0, fontSize: 28 }}>מה דורש החלטה עכשיו?</h2></div><div className="renovation-status">מעקב שיפוץ ומעבר<br/>כל הנתונים שלך במקום אחד</div></div><div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }} className="renovation-stats"><Card><small>תוכנית</small><b style={{ display: "block", fontSize: 19 }}>{money(plan)}</b></Card><Card><small>שולם</small><b style={{ display: "block", fontSize: 19 }}>{money(paid)}</b></Card><Card><small>לפני כניסה</small><b style={{ display: "block", fontSize: 19 }}>{urgent.length}</b></Card></div><Card><h3 style={{ marginTop: 0 }}>חסמים ופעולות</h3>{urgent.length ? urgent.slice(0, 4).map(i => <button key={i.id} onClick={() => select(i)} style={{ width: "100%", textAlign: "start", padding: "12px 0", border: 0, borderBottom: "1px solid #E5EAE6", background: "transparent", font: "inherit" }}><AlertTriangle size={16} color="#A66512" style={{ verticalAlign: "middle", marginInlineEnd: 8 }} />{i.name} · {i.status || "ללא מצב"}</button>) : <p>אין עדיין פריטים שחייבים להיסגר לפני הכניסה.</p>}</Card><Card><h3 style={{ marginTop: 0 }}>תזכורות קרובות</h3>{reminders.length ? reminders.slice(0, 4).map(({ item, date }) => <button key={item.id} onClick={() => select(item)} style={{ width: "100%", textAlign: "start", padding: "10px 0", border: 0, borderBottom: "1px solid #E5EAE6", background: "transparent", font: "inherit" }}><b>{item.name}</b><div style={{ color: "#63716A", fontSize: 14 }}>ב־{date.toLocaleDateString("he-IL")} · {item.reminderNote || "לבדוק מול הספק"}</div></button>) : <p style={{ color: "#63716A", marginBottom: 0 }}>אין תזכורות מתוזמנות. הוסף תזכורת בפריט רכישה.</p>}</Card><Card><h3 style={{ marginTop: 0 }}>לוח המעבר</h3>{data.milestones.map(m => <div key={m.id} style={{ padding: "8px 0", borderBottom: "1px solid #E5EAE6" }}><b>{m.name}</b><span style={{ color: "#A66512", marginInlineStart: 8 }}>{m.status}</span><div style={{ color: "#63716A", fontSize: 14 }}>{m.blocker || m.date || "טרם נקבע"}</div></div>)}</Card></div>;
}
function Items({ data, edit, add, remove }) {
  const [room, setRoom] = useState(""); const [category, setCategory] = useState(""); const [status, setStatus] = useState(""); const [q, setQ] = useState(""); const [view, setView] = useState("grouped"); const [open, setOpen] = useState({});
  const itemCategories = [...new Set(data.items.map(i => i.category).filter(Boolean))].sort((a,b) => a.localeCompare(b, "he"));
  const norm = v => String(v || "").toLocaleLowerCase();
  const matches = (i, l) => { const term = norm(q).trim(); if (!term) return true; return [i.name, i.category, i.room, i.note, l?.name, l?.model, l?.note, l?.link].some(v => norm(v).includes(term)); };
  const visible = data.items.filter(i => (!room || i.room === room) && (!category || i.category === category) && (!status || i.status === status) && (matches(i) || (i.lines || []).some(l => matches(i, l))));
  const flat = data.items.filter(i => (!room || i.room === room) && (!category || i.category === category) && (!status || i.status === status)).flatMap(i => (i.lines || []).length ? i.lines.map(l => ({ item: i, line: l })) : [{ item: i, line: null }]).filter(({ item, line }) => matches(item, line));
  const lineRow = (l, item) => <div key={l.id} style={{ display: "grid", gap: 4, padding: "9px 0", borderTop: "1px solid #E5EAE6", opacity: l.status === "נפסל" ? 0.5 : 1 }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b style={{ textDecoration: l.status === "נפסל" ? "line-through" : "none" }}>{l.name || "ללא שם"}{Number(l.qty) > 1 ? ` ×${l.qty}` : ""}</b><span>{Number(l.price) ? money(Number(l.price) * Math.max(1, Number(l.qty || 1))) : "ללא מחיר"}</span></div>
    <div style={{ color: "#63716A", fontSize: 14, display: "flex", flexWrap: "wrap", gap: "2px 10px" }}>{l.model && <span dir="auto">דגם: {l.model}</span>}<span>{l.status || "לבדיקה"}</span>{l.note && <span>{l.note}</span>}{l.link && <a href={l.link} target="_blank" rel="noreferrer" style={{ color: "#256B57" }}><ExternalLink size={13} /> קישור</a>}</div>
  </div>;
  return <div style={{ display: "grid", gap: 12 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><h2 style={{ margin: 0 }}>תקציב ורכש</h2><span style={{ color: "#63716A" }}>כל רכישה נשמרת פעם אחת, עם פירוט דגמים וקישורים</span></div><Btn onClick={add}><Plus size={18} />רכישה</Btn></div>
    <div className="renovation-filterbar"><select aria-label="סינון לפי חדר" value={room} onChange={e => setRoom(e.target.value)}><option value="">כל החדרים</option>{rooms.map(x => <option key={x}>{x}</option>)}</select><select aria-label="סינון לפי קטגוריה" value={category} onChange={e => setCategory(e.target.value)}><option value="">כל הקטגוריות</option>{itemCategories.map(x => <option key={x}>{x}</option>)}</select><select aria-label="סינון לפי מצב" value={status} onChange={e => setStatus(e.target.value)}><option value="">כל המצבים</option>{["לבחירה","בהצעת מחיר","הוזמן","בהמתנה לאספקה","בהתקנה","הושלם","מעוכב"].map(x => <option key={x}>{x}</option>)}</select></div>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <label style={{ position: "relative", flex: "1 1 200px" }}><Search size={16} style={{ position: "absolute", insetInlineStart: 10, top: 14, color: "#63716A" }} /><input aria-label="חיפוש ברכש" placeholder="חיפוש לפי שם, דגם, הערה או קישור" value={q} onChange={e => setQ(e.target.value)} style={{ ...input, paddingInlineStart: 34 }} /></label>
      <div role="group" aria-label="תצוגה" style={{ display: "flex", gap: 6 }}>{[["grouped", "מקובץ"], ["flat", "כל הפריטים"]].map(([id, label]) => <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)} style={{ minHeight: 44, padding: "0 14px", borderRadius: 9, border: "1px solid #C9D3CC", background: view === id ? "#256B57" : "#fff", color: view === id ? "#fff" : "#18231E", font: "inherit", cursor: "pointer" }}>{label}</button>)}</div>
    </div>
    <span style={{ color: "#65746D" }}>{view === "flat" ? `${flat.length} שורות` : `${visible.length} רכישות`}</span>
    {!data.items.length && <Card><p>עוד אין רכישות. התחילו בפריט שיש לו זמן אספקה ארוך או שחוסם החלטה.</p><Btn onClick={add}><Plus size={18} />הוספת פריט ראשון</Btn></Card>}
    {view === "grouped" && visible.map(i => { const total = itemTotal(i), paid = i.payments.reduce((s, p) => s + Number(p.amount || 0), 0), lines = i.lines || [], isOpen = open[i.id] || (!!q.trim() && lines.some(l => matches(i, l)));
      return <Card key={i.id}>
        <button onClick={() => edit(i)} style={{ width: "100%", textAlign: "start", border: 0, background: "transparent", font: "inherit", cursor: "pointer", padding: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b>{i.name}</b><span style={{ color: "#256B57" }}>{i.status}</span></div>
          <div style={{ color: "#63716A", fontSize: 14, marginTop: 4 }}>{i.room} · {i.category} · יעד: {i.dueDate || "לא נקבע"}</div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}><span>תוכנית {money(total)}</span><span>יתרה {money(Math.max(0, total - paid))}</span></div>
        </button>
        {lines.length > 0 && <button type="button" aria-expanded={!!isOpen} onClick={() => setOpen(o => ({ ...o, [i.id]: !isOpen }))} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, minHeight: 40, border: 0, background: "transparent", color: "#256B57", font: "inherit", fontWeight: 700, cursor: "pointer", padding: 0 }}><ChevronDown size={16} style={{ transform: isOpen ? "rotate(180deg)" : "none" }} />{isOpen ? "הסתרת פירוט" : `פירוט (${lines.length} שורות)`}{linesTotal(i) > 0 && <span style={{ color: "#63716A", fontWeight: 400 }}>· {money(linesTotal(i))}</span>}</button>}
        {isOpen && <div>{lines.map(l => lineRow(l, i))}</div>}
        {imagesOf(i).length > 0 && <div style={{ marginTop: 10 }}><ImageBadge entry={i} /></div>}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}><span>{i.link && <a href={i.link} target="_blank" rel="noreferrer" style={{ color: "#256B57", display: "inline-flex", alignItems: "center", gap: 4, minHeight: 44 }}><ExternalLink size={15} /> קישור</a>}</span><button onClick={() => remove(i.id)} style={{ border: 0, background: "transparent", color: "#B53A31", font: "inherit", minHeight: 44, minWidth: 44, padding: "0 8px" }}>מחיקה</button></div>
      </Card>; })}
    {view === "flat" && <Card>{flat.length ? flat.map(({ item, line }) => line ? <div key={line.id}>{lineRow(line, item)}<button onClick={() => edit(item)} style={{ border: 0, background: "transparent", color: "#63716A", font: "inherit", fontSize: 13, cursor: "pointer", padding: "0 0 8px" }}>{item.name} · {item.room} · עריכה{imagesOf(item).length > 0 ? ` · ${imagesOf(item).length} תמונות` : ""}</button></div> : <div key={item.id} style={{ display: "grid", gap: 4, padding: "9px 0", borderTop: "1px solid #E5EAE6" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b>{item.name}</b><span>{money(itemTotal(item))}</span></div><button onClick={() => edit(item)} style={{ border: 0, background: "transparent", color: "#63716A", font: "inherit", fontSize: 13, cursor: "pointer", padding: 0, textAlign: "start" }}>{item.room} · {item.status} · ללא פירוט · עריכה{imagesOf(item).length > 0 ? ` · ${imagesOf(item).length} תמונות` : ""}</button></div>) : <p style={{ margin: 0, color: "#63716A" }}>לא נמצאו פריטים.</p>}</Card>}
  </div>;
}
function Suppliers({ data, setData }) { const [editing,setEditing]=useState(null); const blank=()=>({...emptySupplier()}); const save=()=>{if(!editing?.name?.trim())return;setState(setData,d=>({suppliers:d.suppliers.some(x=>x.id===editing.id)?d.suppliers.map(x=>x.id===editing.id?editing:x):[...d.suppliers,editing]}));setEditing(null);};return <div style={{display:"grid",gap:12}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><h2 style={{margin:0}}>ספקים</h2><span style={{color:"#63716A"}}>אנשי קשר, כסף וקבצים קשורים</span></div><Btn onClick={()=>setEditing(blank())}><Plus size={18}/>ספק</Btn></div>{editing&&<Card><div data-form-grid style={{display:"grid",gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",gap:10}}><Field label="שם ספק / בעל מקצוע"><input value={editing.name} onChange={e=>setEditing(x=>({...x,name:e.target.value}))} style={input}/></Field><Field label="תחום"><input value={editing.trade} onChange={e=>setEditing(x=>({...x,trade:e.target.value}))} placeholder="לדוגמה: מיזוג" style={input}/></Field></div><div data-form-grid style={{display:"grid",gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",gap:10}}><Field label="טלפון"><input dir="ltr" value={editing.phone} onChange={e=>setEditing(x=>({...x,phone:e.target.value}))} style={input}/></Field><Field label="קישור להצעת מחיר"><input dir="ltr" value={editing.quoteUrl||""} onChange={e=>setEditing(x=>({...x,quoteUrl:e.target.value}))} placeholder="https://" style={input}/></Field></div><Field label="קישור למסמך / חוזה"><input dir="ltr" value={editing.documentUrl||""} onChange={e=>setEditing(x=>({...x,documentUrl:e.target.value}))} placeholder="https://" style={input}/></Field><Field label="הערה"><textarea value={editing.note} onChange={e=>setEditing(x=>({...x,note:e.target.value}))} style={{...input,minHeight:68,paddingTop:8}}/></Field><div style={{display:"flex",justifyContent:"end",gap:8,marginTop:10}}><Btn secondary onClick={()=>setEditing(null)}>ביטול</Btn><Btn onClick={save}>שמירת ספק</Btn></div></Card>}{data.suppliers.map(s=>{const linked=data.items.filter(i=>i.supplierId===s.id);const total=linked.reduce((sum,i)=>sum+itemTotal(i),0);const paid=linked.reduce((sum,i)=>sum+i.payments.reduce((x,p)=>x+Number(p.amount||0),0),0);return <Card key={s.id}><div style={{display:"flex",justifyContent:"space-between",gap:12}}><div><b>{s.name}</b><div style={{color:"#63716A"}}>{s.trade||"תחום טרם הוזן"}{s.phone&&<> · {s.phone}</>}</div><div style={{marginTop:8,fontSize:14}}>פריטים: {linked.length} · סוכם {money(total)} · שולם {money(paid)} · יתרה {money(Math.max(0,total-paid))}</div>{s.note&&<div style={{color:"#63716A",fontSize:14,marginTop:6}}>{s.note}</div>}{(s.quoteUrl||s.documentUrl)&&<div style={{display:"flex",gap:12,marginTop:8,fontSize:14}}>{s.quoteUrl&&<a href={s.quoteUrl} target="_blank" rel="noreferrer" style={{display:"inline-flex",alignItems:"center",minHeight:44}}>הצעת מחיר</a>}{s.documentUrl&&<a href={s.documentUrl} target="_blank" rel="noreferrer" style={{display:"inline-flex",alignItems:"center",minHeight:44}}>מסמך / חוזה</a>}</div>}</div><Btn secondary onClick={()=>setEditing({...s})}>עריכה</Btn></div></Card>})}{!data.suppliers.length&&!editing&&<Card>עדיין אין ספקים. אפשר להוסיף בעל מקצוע כאן או מתוך פריט רכש.</Card>}</div>; }function Plan({ data, setData }) { const [editing,setEditing]=useState(null); const editorRef=useRef(null); useEffect(()=>{if(!editing)return;const frame=requestAnimationFrame(()=>editorRef.current?.scrollIntoView({behavior:"smooth",block:"center"}));return()=>cancelAnimationFrame(frame);},[editing]); const today=new Date(); today.setHours(0,0,0,0); const cutoff=new Date(today); cutoff.setDate(cutoff.getDate()+7); const upcoming=[...(data.milestones||[]).filter(x=>x.date).map(x=>({name:x.name,date:x.date,detail:x.status||"אבן דרך"})),...(data.items||[]).filter(x=>x.dueDate&&x.status!=="הושלם").map(x=>({name:x.name,date:x.dueDate,detail:x.status||"רכש"}))].filter(x=>{const d=new Date(x.date+"T12:00:00");return d>=today&&d<=cutoff;}).sort((x,y)=>x.date.localeCompare(y.date)); const timeline=[...(data.milestones||[])].sort((a,b)=>(a.date||"9999").localeCompare(b.date||"9999")); const nextMilestone=timeline.find(x=>x.status!=="הושלם"); const near=(data.items||[]).filter(i=>i.beforeMove&&i.status!=="הושלם").sort((a,b)=>(a.dueDate||"9999").localeCompare(b.dueDate||"9999")); const save=()=>{if(!editing?.name?.trim())return;setState(setData,d=>({milestones:d.milestones.some(x=>x.id===editing.id)?d.milestones.map(x=>x.id===editing.id?editing:x):[...d.milestones,{...editing,id:crypto.randomUUID()}]}));setEditing(null);};return <div style={{display:"grid",gap:12}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><h2 style={{margin:0}}>תוכנית ולוח זמנים</h2><span style={{color:"#63716A"}}>אבני דרך, חסמים ומה חייב להיסגר לפני המעבר</span></div><Btn onClick={()=>setEditing({id:"",name:"",date:"",status:"מתוכנן",blocker:""})}><Plus size={18}/>אבן דרך</Btn></div><Card className="renovation-timeline"><div className="renovation-timeline-title"><div><h3 style={{margin:0}}>ציר המעבר</h3><span>{nextMilestone?`התחנה הבאה: ${nextMilestone.name}`:"כל אבני הדרך הושלמו"}</span></div></div><div className="renovation-timeline-track">{timeline.map(m=><button key={m.id} onClick={()=>setEditing({...m})} className={`renovation-timeline-step ${m.status==="הושלם"?"is-done":m.status==="מעוכב"?"is-blocked":""}`}><span className="renovation-timeline-dot" aria-hidden="true"/><span><b>{m.name}</b><small>{m.date?new Date(m.date+"T12:00:00").toLocaleDateString("he-IL"):"תאריך לא נקבע"} · {m.status}</small></span></button>)}</div></Card><Card><h3 style={{marginTop:0}}>השבוע הקרוב</h3>{upcoming.length?upcoming.map(x=><div key={x.name+x.date} style={{padding:"10px 0",borderBottom:"1px solid #E5EAE6"}}><b>{x.name}</b><div style={{color:"#63716A",fontSize:14}}>{x.detail} · {new Date(x.date+"T12:00:00").toLocaleDateString("he-IL")}</div></div>):<p style={{color:"#63716A"}}>אין אירועי בית חדשים בשבעת הימים הקרובים.</p>}</Card><Card><h3 style={{marginTop:0}}>לפני המעבר</h3>{near.length?near.map(i=><button key={i.id} onClick={()=>{}} style={{width:"100%",textAlign:"start",padding:"10px 0",border:0,borderBottom:"1px solid #E5EAE6",background:"transparent",font:"inherit"}}><b>{i.name}</b><div style={{color:"#63716A",fontSize:14}}>{i.status} · יעד: {i.dueDate?new Date(i.dueDate+"T12:00:00").toLocaleDateString("he-IL"):"לא נקבע"}</div></button>):<p style={{color:"#63716A"}}>אין כרגע פריטי רכש פתוחים שחובה לסגור לפני הכניסה.</p>}</Card><Card><h3 style={{marginTop:0}}>אבני דרך</h3><p style={{marginTop:0,color:"#63716A"}}>לחיצה על אבן דרך פותחת עריכה של התאריך, הסטטוס והחסם.</p>{data.milestones.map(m=><button key={m.id} onClick={()=>setEditing({...m})} style={{width:"100%",textAlign:"start",padding:"13px 0",border:0,borderBottom:"1px solid #E5EAE6",background:"transparent",font:"inherit",cursor:"pointer"}}><div style={{display:"flex",justifyContent:"space-between",gap:8}}><b>{m.name}</b><span style={{color:m.status==="מעוכב"?"#B53A31":"#A66512"}}>{m.status}</span></div><div style={{color:"#63716A",fontSize:14,marginTop:4}}>{m.date?new Date(m.date+"T12:00:00").toLocaleDateString("he-IL"):"תאריך טרם נקבע"}{m.blocker&&<> · {m.blocker}</>}</div></button>)}{!data.milestones.length&&<p>אין עדיין אבני דרך. הוסיפו למשל קבלת מפתח, מדידות, התקנות וכניסה.</p>}</Card>{editing&&<div ref={editorRef}><Card><h3 style={{marginTop:0}}>{editing.id?"עריכת אבן דרך":"אבן דרך חדשה"}</h3><div data-form-grid style={{display:"grid",gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",gap:10}}><Field label="שם"><input value={editing.name} onChange={e=>setEditing(x=>({...x,name:e.target.value}))} style={input}/></Field><Field label="תאריך"><input type="date" value={editing.date||""} onChange={e=>setEditing(x=>({...x,date:e.target.value,status:e.target.value&&x.status==="דורש אימות"?"מתוכנן":x.status,blocker:e.target.value&&x.blocker==="יש לאמת שנה ומועד"?"":x.blocker}))} style={input}/></Field></div><div data-form-grid style={{display:"grid",gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",gap:10}}><Field label="מצב"><select value={editing.status||"מתוכנן"} onChange={e=>setEditing(x=>({...x,status:e.target.value}))} style={input}>{["מתוכנן","בתהליך","ממתין","מעוכב","הושלם","דורש אימות"].map(x=><option key={x}>{x}</option>)}</select></Field><Field label="חסם / הערה"><input value={editing.blocker||""} onChange={e=>setEditing(x=>({...x,blocker:e.target.value}))} style={input}/></Field></div><div style={{display:"flex",justifyContent:"end",gap:8,marginTop:12}}><Btn secondary onClick={()=>setEditing(null)}>ביטול</Btn><Btn onClick={save}>שמירת אבן דרך</Btn></div></Card></div>}</div>; }function Docs({ data, setData }) {
  const api = useMemo(() => createHomeDocuments(supabase), []);
  const [ws, setWs] = useState({ status: "loading" }); // loading | ready | off
  const [me, setMe] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState({ title: "", description: "", category: DOC_CATEGORIES[0], customCategory: "" });
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("");
  const fileRef = useRef(null);
  useEffect(() => {
    let alive = true;
    setWs({ status: "loading" });
    api.resolveWorkspaceId().then(r => { if (alive) setWs(r.ok ? { status: "ready", workspaceId: r.workspaceId, ownerId: r.ownerId } : { status: "off", code: r.code }); });
    supabase.auth.getSession().then(({ data: s }) => { if (alive) setMe(s?.session?.user?.id || null); }).catch(() => {});
    return () => { alive = false; };
  }, [api, attempt]);
  const docs = data.documents || [];
  const categories = [...new Set(docs.map(d => d.category || d.type).filter(Boolean))];
  const shown = filter ? docs.filter(d => (d.category || d.type) === filter) : docs;
  const patch = (key, value) => { setDraft(d => ({ ...d, [key]: value })); setErrors(list => list.filter(e => e.field !== (key === "customCategory" ? "category" : key))); setMessage(""); };
  const errorOf = field => errors.find(e => e.field === field)?.message;
  const submit = async e => {
    e.preventDefault();
    if (busy || ws.status !== "ready") return;
    const v = validateUpload({ ...draft, file });
    if (!v.ok) { setErrors(v.errors); return; }
    setBusy(true); setMessage(""); setErrors([]);
    const id = crypto.randomUUID();
    const path = objectPath(ws.workspaceId, id, file.name);
    const up = await api.upload(path, file, v.value.mime);
    if (!up.ok) { setMessage(messageFor(up.code)); setBusy(false); return; }
    const entry = { id, title: v.value.title, description: v.value.description, category: v.value.category, path, fileName: v.value.fileName, size: v.value.size, mime: v.value.mime, uploadedBy: me, uploadedAt: new Date().toISOString() };
    setState(setData, d => ({ documents: [entry, ...(d.documents || [])] }));
    setDraft({ title: "", description: "", category: draft.category, customCategory: "" });
    setFile(null); if (fileRef.current) fileRef.current.value = "";
    setBusy(false); setMessage("הקובץ הועלה");
  };
  const open = async doc => {
    const w = window.open("", "_blank");
    const r = await api.signedUrl(doc.path);
    if (!r.ok) { w?.close(); setMessage(messageFor(r.code)); return; }
    if (w) { w.opener = null; w.location.href = r.url; } else window.location.href = r.url;
  };
  const remove = async doc => {
    if (!window.confirm(`למחוק את "${doc.title || doc.name}"? הפעולה אינה הפיכה.`)) return;
    if (doc.path) {
      const r = await api.remove(doc.path);
      if (!r.ok) { setMessage(r.code === "forbidden" ? "אפשר למחוק רק קובץ שהעלית בעצמך, או אם את/ה הבעלים" : messageFor(r.code)); return; }
    }
    setState(setData, d => ({ documents: (d.documents || []).filter(x => x.id !== doc.id) }));
    setMessage("נמחק");
  };
  const canDelete = doc => !doc.path || (me && (doc.uploadedBy === me || ws.ownerId === me));
  const off = ws.status === "off";
  return <div style={{ display: "grid", gap: 12 }}>
    <div><h2 style={{ margin: 0 }}>מסמכים ובדק</h2><span style={{ color: "#63716A" }}>חשבוניות, תוכניות וקבצים של הבית החדש</span></div>
    {ws.status === "loading" && <Card><p style={{ margin: 0, color: "#63716A" }}>בודק אם העלאת קבצים זמינה…</p></Card>}
    {off && <Card>
      <Upload size={22} color="#256B57" />
      <h3 style={{ marginBottom: 6 }}>{ws.code === "network" ? "לא הצלחנו לבדוק אם העלאת קבצים זמינה" : "העלאת קבצים עדיין לא הופעלה"}</h3>
      <p style={{ color: "#63716A", marginTop: 0 }}>{ws.code === "network" ? "בדקו חיבור ונסו שוב." : messageFor(ws.code) + ". ההעלאה תופעל אחרי שאחסון הקבצים המשותף יאושר. עד אז לא נשמרים כאן קבצים, כדי לא להבטיח משהו שלא קורה."}</p>
      {ws.code === "network" && <Btn secondary onClick={() => setAttempt(n => n + 1)}>ניסיון נוסף</Btn>}
    </Card>}
    {ws.status === "ready" && <Card>
      <form onSubmit={submit} style={{ display: "grid", gap: 10 }} aria-busy={busy}>
        <h3 style={{ margin: 0 }}>העלאת מסמך</h3>
        <Field label="כותרת"><input value={draft.title} onChange={e => patch("title", e.target.value)} placeholder="למשל: תוכנית נגרות מטבח, גרסה סופית" style={input} aria-invalid={!!errorOf("title")} />{errorOf("title") && <span role="alert" style={{ color: "#b42318" }}>{errorOf("title")}</span>}</Field>
        <Field label="תיאור (לא חובה)"><textarea value={draft.description} onChange={e => patch("description", e.target.value)} style={{ ...input, minHeight: 76, paddingTop: 8 }} />{errorOf("description") && <span role="alert" style={{ color: "#b42318" }}>{errorOf("description")}</span>}</Field>
        <Field label="קטגוריה">
          <select value={draft.category} onChange={e => patch("category", e.target.value)} style={input}>{DOC_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}<option value={CUSTOM_CATEGORY}>כתיבה חופשית…</option></select>
        </Field>
        {draft.category === CUSTOM_CATEGORY && <Field label="שם הקטגוריה"><input value={draft.customCategory} onChange={e => patch("customCategory", e.target.value)} placeholder="למשל: חשמלאי, אינסטלציה" style={input} maxLength={60} /></Field>}
        {errorOf("category") && <span role="alert" style={{ color: "#b42318" }}>{errorOf("category")}</span>}
        <Field label="קובץ (PDF, תמונה, Word או Excel, עד 25MB)">
          <input ref={fileRef} type="file" accept={ACCEPT_ATTR} onChange={e => { setFile(e.target.files?.[0] || null); setErrors(list => list.filter(x => x.field !== "file")); setMessage(""); }} style={{ ...input, padding: "9px 10px", minHeight: 44 }} />
          {file && <span style={{ color: "#63716A" }}>{file.name} · {formatSize(file.size)}</span>}
          {errorOf("file") && <span role="alert" style={{ color: "#b42318" }}>{errorOf("file")}</span>}
        </Field>
        <div style={{ display: "flex", justifyContent: "end" }}><Btn disabled={busy}>{busy ? "מעלה…" : <><Upload size={18} />העלאה</>}</Btn></div>
      </form>
    </Card>}
    {message && <p role="status" style={{ margin: 0, color: message === "הקובץ הועלה" || message === "נמחק" ? "#1D5A48" : "#b42318" }}>{message}</p>}
    {categories.length > 1 && <div><select value={filter} onChange={e => setFilter(e.target.value)} aria-label="סינון לפי קטגוריה" style={{ ...input, maxWidth: 260 }}><option value="">כל הקטגוריות</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select></div>}
    {shown.map(doc => <Card key={doc.id}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "start" }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, overflowWrap: "anywhere" }}>{doc.title || doc.name}</h3>
          <span style={{ display: "inline-block", marginTop: 6, padding: "3px 10px", borderRadius: 999, background: "#E6F0EB", color: "#1D5A48", fontSize: 13 }}>{doc.category || doc.type || "ללא קטגוריה"}</span>
        </div>
        <div style={{ display: "flex", flex: "none" }}>
          {doc.path && <button type="button" onClick={() => open(doc)} aria-label={`פתיחת ${doc.title}`} style={{ border: 0, background: "transparent", color: "#176f7a", minWidth: 44, minHeight: 44, cursor: "pointer" }}><ExternalLink size={18} /></button>}
          {canDelete(doc) && <button type="button" onClick={() => remove(doc)} aria-label={`מחיקת ${doc.title || doc.name}`} style={{ border: 0, background: "transparent", color: "#8a6a64", minWidth: 44, minHeight: 44, cursor: "pointer" }}><Trash2 size={17} /></button>}
        </div>
      </div>
      {doc.description && <p style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{doc.description}</p>}
      {doc.path ? <p style={{ margin: "8px 0 0", color: "#63716A", fontSize: 14, overflowWrap: "anywhere" }}>{doc.fileName} · {formatSize(doc.size)} · {new Date(doc.uploadedAt).toLocaleDateString("he-IL")}</p> : <p style={{ margin: "8px 0 0", color: "#63716A", fontSize: 14 }}>רשומה ללא קובץ (נוצרה לפני שהעלאת קבצים הופעלה)</p>}
    </Card>)}
    {!docs.length && <Card><p style={{ margin: 0, color: "#63716A" }}>עדיין אין מסמכים.</p></Card>}
    <Card><h3 style={{ marginTop: 0 }}>בדק ומסירה</h3><p style={{ marginBottom: 0 }}>בעת מסירה תעדו ליקוי, תמונה, תאריך, אחראי ותאריך תיקון. עבודות חשמל ותשתיות יש לאשר מול בעל מקצוע מוסמך.</p></Card>
  </div>;
}
function Checklist({ data, setData }) {
  const items = data.checklist || [];
  const categories = data.checklistCategories || [];
  const [text, setText] = useState(""); const [group, setGroup] = useState("");
  const [newCategory, setNewCategory] = useState(""); const [categoryError, setCategoryError] = useState("");
  const [open, setOpen] = useState(null); // id של המשימה שפתוחה כרגע לפירוט, אחת בכל פעם
  const [subtaskText, setSubtaskText] = useState("");
  const activeGroup = categories.includes(group) ? group : categories[0] || "";
  const done = items.filter(i => i.done).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  const add = e => { e.preventDefault(); const t = text.trim(); if (!t || !activeGroup) return; setState(setData, d => ({ checklist: [...(d.checklist || []), { id: crypto.randomUUID(), text: t, group: activeGroup, done: false, note: "", subtasks: [] }] })); setText(""); };
  const toggle = id => setState(setData, d => ({ checklist: d.checklist.map(i => i.id === id ? { ...i, done: !i.done } : i) }));
  const remove = id => { setState(setData, d => ({ checklist: d.checklist.filter(i => i.id !== id) })); if (open === id) setOpen(null); };
  const addCategory = e => {
    e.preventDefault(); const name = newCategory.trim();
    if (!name) return;
    if (name.length > 40) { setCategoryError("שם קטגוריה עד 40 תווים"); return; }
    if (categories.some(c => c.toLocaleLowerCase() === name.toLocaleLowerCase())) { setCategoryError("קטגוריה כזו כבר קיימת"); return; }
    setState(setData, d => ({ checklistCategories: [...d.checklistCategories, name] })); setNewCategory(""); setCategoryError(""); setGroup(name);
  };
  const removeCategory = name => setState(setData, d => ({ checklistCategories: d.checklistCategories.filter(c => c !== name) }));
  // פירוט משימה: הערה חופשית ותת-משימות. שדות אופציונליים כדי שמשימות ישנות ימשיכו לעבוד בלי שינוי.
  const setNote = (id, note) => setState(setData, d => ({ checklist: d.checklist.map(i => i.id === id ? { ...i, note } : i) }));
  const addSubtask = (id, subtext) => { const t = subtext.trim(); if (!t) return; setState(setData, d => ({ checklist: d.checklist.map(i => i.id === id ? { ...i, subtasks: [...(i.subtasks || []), { id: crypto.randomUUID(), text: t, done: false }] } : i) })); setSubtaskText(""); };
  const toggleSubtask = (id, subId) => setState(setData, d => ({ checklist: d.checklist.map(i => i.id === id ? { ...i, subtasks: (i.subtasks || []).map(s => s.id === subId ? { ...s, done: !s.done } : s) } : i) }));
  const removeSubtask = (id, subId) => setState(setData, d => ({ checklist: d.checklist.map(i => i.id === id ? { ...i, subtasks: (i.subtasks || []).filter(s => s.id !== subId) } : i) }));
  const orphans = items.filter(i => !categories.includes(i.group));
  const sections = [...categories.map(c => [c, items.filter(i => i.group === c)]), ...(orphans.length ? [["ללא קטגוריה", orphans]] : [])];
  return <div style={{ display: "grid", gap: 12 }}>
    <div><h2 style={{ margin: 0 }}>צ'ק ליסט</h2><span style={{ color: "#63716A" }}>מה צריך לסגור סביב המעבר לדירה</span></div>
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}><strong>{done} מתוך {items.length} הושלמו</strong><span style={{ color: "#63716A" }}>{pct}%</span></div>
      <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} style={{ height: 8, borderRadius: 8, background: "#E5EAE6", overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: "#238a67", transition: "width .2s" }} /></div>
    </Card>
    <Card>
      <form onSubmit={add} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 8 }}>
        <input value={text} onChange={e => setText(e.target.value)} placeholder="הוספת משימה לצ'ק ליסט" aria-label="משימה חדשה" style={input} />
        <Btn disabled={!activeGroup}><Plus size={18} />הוסף</Btn>
        <select value={activeGroup} onChange={e => setGroup(e.target.value)} aria-label="קטגוריה" disabled={!categories.length} style={{ ...input, gridColumn: "1 / -1" }}>{categories.map(g => <option key={g}>{g}</option>)}</select>
      </form>
      {!categories.length && <p style={{ margin: "8px 0 0", color: "#63716A" }}>אין קטגוריות. אפשר להוסיף קטגוריה בהמשך העמוד.</p>}
    </Card>
    {sections.map(([g, rows]) => rows.length ? <Card key={g}>
      <h3 style={{ marginTop: 0 }}>{g} <span style={{ color: "#63716A", fontWeight: 400, fontSize: 14 }}>({rows.filter(i => i.done).length}/{rows.length})</span></h3>
      {rows.map(i => { const subtasks = i.subtasks || []; const subDone = subtasks.filter(s => s.done).length; const isOpen = open === i.id; return <div key={i.id} style={{ borderBottom: "1px solid #E5EAE6" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 44 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 44, cursor: "pointer" }}><input type="checkbox" checked={!!i.done} onChange={() => toggle(i.id)} aria-label={`סימון ${i.text} כהושלם`} style={{ width: 20, height: 20, accentColor: "#238a67" }} /></label>
          <button type="button" onClick={() => setOpen(isOpen ? null : i.id)} aria-expanded={isOpen} style={{ flex: 1, minWidth: 0, textAlign: "start", border: 0, background: "transparent", font: "inherit", cursor: "pointer", padding: "10px 0", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ textDecoration: i.done ? "line-through" : "none", color: i.done ? "#63716A" : "inherit", overflowWrap: "anywhere" }}>{i.text}</span>
            {(i.note || subtasks.length > 0) && <span style={{ color: "#63716A", fontSize: 13, flexShrink: 0 }}>{subtasks.length > 0 ? `· ${subDone}/${subtasks.length}` : "· פירוט"}</span>}
            <ChevronDown size={16} style={{ flexShrink: 0, marginInlineStart: "auto", transform: isOpen ? "rotate(180deg)" : "none", color: "#63716A" }} />
          </button>
          <button type="button" onClick={() => remove(i.id)} aria-label={`מחיקת ${i.text}`} style={{ border: 0, background: "transparent", color: "#8a6a64", minWidth: 44, minHeight: 44, cursor: "pointer" }}><Trash2 size={17} /></button>
        </div>
        {isOpen && <div style={{ padding: "0 4px 14px 4px", display: "grid", gap: 10 }}>
          <Field label="הערה"><textarea value={i.note || ""} onChange={e => setNote(i.id, e.target.value)} placeholder="פרטים נוספים על המשימה" style={{ ...input, minHeight: 60, paddingTop: 8 }} /></Field>
          <div>
            <strong style={{ fontSize: 14 }}>תת-משימות{subtasks.length > 0 ? ` (${subDone}/${subtasks.length})` : ""}</strong>
            {subtasks.map(s => <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 40 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, minHeight: 40, cursor: "pointer" }}><input type="checkbox" checked={!!s.done} onChange={() => toggleSubtask(i.id, s.id)} aria-label={`סימון ${s.text} כהושלם`} style={{ width: 18, height: 18, accentColor: "#238a67", flexShrink: 0 }} /><span style={{ textDecoration: s.done ? "line-through" : "none", color: s.done ? "#63716A" : "inherit", overflowWrap: "anywhere" }}>{s.text}</span></label>
              <button type="button" onClick={() => removeSubtask(i.id, s.id)} aria-label={`מחיקת ${s.text}`} style={{ border: 0, background: "transparent", color: "#8a6a64", minWidth: 36, minHeight: 36, cursor: "pointer" }}><X size={15} /></button>
            </div>)}
            <form onSubmit={e => { e.preventDefault(); addSubtask(i.id, subtaskText); }} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 8, marginTop: 8 }}>
              <input value={isOpen ? subtaskText : ""} onChange={e => setSubtaskText(e.target.value)} placeholder="הוספת תת-משימה" aria-label={`תת-משימה חדשה עבור ${i.text}`} style={input} />
              <Btn secondary><Plus size={16} />הוסף</Btn>
            </form>
          </div>
        </div>}
      </div>; })}
    </Card> : null)}
    {!items.length && <Card><p style={{ margin: 0, color: "#63716A" }}>הצ'ק ליסט ריק. אפשר להוסיף משימה למעלה.</p></Card>}
    <Card>
      <h3 style={{ marginTop: 0 }}>קטגוריות</h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {categories.map(c => { const count = items.filter(i => i.group === c).length; return <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 999, background: "#E6F0EB", color: "#1D5A48" }}>{c} · {count}{count === 0 && <button type="button" onClick={() => removeCategory(c)} aria-label={`מחיקת הקטגוריה ${c}`} style={{ border: 0, background: "transparent", cursor: "pointer", padding: 0, display: "grid", placeItems: "center", minWidth: 32, minHeight: 32, margin: "-6px", color: "#1D5A48" }}><X size={15} /></button>}</span>; })}
      </div>
      <form onSubmit={addCategory} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 8 }}>
        <input value={newCategory} onChange={e => { setNewCategory(e.target.value); setCategoryError(""); }} placeholder="קטגוריה חדשה (למשל: משפטי, ציוד, ילדים)" aria-label="קטגוריה חדשה" style={input} />
        <Btn secondary><Plus size={18} />הוסף</Btn>
      </form>
      {categoryError && <p role="alert" style={{ margin: "8px 0 0", color: "#b42318" }}>{categoryError}</p>}
      <p style={{ margin: "10px 0 0", color: "#63716A", fontSize: 14 }}>קטגוריה נמחקת רק כשאין בה משימות (יש לה ‏X‏ כשהיא ריקה).</p>
    </Card>
  </div>;
}
// קישור: רק http/https. בלי סכמה מוסיפים https://. מחזיר "" (אין), null (לא תקין) או כתובת מלאה.
const safeLink = v => {
  const t = String(v || "").trim(); if (!t) return "";
  try { const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`); return u.protocol === "http:" || u.protocol === "https:" ? u.href : null; } catch { return null; }
};
const emptyInspiration = category => ({ id: "", title: "", description: "", link: "", images: [], category: category || "", isCustomCategory: false });
function Inspirations({ data, setData }) {
  const items = data.inspirations || [];
  const categories = data.inspirationCategories || [];
  const [draft, setDraft] = useState(emptyInspiration(categories[0])); const [error, setError] = useState("");
  const [newCategory, setNewCategory] = useState(""); const [categoryError, setCategoryError] = useState("");
  const tracker = useImageTracker([]);
  const startDraft = next => { tracker.settle(draft.images, false); tracker.reset(next.images); setDraft(next); setError(""); }; // מעבר טיוטה: מנקה העלאות שלא נשמרו
  const patch = (key, value) => { setDraft(d => ({ ...d, [key]: value })); setError(""); };
  const save = e => {
    e.preventDefault();
    const title = draft.title.trim(); if (!title) { setError("צריך כותרת"); return; }
    const link = safeLink(draft.link); if (link === null) { setError("הקישור לא תקין. אפשר להדביק כתובת רגילה, למשל example.com/עמוד"); return; }
    const category = draft.isCustomCategory ? draft.category.trim() : draft.category;
    if (!category) { setError("בחרו קטגוריה"); return; }
    const entry = { id: draft.id || crypto.randomUUID(), title, description: draft.description.trim(), link, images: draft.images || [], category };
    setState(setData, d => ({
      inspirations: d.inspirations.some(x => x.id === entry.id) ? d.inspirations.map(x => x.id === entry.id ? entry : x) : [entry, ...d.inspirations],
      inspirationCategories: d.inspirationCategories.includes(category) ? d.inspirationCategories : [...d.inspirationCategories, category],
    }));
    tracker.settle(entry.images, true); tracker.reset([]); setDraft(emptyInspiration(category)); setError("");
  };
  const remove = item => { if (!window.confirm(`למחוק את "${item.title}"? הפעולה אינה הפיכה.`)) return; purgeImages(item.images); setState(setData, d => ({ inspirations: d.inspirations.filter(x => x.id !== item.id) })); if (draft.id === item.id) startDraft(emptyInspiration(categories[0])); };
  const addCategory = e => {
    e.preventDefault(); const name = newCategory.trim();
    if (!name) return;
    if (name.length > 40) { setCategoryError("שם קטגוריה עד 40 תווים"); return; }
    if (categories.some(c => c.toLocaleLowerCase() === name.toLocaleLowerCase())) { setCategoryError("קטגוריה כזו כבר קיימת"); return; }
    setState(setData, d => ({ inspirationCategories: [...d.inspirationCategories, name] })); setNewCategory(""); setCategoryError("");
  };
  const removeCategory = name => setState(setData, d => ({ inspirationCategories: d.inspirationCategories.filter(c => c !== name) }));
  const editing = !!draft.id;
  const orphans = items.filter(i => !categories.includes(i.category));
  const sections = [...categories.map(c => [c, items.filter(i => i.category === c)]), ...(orphans.length ? [["ללא קטגוריה", orphans]] : [])];
  const card = item => <Card key={item.id}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "start" }}>
      <h3 style={{ margin: 0, overflowWrap: "anywhere" }}>{item.title}</h3>
      <div style={{ display: "flex", flex: "none" }}>
        <button type="button" onClick={() => { startDraft({ ...emptyInspiration(categories[0]), ...item, isCustomCategory: false }); window.scrollTo?.({ top: 0, behavior: "smooth" }); }} aria-label={`עריכת ${item.title}`} style={{ border: 0, background: "transparent", color: "#44514A", minWidth: 44, minHeight: 44, cursor: "pointer" }}><Pencil size={17} /></button>
        <button type="button" onClick={() => remove(item)} aria-label={`מחיקת ${item.title}`} style={{ border: 0, background: "transparent", color: "#8a6a64", minWidth: 44, minHeight: 44, cursor: "pointer" }}><Trash2 size={17} /></button>
      </div>
    </div>
    {item.description && <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.description}</p>}
    {imagesOf(item).length > 0 && <div style={{ marginTop: 8 }}><ImageStrip entry={item} /></div>}
    {item.link && <a href={item.link} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 4, minHeight: 44, color: "#176f7a", overflowWrap: "anywhere" }}><ExternalLink size={15} />{(() => { try { return new URL(item.link).hostname.replace(/^www\./, ""); } catch { return item.link; } })()}</a>}
  </Card>;
  return <div style={{ display: "grid", gap: 12 }}>
    <div><h2 style={{ margin: 0 }}>השראות</h2><span style={{ color: "#63716A" }}>רעיונות, תמונות וקישורים לבית החדש</span></div>
    <Card>
      <form onSubmit={save} style={{ display: "grid", gap: 10 }}>
        <h3 style={{ margin: 0 }}>{editing ? "עריכת השראה" : "השראה חדשה"}</h3>
        <Field label="כותרת"><input value={draft.title} onChange={e => patch("title", e.target.value)} style={input} /></Field>
        <Field label="קטגוריה"><select value={draft.isCustomCategory ? "__custom__" : draft.category} onChange={e => { const value = e.target.value; if (value === "__custom__") setDraft(d => ({ ...d, category: "", isCustomCategory: true })); else patch("category", value); }} disabled={!categories.length} style={input}>{categories.map(c => <option key={c} value={c}>{c}</option>)}<option value="__custom__">קטגוריה אחרת — הזנה חופשית</option></select></Field>
        {draft.isCustomCategory && <Field label="קטגוריה חדשה"><input value={draft.category} onChange={e => patch("category", e.target.value)} placeholder="לדוגמה: מרפסת" style={input} /></Field>}
        <Field label="תיאור"><textarea value={draft.description} onChange={e => patch("description", e.target.value)} style={{ ...input, minHeight: 76, paddingTop: 8 }} /></Field>
        <Field label="קישור"><input dir="ltr" inputMode="url" value={draft.link} onChange={e => patch("link", e.target.value)} placeholder="https://..." style={input} /></Field>
        <ImageAttachments images={draft.images} onChange={v => patch("images", v)} tracker={tracker} label="תמונות" />
        {error && <p role="alert" style={{ margin: 0, color: "#b42318" }}>{error}</p>}
        <div style={{ display: "flex", justifyContent: "end", gap: 8 }}>{(editing || (draft.images || []).length > 0) && <Btn secondary onClick={() => startDraft(emptyInspiration(categories[0]))}>ביטול</Btn>}<Btn>{editing ? "שמירה" : <><Plus size={18} />הוספה</>}</Btn></div>
      </form>
    </Card>
    {sections.map(([g, rows]) => rows.length ? <div key={g} style={{ display: "grid", gap: 12 }}>
      <h3 style={{ margin: 0 }}>{g} <span style={{ color: "#63716A", fontWeight: 400, fontSize: 14 }}>({rows.length})</span></h3>
      {rows.map(card)}
    </div> : null)}
    {!items.length && <Card><p style={{ margin: 0, color: "#63716A" }}>עדיין אין השראות. הוסף כותרת, תיאור וקישור למעלה.</p></Card>}
    <Card>
      <h3 style={{ marginTop: 0 }}>קטגוריות</h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {categories.map(c => { const count = items.filter(i => i.category === c).length; return <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 999, background: "#E6F0EB", color: "#1D5A48" }}>{c} · {count}{count === 0 && <button type="button" onClick={() => removeCategory(c)} aria-label={`מחיקת הקטגוריה ${c}`} style={{ border: 0, background: "transparent", cursor: "pointer", padding: 0, display: "grid", placeItems: "center", minWidth: 32, minHeight: 32, margin: "-6px", color: "#1D5A48" }}><X size={15} /></button>}</span>; })}
      </div>
      <form onSubmit={addCategory} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 8 }}>
        <input value={newCategory} onChange={e => { setNewCategory(e.target.value); setCategoryError(""); }} placeholder="קטגוריה חדשה (למשל: מרפסת, חדר עבודה)" aria-label="קטגוריה חדשה" style={input} />
        <Btn secondary><Plus size={18} />הוסף</Btn>
      </form>
      {categoryError && <p role="alert" style={{ margin: "8px 0 0", color: "#b42318" }}>{categoryError}</p>}
      <p style={{ margin: "10px 0 0", color: "#63716A", fontSize: 14 }}>קטגוריה נמחקת רק כשאין בה השראות (יש לה ‏X‏ כשהיא ריקה).</p>
    </Card>
  </div>;
}
export default function RenovationHQ() {
 const { data: raw, setData, ready } = useStore(STORE_KEY, INIT); const [tab,setTab]=useState("dash"); const [editing,setEditing]=useState(null); const data=useMemo(()=>ensure(raw),[raw]);
 const tabFromUrl=()=>{const candidate=new URLSearchParams(window.location.search).get("tab");return NAV.some(([id])=>id===candidate)?candidate:"dash";};
 useEffect(()=>{setTab(tabFromUrl());const onPopState=()=>setTab(tabFromUrl());window.addEventListener("popstate",onPopState);return()=>window.removeEventListener("popstate",onPopState);},[]);
 const selectTab=id=>{setTab(id);const url=new URL(window.location.href);if(id==="dash")url.searchParams.delete("tab");else url.searchParams.set("tab",id);window.history.pushState({tab:id},"",url.pathname+url.search+url.hash);};
 if(!ready)return <div style={{padding:24}}>טוען את חברת השיפוץ…</div>;
 const save=item=>{setState(setData,d=>{ const customName = item.supplierName?.trim(); let suppliers = d.suppliers || []; let saved = item; if (customName) { const existing = suppliers.find(s => s.name.trim().toLocaleLowerCase() === customName.toLocaleLowerCase()); const supplierId = existing?.id || crypto.randomUUID(); if (!existing) suppliers = [...suppliers, { ...emptySupplier(), id: supplierId, name: customName }]; saved = { ...item, supplierId, supplierName: "", isCustomSupplier: false }; } return { suppliers, items:d.items.some(x=>x.id===saved.id)?d.items.map(x=>x.id===saved.id?saved:x):[...d.items,saved] }; });setEditing(null);};
 const remove=id=>{ if (!window.confirm("למחוק את פריט הרכש? הפעולה אינה הפיכה.")) return; purgeImages(data.items.find(x=>x.id===id)?.images); setState(setData,d=>({items:d.items.filter(x=>x.id!==id)})); };
 const content=tab==="dash"?<Dashboard data={data} select={setEditing}/>:tab==="items"?<Items data={data} edit={setEditing} add={()=>setEditing(emptyItem())} remove={remove}/>:tab==="suppliers"?<Suppliers data={data} setData={setData}/>:tab==="plan"?<Plan data={data} setData={setData}/>:tab==="checklist"?<Checklist data={data} setData={setData}/>:tab==="inspirations"?<Inspirations data={data} setData={setData}/>:<Docs data={data} setData={setData}/>;
 return <div dir="rtl" className="renovation-hq"><div className="renovation-shell" style={{display:"grid",gap:16}}><nav className="renovation-nav" aria-label="מחלקות השיפוץ" style={{display:"flex",gap:4,overflowX:"auto",borderBottom:"1px solid #DCE3DE",paddingBottom:8}}>{NAV.map(([id,label])=><button aria-current={tab===id?"page":undefined} key={id} onClick={()=>selectTab(id)} style={{whiteSpace:"nowrap",minHeight:44,border:0,borderRadius:9,padding:"0 12px",background:tab===id?"#E6F0EB":"transparent",color:tab===id?"#1D5A48":"#44514A",font:"inherit",fontWeight:tab===id?700:400}}>{label}</button>)}</nav>{content}</div><nav className="renovation-mobile-nav" aria-label="ניווט מהיר">{NAV.map(([id,label])=><button aria-current={tab===id?"page":undefined} key={id} onClick={()=>selectTab(id)}>{label.replace("תוכנית וזמן","תוכנית").replace("תקציב ורכש","רכש").replace("מסמכים ובדק","מסמכים")}</button>)}</nav>{editing&&<ItemEditor item={editing.name?editing:null} suppliers={data.suppliers} onSave={save} onClose={()=>setEditing(null)}/>}</div>;
}