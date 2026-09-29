"use client";
import { useEffect, useState } from "react";
import { ShoppingBasket, Check, ChevronDown, Plus, Receipt, RotateCcw, Store, X } from "lucide-react";
import { INK, BG, GREEN, RUST, AMBER, MUTED, LINE, cardStyle, inputStyle, tabBtn } from "@/lib/theme";
import { toN } from "@/lib/format";
import { Sec, Metric, LabeledInput } from "@/lib/ui";
import { useStore } from "@/lib/store";
import { STORE_KEY, INIT, ensureHousehold } from "./model";
import {
  CATEGORIES, PRIORITIES, FILTERS,
  quickAddItem, addItem, updateItem, removeItem, markPurchased, updateHistoryEntry,
  groupByRoute, filterEntries, detectCategory, addCategoryKeyword, restoreToList,
  budgetVsActual, budgetTrend, repeatProducts, repeatCategories, pricePerUnit,
  groceryAlerts, INSUFFICIENT_DATA,
  knownStores, logReceipt, updateReceiptImages, storeTotals, mostPurchasedProducts, mostPurchasedCategories, cheapestStoreSeen,
} from "./grocery-model";
// רכיב תמונות גנרי, מרחב-משותף, שאול מ"בית חדש" (companies/beit-hadash) בכוונה — ראה תיאור ה-PR:
// אין fallback ל-base64, ו"לא מופעל" הוא ההתנהגות הצפויה כל עוד Storage לא הופעל בפרודקשן.
// ייבוא חוצה-חברות מקובל כאן כי זה widget UI גנרי, לא לוגיקת דומיין; הזזה ל-lib/ תיעשה בנפרד בעתיד.
import ImageAttachments, { ImageStrip, useImageTracker } from "@/companies/beit-hadash/ImageAttachments";
import { imagesOf } from "@/companies/beit-hadash/images";

/*
  משק בית — v1: "סופר" בלבד (רשימת קניות משותפת + היסטוריית רכישות + חיסכון).
  שיתוף בין לירון לליאור: היום (לפני שה-RBAC/workspace routing ב-lib/workspace.js פעיל — ראה
  PR) הנתונים נשמרים תחת company_state לפי המשתמש המחובר, בדיוק כמו כל תת-חברה אחרת כרגע —
  כלומר "משותף" בפועל רק במובן שיש דף אחד; לא שיתוף אמיתי בין שני משתמשים עדיין. זה מתועד
  בפירוט בתיאור ה-PR, ואינו דבר שהומצא כאן: כך עובדות כל תת-החברות היום.
*/

const ils = v => "₪" + Math.round(v || 0).toLocaleString("he-IL");
const FILTER_LABEL = { all: "הכול", need: "צריך לקנות", purchased: "נרכש" };
const PRIORITY_COLOR = { "דחוף": RUST, "חשוב": AMBER, "רגיל": MUTED };
const ALERT_COLOR = { critical: RUST, warning: AMBER, info: MUTED };

function Pill({ color, children }) {
  return <span style={{ fontSize: 11, color: BG, background: color, borderRadius: 2, padding: "2px 9px", whiteSpace: "nowrap" }}>{children}</span>;
}

/** שורת פריט: תצוגה מקופלת + טופס עריכה מלא (כמות/יחידה, קטגוריה, עדיפות, הערה) בפתיחה. */
function ItemRow({ item, onUpdate, onDelete, onPurchase, onRestore, purchased }) {
  const [open, setOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [price, setPrice] = useState(item.price ?? "");
  const [store, setStore] = useState(item.store ?? "");

  return (
    <div style={{ borderBottom: `1px solid ${LINE}`, padding: "10px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1, cursor: "pointer" }} onClick={() => setOpen(o => !o)}>
          <div style={{ fontSize: 14, overflowWrap: "anywhere", textDecoration: purchased ? "line-through" : "none", opacity: purchased ? 0.55 : 1 }}>
            {item.name}
            {item.qty != null && <span style={{ color: MUTED, marginRight: 8, fontSize: 12 }}>{item.qty} {item.unit}</span>}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
            <Pill color={INK}>{item.category}</Pill>
            {!purchased && <Pill color={PRIORITY_COLOR[item.priority] || MUTED}>{item.priority}</Pill>}
            {purchased && item.price != null && <Pill color={GREEN}>{ils(item.price)}</Pill>}
            {purchased && item.store && <Pill color={MUTED}>{item.store}</Pill>}
          </div>
          {item.note && <div style={{ fontSize: 12, color: MUTED, marginTop: 4, overflowWrap: "anywhere" }}>{item.note}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {!purchased && (
            <button onClick={() => onPurchase(item.id)} title="סמן כנרכש" aria-label={`סמן ${item.name} כנרכש`}
              style={{ border: `1px solid ${GREEN}`, background: "transparent", color: GREEN, borderRadius: 2, width: 32, height: 32, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Check size={15} />
            </button>
          )}
          {purchased && (
            <button onClick={() => onRestore(item.id)} title="שחזור לרשימת הקניות (סומן בטעות)" aria-label={`שחזור ${item.name} לרשימת הקניות`}
              style={{ border: `1px solid ${MUTED}`, background: "transparent", color: INK, borderRadius: 2, width: 32, height: 32, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <RotateCcw size={14} />
            </button>
          )}
          <button aria-label={open ? "כיווץ" : "הרחבה"} onClick={() => setOpen(o => !o)} style={{ border: "none", background: "transparent", cursor: "pointer", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ChevronDown size={14} color={MUTED} style={{ transform: open ? "rotate(180deg)" : "none" }} />
          </button>
        </div>
      </div>

      {open && !purchased && (
        <div style={{ marginTop: 10, marginRight: 4, display: "grid", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 8 }}>
            <LabeledInput label="כמות" value={item.qty ?? ""} onBlur={v => onUpdate(item.id, { qty: toN(v) || null })} />
            <LabeledInput label="יחידה" text value={item.unit} onBlur={v => onUpdate(item.id, { unit: v })} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 3 }}>קטגוריה</div>
            <select value={item.category} onChange={e => onUpdate(item.id, { category: e.target.value })} className="hq-field" style={{ ...inputStyle, width: "100%" }}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 3 }}>עדיפות</div>
            <select value={item.priority} onChange={e => onUpdate(item.id, { priority: e.target.value })} className="hq-field" style={{ ...inputStyle, width: "100%" }}>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <LabeledInput label="הערה" text value={item.note} onBlur={v => onUpdate(item.id, { note: v })} />
          {!confirmDel ? (
            <button onClick={() => setConfirmDel(true)} style={{ fontSize: 12, color: RUST, background: "none", border: "none", cursor: "pointer", textAlign: "right", padding: 0, fontFamily: "inherit" }}>
              מחק פריט
            </button>
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: RUST }}>למחוק לצמיתות?</span>
              <button onClick={() => onDelete(item.id)} style={{ fontSize: 12, color: BG, background: RUST, border: "none", borderRadius: 2, padding: "6px 10px", cursor: "pointer", fontFamily: "inherit" }}>מחק</button>
              <button onClick={() => setConfirmDel(false)} style={{ fontSize: 12, border: `1px solid ${LINE}`, background: "transparent", borderRadius: 2, padding: "6px 10px", cursor: "pointer", fontFamily: "inherit" }}>ביטול</button>
            </div>
          )}
        </div>
      )}

      {open && purchased && (
        <div style={{ marginTop: 10, marginRight: 4, display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", minWidth: 0 }}>
          <LabeledInput label="מחיר בפועל (₪)" value={price} onBlur={v => { setPrice(v); onUpdate(item.id, { price: toN(v) || null }); }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 3 }}>חנות</div>
            <input className="hq-field" list="household-known-stores" value={store} onChange={e => setStore(e.target.value)}
              onBlur={e => onUpdate(item.id, { store: e.target.value })} placeholder="איפה קניתם?"
              style={{ ...inputStyle, minWidth: 0, width: 140 }} />
          </div>
          <span style={{ fontSize: 11, color: MUTED, paddingBottom: 8 }}>
            {new Date(item.purchasedAt).toLocaleDateString("he-IL")}
          </span>
        </div>
      )}
    </div>
  );
}

function QuickAdd({ onQuickAdd, onOpenForm }) {
  const [name, setName] = useState("");
  const submit = () => { if (!name.trim()) return; onQuickAdd(name); setName(""); };
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 14, minWidth: 0 }}>
      <input className="hq-field" placeholder="הוסיפו פריט ולחצו Enter…" value={name}
        onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") submit(); }}
        style={{ ...inputStyle, flex: 1, minWidth: 0, border: `1px solid ${LINE}`, borderRadius: 2, padding: "9px 10px" }} />
      <button onClick={submit} aria-label="הוסף פריט" style={{ border: "none", background: INK, color: BG, borderRadius: 2, width: 40, flexShrink: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Plus size={16} />
      </button>
      <button onClick={onOpenForm} style={{ fontSize: 12, border: `1px solid ${LINE}`, background: "transparent", borderRadius: 2, padding: "0 10px", flexShrink: 0, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
        טופס מלא
      </button>
    </div>
  );
}

function FullAddForm({ dict, onAdd, onClose }) {
  const [f, setF] = useState({ name: "", qty: "", unit: "", category: "", priority: "רגיל", note: "" });
  const detected = f.name.trim() ? detectCategory(f.name, dict) : "";
  const submit = () => {
    if (!f.name.trim()) return;
    onAdd({ name: f.name, qty: toN(f.qty) || null, unit: f.unit, category: f.category || undefined, priority: f.priority, note: f.note });
    onClose();
  };
  return (
    <div style={{ ...cardStyle, padding: 14 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <input className="hq-field" placeholder="שם פריט" value={f.name} onChange={e => setF(s => ({ ...s, name: e.target.value }))} style={inputStyle} />
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 8 }}>
          <input className="hq-field" placeholder="כמות" value={f.qty} onChange={e => setF(s => ({ ...s, qty: e.target.value }))} style={inputStyle} />
          <input className="hq-field" placeholder="יחידה (יח׳, ק״ג, ליטר...)" value={f.unit} onChange={e => setF(s => ({ ...s, unit: e.target.value }))} style={inputStyle} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: MUTED, marginBottom: 3 }}>קטגוריה {f.category ? "" : detected && `(זוהה אוטומטית: ${detected})`}</div>
          <select value={f.category} onChange={e => setF(s => ({ ...s, category: e.target.value }))} className="hq-field" style={{ ...inputStyle, width: "100%" }}>
            <option value="">זיהוי אוטומטי</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, color: MUTED, marginBottom: 3 }}>עדיפות</div>
          <select value={f.priority} onChange={e => setF(s => ({ ...s, priority: e.target.value }))} className="hq-field" style={{ ...inputStyle, width: "100%" }}>
            {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <input className="hq-field" placeholder="הערה" value={f.note} onChange={e => setF(s => ({ ...s, note: e.target.value }))} style={inputStyle} />
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={submit} style={{ flex: 1, border: "none", background: INK, color: BG, borderRadius: 2, padding: "8px 0", cursor: "pointer", fontFamily: "inherit" }}>הוסף</button>
          <button onClick={onClose} style={{ flex: 1, border: `1px solid ${LINE}`, background: "transparent", borderRadius: 2, padding: "8px 0", cursor: "pointer", fontFamily: "inherit" }}>ביטול</button>
        </div>
      </div>
    </div>
  );
}

function ShoppingList({ g, setGrocery }) {
  const [filter, setFilter] = useState("need");
  const [view, setView] = useState("route"); // route (מסלול קנייה) | flat (רשימה שטוחה)
  const [showFullForm, setShowFullForm] = useState(false);

  const patch = fn => setGrocery(fn);
  const onQuickAdd = name => patch(prev => quickAddItem(prev, name));
  // בחירת קטגוריה ידנית (בטופס המלא) "מלמדת" את המילון האוטומטי לפעם הבאה — זה מה שהופך אותו לעריכה.
  const onAdd = fields => patch(prev => {
    const next = addItem(prev, fields);
    return fields.category ? { ...next, categoryDict: addCategoryKeyword(next.categoryDict, fields.name, fields.category) } : next;
  });
  const onUpdate = (id, p) => patch(prev => {
    const next = updateItem(prev, id, p);
    const item = p.category && prev.items.find(i => i.id === id);
    return item ? { ...next, categoryDict: addCategoryKeyword(next.categoryDict, item.name, p.category) } : next;
  });
  const onDelete = id => patch(prev => removeItem(prev, id));
  const onPurchase = id => patch(prev => markPurchased(prev, id));
  const onRestore = id => patch(prev => restoreToList(prev, id));
  const onUpdatePurchased = (id, p) => patch(prev => updateHistoryEntry(prev, id, p));

  const entries = filterEntries(g, filter);
  const activeCount = g.items.length;
  const routeGroups = groupByRoute(g.items);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 18 }}>הקנייה הבאה</h3>
        <span style={{ fontSize: 12, color: MUTED }}>{activeCount} פריטים ברשימה</span>
      </div>

      <QuickAdd onQuickAdd={onQuickAdd} onOpenForm={() => setShowFullForm(s => !s)} />
      {showFullForm && <FullAddForm dict={g.categoryDict} onAdd={onAdd} onClose={() => setShowFullForm(false)} />}
      <datalist id="household-known-stores">{knownStores(g).map(s => <option key={s} value={s} />)}</datalist>

      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={tabBtn(filter === f)}>{FILTER_LABEL[f]}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => setView(v => (v === "route" ? "flat" : "route"))} style={{ fontSize: 12, border: `1px solid ${LINE}`, background: "transparent", borderRadius: 2, padding: "0 10px", height: 34, cursor: "pointer", fontFamily: "inherit" }}>
          {view === "route" ? "תצוגה: לפי מסלול קנייה" : "תצוגה: רשימה שטוחה"}
        </button>
      </div>

      {filter === "need" && view === "route" ? (
        routeGroups.length === 0 ? (
          <div style={{ ...cardStyle, padding: 16, fontSize: 14, color: MUTED, lineHeight: 1.7 }}>אין פריטים ברשימה. הוסיפו פריט למעלה.</div>
        ) : routeGroups.map(({ category, items }) => (
          <div key={category} style={{ marginBottom: 4 }}>
            <Sec title={category} />
            <div style={cardStyle}>
              {items.map(item => <ItemRow key={item.id} item={item} purchased={false} onUpdate={onUpdate} onDelete={onDelete} onPurchase={onPurchase} onRestore={onRestore} />)}
            </div>
          </div>
        ))
      ) : (
        <div style={cardStyle}>
          {entries.length === 0 && <div style={{ padding: 16, fontSize: 14, color: MUTED, lineHeight: 1.7 }}>אין פריטים להצגה בפילטר הזה.</div>}
          {entries.map(item => (
            <ItemRow key={`${item.purchased ? "h" : "i"}-${item.id}`} item={item} purchased={item.purchased}
              onUpdate={item.purchased ? onUpdatePurchased : onUpdate} onDelete={onDelete} onPurchase={onPurchase} onRestore={onRestore} />
          ))}
        </div>
      )}
    </div>
  );
}

function Savings({ g, setGrocery }) {
  const bva = budgetVsActual(g);
  const trend = budgetTrend(g.history);
  const alerts = groceryAlerts(g);
  const repProducts = repeatProducts(g.history).slice(0, 8);
  const repCats = repeatCategories(g.history).slice(0, 6);
  const pricedRecent = [...g.history].filter(h => pricePerUnit(h) != null).sort((a, b) => (a.purchasedAt < b.purchasedAt ? 1 : -1)).slice(0, 8);

  return (
    <div>
      <h3 style={{ margin: "0 0 10px", fontSize: 18 }}>חיסכון</h3>

      <div style={{ ...cardStyle, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: MUTED, marginBottom: 3 }}>תקציב חודשי למשק הבית (₪)</div>
        <input className="hq-field" defaultValue={g.monthlyBudget ?? ""} key={String(g.monthlyBudget)}
          onBlur={e => setGrocery(prev => ({ ...prev, monthlyBudget: toN(e.target.value) || null }))}
          style={{ ...inputStyle, width: "100%", maxWidth: 200, border: `1px solid ${LINE}`, borderRadius: 2, padding: "8px 10px" }} />
      </div>

      {alerts.map(a => (
        <div key={a.id} style={{ border: `1px solid ${ALERT_COLOR[a.level]}`, background: "#fff", borderRadius: 8, padding: "10px 14px", marginBottom: 8, fontSize: 13, color: INK, overflowWrap: "anywhere" }}>
          {a.message}
        </div>
      ))}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <Metric label="תקציב חודשי" value={bva.budget != null ? ils(bva.budget) : "לא הוגדר"} />
        <Metric label="הוצאה בפועל החודש" value={bva.spend.hasData ? ils(bva.spend.total) : INSUFFICIENT_DATA} color={bva.over ? RUST : GREEN} />
        <Metric label="מגמה מול ממוצע היסטורי" value={trend.available ? `${trend.deltaPercent > 0 ? "+" : ""}${trend.deltaPercent}%` : INSUFFICIENT_DATA}
          sub={trend.available ? `ממוצע: ${ils(trend.baselineAvg)}` : "נדרשים לפחות 2 חודשים מלאים של נתונים"}
          color={trend.available && trend.deltaPercent > 0 ? RUST : GREEN} />
      </div>

      <Sec title="מוצרים חוזרים" />
      <div style={cardStyle}>
        {repProducts.length === 0 && <div style={{ padding: "4px 0", fontSize: 13, color: MUTED }}>{INSUFFICIENT_DATA} — עדיין אין מוצר שנרכש ביותר מחודש אחד.</div>}
        {repProducts.map(r => (
          <div key={r.name} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${LINE}`, fontSize: 13, gap: 8 }}>
            <span style={{ overflowWrap: "anywhere", minWidth: 0 }}>{r.name}</span><span style={{ color: MUTED, flexShrink: 0 }}>{r.count} חודשים</span>
          </div>
        ))}
      </div>

      <Sec title="קטגוריות חוזרות" />
      <div style={cardStyle}>
        {repCats.length === 0 && <div style={{ padding: "4px 0", fontSize: 13, color: MUTED }}>{INSUFFICIENT_DATA}</div>}
        {repCats.map(r => (
          <div key={r.category} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${LINE}`, fontSize: 13, gap: 8 }}>
            <span>{r.category}</span><span style={{ color: MUTED, flexShrink: 0 }}>{r.count} חודשים</span>
          </div>
        ))}
      </div>

      <Sec title="מחיר ליחידה (רכישות אחרונות עם מחיר וכמות תקינים)" />
      <div style={cardStyle}>
        {pricedRecent.length === 0 && <div style={{ padding: "4px 0", fontSize: 13, color: MUTED }}>{INSUFFICIENT_DATA} — הזינו מחיר וכמות תקינים בהיסטוריית הרכישות.</div>}
        {pricedRecent.map(h => (
          <div key={h.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${LINE}`, fontSize: 13, gap: 8 }}>
            <span style={{ overflowWrap: "anywhere", minWidth: 0 }}>{h.name}</span><span style={{ color: MUTED, flexShrink: 0 }}>{ils(pricePerUnit(h))} ל{h.unit || "יח׳"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** שורת פריט אד-הוק בטופס הקבלה: דבר שלא היה ברשימה (קבלות אמיתיות כוללות תמיד גם כאלה). */
function AdHocRow({ row, onChange, onRemove }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) auto", gap: 6, alignItems: "center" }}>
      <input className="hq-field" placeholder="שם פריט" value={row.name} onChange={e => onChange({ ...row, name: e.target.value })} style={{ ...inputStyle, minWidth: 0 }} />
      <input className="hq-field" placeholder="מחיר ₪" value={row.price} onChange={e => onChange({ ...row, price: e.target.value })} style={{ ...inputStyle, minWidth: 0 }} />
      <input className="hq-field" placeholder="כמות" value={row.qty} onChange={e => onChange({ ...row, qty: e.target.value })} style={{ ...inputStyle, minWidth: 0 }} />
      <button type="button" aria-label="הסרת שורה" onClick={onRemove} style={{ border: "none", background: "transparent", color: MUTED, cursor: "pointer", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={15} /></button>
    </div>
  );
}

/** טופס "קבלה": שם חנות + תאריך, בחירה ממה שברשימה (עם מחיר לכל פריט) ושורות אד-הוק, ותמונה אופציונלית. */
function ReceiptForm({ g, setGrocery }) {
  const stores = knownStores(g);
  const [store, setStore] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [prices, setPrices] = useState({}); // itemId -> price string, נוכח = נבחר
  const [adHoc, setAdHoc] = useState([]);
  const [images, setImages] = useState([]);
  const [error, setError] = useState("");
  const [savedMsg, setSavedMsg] = useState("");
  const tracker = useImageTracker([]);

  const toggleItem = id => setPrices(prev => { const next = { ...prev }; if (id in next) delete next[id]; else next[id] = ""; return next; });
  const reset = () => { tracker.settle(images, false); tracker.reset([]); setStore(""); setPrices({}); setAdHoc([]); setImages([]); setSavedMsg(""); };

  const submit = () => {
    setError(""); setSavedMsg("");
    const listItems = Object.entries(prices).map(([id, p]) => ({ id, price: toN(p) || null }));
    const adHocItems = adHoc.filter(r => r.name.trim()).map(r => ({ name: r.name, price: toN(r.price) || null, qty: toN(r.qty) || null }));
    if (!store.trim()) { setError("בחרו או הזינו שם חנות."); return; }
    if (listItems.length === 0 && adHocItems.length === 0) { setError("בחרו לפחות פריט אחד מהרשימה, או הוסיפו שורה ידנית."); return; }
    const { state: next, receiptId } = logReceipt(g, { store, date, listItems, adHocItems });
    if (!receiptId) { setError("לא הצלחנו לרשום את הקבלה — בדקו את הפרטים."); return; }
    const withImages = images.length ? updateReceiptImages(next, receiptId, images) : next;
    tracker.settle(images, true);
    setGrocery(withImages);
    tracker.reset([]); setStore(""); setPrices({}); setAdHoc([]); setImages([]);
    setSavedMsg("הקבלה נשמרה, ועברה להיסטוריית הרכישות.");
  };

  const activeItems = g.items;

  return (
    <div>
      <h3 style={{ margin: "0 0 4px", fontSize: 18 }}>רישום קבלה</h3>
      <p style={{ fontSize: 13, color: MUTED, margin: "0 0 14px" }}>אחרי קנייה: מי החנות, מתי, ומה נקנה בפועל (מהרשימה ו/או דברים שלא תוכננו) — כדי לדעת איפה כדאי לקנות.</p>

      <div style={{ ...cardStyle, padding: 14, marginBottom: 14, display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 8 }}>
          <div>
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 3 }}>חנות</div>
            <input className="hq-field" list="household-known-stores" placeholder="למשל שופרסל, רמי לוי…" value={store} onChange={e => setStore(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
            <datalist id="household-known-stores">{stores.map(s => <option key={s} value={s} />)}</datalist>
          </div>
          <div>
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 3 }}>תאריך</div>
            <input type="date" className="hq-field" value={date} onChange={e => setDate(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 6 }}>מתוך הרשימה שצריך לקנות ({activeItems.length})</div>
          {activeItems.length === 0 ? (
            <div style={{ fontSize: 13, color: MUTED }}>אין כרגע פריטים פעילים ברשימה — אפשר עדיין להוסיף שורות ידניות למטה.</div>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {activeItems.map(item => {
                const checked = item.id in prices;
                return (
                  <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0, fontSize: 13, cursor: "pointer" }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleItem(item.id)} />
                      <span style={{ overflowWrap: "anywhere" }}>{item.name}{item.qty != null && ` (${item.qty} ${item.unit})`}</span>
                    </label>
                    {checked && <input className="hq-field" placeholder="מחיר ₪" value={prices[item.id]} onChange={e => setPrices(prev => ({ ...prev, [item.id]: e.target.value }))} style={{ ...inputStyle, width: 90, flexShrink: 0 }} />}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 6 }}>שורות נוספות (דברים שלא היו ברשימה)</div>
          <div style={{ display: "grid", gap: 6 }}>
            {adHoc.map((row, i) => (
              <AdHocRow key={i} row={row} onChange={r => setAdHoc(rows => rows.map((x, idx) => (idx === i ? r : x)))} onRemove={() => setAdHoc(rows => rows.filter((_, idx) => idx !== i))} />
            ))}
          </div>
          <button type="button" onClick={() => setAdHoc(rows => [...rows, { name: "", price: "", qty: "" }])}
            style={{ marginTop: 8, fontSize: 12, border: `1px solid ${LINE}`, background: "transparent", borderRadius: 2, padding: "6px 10px", cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Plus size={13} /> הוספת שורה
          </button>
        </div>

        <ImageAttachments images={images} onChange={setImages} tracker={tracker} label="תמונת קבלה" />

        {error && <p role="alert" style={{ color: RUST, fontSize: 13, margin: 0 }}>{error}</p>}
        {savedMsg && <p role="status" style={{ color: GREEN, fontSize: 13, margin: 0 }}>{savedMsg}</p>}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={submit} style={{ flex: 1, border: "none", background: INK, color: BG, borderRadius: 2, padding: "10px 0", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Receipt size={15} /> שמירת קבלה
          </button>
          <button onClick={reset} style={{ border: `1px solid ${LINE}`, background: "transparent", borderRadius: 2, padding: "10px 14px", cursor: "pointer", fontFamily: "inherit" }}>איפוס</button>
        </div>
      </div>

      <Sec title="קבלות אחרונות" />
      <div style={cardStyle}>
        {g.receipts.length === 0 && <div style={{ padding: "10px 0", fontSize: 13, color: MUTED }}>עדיין לא נרשמה שום קבלה.</div>}
        {[...g.receipts].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 10).map(r => {
          const lines = g.history.filter(h => h.receiptId === r.id);
          const total = lines.filter(h => h.price != null).reduce((s, h) => s + h.price, 0);
          return (
            <div key={r.id} style={{ padding: "8px 0", borderBottom: `1px solid ${LINE}`, display: "grid", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
                <span><b>{r.store}</b> · {new Date(r.date).toLocaleDateString("he-IL")} · {lines.length} פריטים</span>
                <span style={{ color: MUTED, flexShrink: 0 }}>{total > 0 ? ils(total) : ""}</span>
              </div>
              {imagesOf(r).length > 0 && <ImageStrip entry={r} size={56} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ByStore({ g }) {
  const totals = storeTotals(g.history);
  const products = mostPurchasedProducts(g.history);
  const cats = mostPurchasedCategories(g.history);
  const cheapest = cheapestStoreSeen(g.history);

  return (
    <div>
      <h3 style={{ margin: "0 0 10px", fontSize: 18 }}>לפי חנות</h3>
      <p style={{ fontSize: 13, color: MUTED, margin: "0 0 14px" }}>איפה קונים הכי הרבה, ומה עולה יותר או פחות בכל חנות — לפי מה שתועד בפועל, בלי נתוני מחירים חיצוניים.</p>

      <Sec title="סך הוצאה לפי חנות" />
      <div style={cardStyle}>
        {totals.length === 0 && <div style={{ padding: "6px 0", fontSize: 13, color: MUTED }}>{INSUFFICIENT_DATA} — עדיין אין רכישות עם חנות ומחיר.</div>}
        {totals.map(t => (
          <div key={t.store} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${LINE}`, fontSize: 13, gap: 8 }}>
            <span style={{ overflowWrap: "anywhere", minWidth: 0 }}>{t.store}</span>
            <span style={{ color: MUTED, flexShrink: 0 }}>{ils(t.total)} · {t.count} פריטים · ממוצע {ils(t.avgItemPrice)}</span>
          </div>
        ))}
      </div>

      <Sec title="הכי נקנה (לפי תדירות)" />
      <div style={cardStyle}>
        {products.byFrequency.length === 0 && <div style={{ padding: "6px 0", fontSize: 13, color: MUTED }}>{INSUFFICIENT_DATA}</div>}
        {products.byFrequency.slice(0, 8).map(p => (
          <div key={p.key} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${LINE}`, fontSize: 13, gap: 8 }}>
            <span style={{ overflowWrap: "anywhere", minWidth: 0 }}>{p.key}</span><span style={{ color: MUTED, flexShrink: 0 }}>{p.count} פעמים</span>
          </div>
        ))}
      </div>

      <Sec title="הכי הרבה כסף (לפי סך הוצאה)" />
      <div style={cardStyle}>
        {products.bySpend.length === 0 && <div style={{ padding: "6px 0", fontSize: 13, color: MUTED }}>{INSUFFICIENT_DATA} — עדיין אין רכישות עם מחיר תקין.</div>}
        {products.bySpend.slice(0, 8).map(p => (
          <div key={p.key} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${LINE}`, fontSize: 13, gap: 8 }}>
            <span style={{ overflowWrap: "anywhere", minWidth: 0 }}>{p.key}</span><span style={{ color: MUTED, flexShrink: 0 }}>{ils(p.total)}</span>
          </div>
        ))}
      </div>

      <Sec title="קטגוריות מובילות" />
      <div style={cardStyle}>
        {cats.byFrequency.length === 0 && <div style={{ padding: "6px 0", fontSize: 13, color: MUTED }}>{INSUFFICIENT_DATA}</div>}
        {cats.byFrequency.slice(0, 6).map(c => (
          <div key={c.key} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${LINE}`, fontSize: 13, gap: 8 }}>
            <span>{c.key}</span><span style={{ color: MUTED, flexShrink: 0 }}>{c.count} פעמים</span>
          </div>
        ))}
      </div>

      <Sec title="החנות הזולה ביותר שראינו (עובדתי, לא המלצה)" />
      <div style={cardStyle}>
        {cheapest.length === 0 && <div style={{ padding: "6px 0", fontSize: 13, color: MUTED, lineHeight: 1.6 }}>{INSUFFICIENT_DATA} — נדרש מחיר לאותו מוצר מ-2 חנויות שונות לפחות כדי להשוות.</div>}
        {cheapest.slice(0, 10).map(f => (
          <div key={f.name} style={{ padding: "6px 0", borderBottom: `1px solid ${LINE}`, fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ overflowWrap: "anywhere", minWidth: 0 }}>{f.name}</span>
              <span style={{ color: GREEN, flexShrink: 0 }}>{f.cheapestStore} · {ils(f.cheapestPrice)}</span>
            </div>
            <div style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>
              {f.stores.map(s => `${s.store} ${ils(s.minPrice)}`).join(" · ")}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Household() {
  const { data: d, setData: setD, ready } = useStore(STORE_KEY, INIT);
  const [sub, setSub] = useState("list"); // list | receipt | byStore | savings

  // תאימות אחורה: משלים שדות חסרים בנתונים ישנים בלי לדרוס שום דבר קיים.
  useEffect(() => {
    if (!d) return;
    const next = ensureHousehold(d);
    if (next !== d) setD(next);
  }, [d, setD]);

  if (!ready || !d) return <p style={{ fontSize: 14, color: MUTED }}>טוען…</p>;
  const g = ensureHousehold(d);

  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ fontSize: 13, color: MUTED, margin: "0 0 14px" }}>רשימת קניות משותפת, קבלות עם חנות ותמונה, ניתוח חיסכון ולפי חנות — v1: סופר בלבד.</p>
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={() => setSub("list")} style={tabBtn(sub === "list")}><ShoppingBasket size={13} style={{ marginLeft: 5 }} />רשימת קניות</button>
        <button onClick={() => setSub("receipt")} style={tabBtn(sub === "receipt")}><Receipt size={13} style={{ marginLeft: 5 }} />קבלה</button>
        <button onClick={() => setSub("byStore")} style={tabBtn(sub === "byStore")}><Store size={13} style={{ marginLeft: 5 }} />לפי חנות</button>
        <button onClick={() => setSub("savings")} style={tabBtn(sub === "savings")}>חיסכון</button>
      </div>
      {sub === "list" && <ShoppingList g={g} setGrocery={setD} />}
      {sub === "receipt" && <ReceiptForm g={g} setGrocery={setD} />}
      {sub === "byStore" && <ByStore g={g} />}
      {sub === "savings" && <Savings g={g} setGrocery={setD} />}
    </div>
  );
}
