"use client";
import { useState } from "react";
import { Plus, Trash2, ShoppingCart, Check, ChevronDown } from "lucide-react";
import { INK, BG, GREEN, RUST, AMBER, MUTED, LINE, cardStyle, inputStyle, tabBtn } from "@/lib/theme";
import { toN } from "@/lib/format";
import { Sec, Metric, LabeledInput } from "@/lib/ui";
import {
  CATEGORIES, PRIORITIES, FALLBACK_CATEGORY, FILTERS,
  quickAddItem, addItem, updateItem, removeItem, markPurchased, updateHistoryEntry,
  groupByRoute, filterEntries, detectCategory, addCategoryKeyword,
  budgetVsActual, budgetTrend, repeatProducts, repeatCategories, pricePerUnit,
  groceryAlerts, INSUFFICIENT_DATA,
} from "./grocery-model";

const ils = v => "₪" + Math.round(v || 0).toLocaleString("he-IL");
const FILTER_LABEL = { all: "הכול", need: "צריך לקנות", purchased: "נרכש" };
const PRIORITY_COLOR = { "דחוף": RUST, "חשוב": AMBER, "רגיל": MUTED };
const ALERT_COLOR = { critical: RUST, warning: AMBER, info: MUTED };

function Pill({ color, children }) {
  return <span style={{ fontSize: 11, color: BG, background: color, borderRadius: 2, padding: "2px 9px", whiteSpace: "nowrap" }}>{children}</span>;
}

/** שורת פריט: תצוגה מקופלת + טופס עריכה מלא (כמות/יחידה, קטגוריה, עדיפות, הערה) בפתיחה. */
function ItemRow({ item, onUpdate, onDelete, onPurchase, purchased }) {
  const [open, setOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [price, setPrice] = useState(item.price ?? "");

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
          </div>
          {item.note && <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>{item.note}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {!purchased && (
            <button onClick={() => onPurchase(item.id)} title="סמן כנרכש" aria-label="סמן כנרכש"
              style={{ border: `1px solid ${GREEN}`, background: "transparent", color: GREEN, borderRadius: 2, width: 30, height: 30, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Check size={15} />
            </button>
          )}
          <ChevronDown size={14} color={MUTED} style={{ transform: open ? "rotate(180deg)" : "none", cursor: "pointer" }} onClick={() => setOpen(o => !o)} />
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
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: RUST }}>למחוק לצמיתות?</span>
              <button onClick={() => onDelete(item.id)} style={{ fontSize: 12, color: BG, background: RUST, border: "none", borderRadius: 2, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>מחק</button>
              <button onClick={() => setConfirmDel(false)} style={{ fontSize: 12, border: `1px solid ${LINE}`, background: "transparent", borderRadius: 2, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>ביטול</button>
            </div>
          )}
        </div>
      )}

      {open && purchased && (
        <div style={{ marginTop: 10, marginRight: 4, display: "flex", gap: 8, alignItems: "flex-end" }}>
          <LabeledInput label="מחיר בפועל (₪)" value={price} onBlur={v => { setPrice(v); onUpdate(item.id, { price: toN(v) || null }); }} />
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
    <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
      <input className="hq-field" placeholder="הוסיפו פריט ולחצו Enter…" value={name}
        onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") submit(); }}
        style={{ ...inputStyle, flex: 1, border: `1px solid ${LINE}`, borderRadius: 2, padding: "9px 10px" }} />
      <button onClick={submit} aria-label="הוסף פריט" style={{ border: "none", background: INK, color: BG, borderRadius: 2, width: 40, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Plus size={16} />
      </button>
      <button onClick={onOpenForm} style={{ fontSize: 12, border: `1px solid ${LINE}`, background: "transparent", borderRadius: 2, padding: "0 10px", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
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
  const onUpdatePurchased = (id, p) => patch(prev => updateHistoryEntry(prev, id, p));

  const entries = filterEntries(g, filter);
  const activeCount = g.items.length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 18 }}>הקנייה הבאה</h3>
        <span style={{ fontSize: 12, color: MUTED }}>{activeCount} פריטים ברשימה</span>
      </div>

      <QuickAdd onQuickAdd={onQuickAdd} onOpenForm={() => setShowFullForm(s => !s)} />
      {showFullForm && <FullAddForm dict={g.categoryDict} onAdd={onAdd} onClose={() => setShowFullForm(false)} />}

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
        groupByRoute(g.items).length === 0 ? (
          <div style={{ ...cardStyle, padding: 16, fontSize: 14, color: MUTED, lineHeight: 1.7 }}>אין פריטים ברשימה. הוסיפו פריט למעלה.</div>
        ) : groupByRoute(g.items).map(({ category, items }) => (
          <div key={category} style={{ marginBottom: 4 }}>
            <Sec title={category} />
            <div style={cardStyle}>
              {items.map(item => <ItemRow key={item.id} item={item} purchased={false} onUpdate={onUpdate} onDelete={onDelete} onPurchase={onPurchase} />)}
            </div>
          </div>
        ))
      ) : (
        <div style={cardStyle}>
          {entries.length === 0 && <div style={{ padding: 16, fontSize: 14, color: MUTED, lineHeight: 1.7 }}>אין פריטים להצגה בפילטר הזה.</div>}
          {entries.map(item => (
            <ItemRow key={`${item.purchased ? "h" : "i"}-${item.id}`} item={item} purchased={item.purchased}
              onUpdate={item.purchased ? onUpdatePurchased : onUpdate} onDelete={onDelete} onPurchase={onPurchase} />
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
        <div style={{ fontSize: 11, color: MUTED, marginBottom: 3 }}>תקציב חודשי לסופר (₪)</div>
        <input className="hq-field" defaultValue={g.monthlyBudget ?? ""} key={String(g.monthlyBudget)}
          onBlur={e => setGrocery(prev => ({ ...prev, monthlyBudget: toN(e.target.value) || null }))}
          style={{ ...inputStyle, width: 160, border: `1px solid ${LINE}`, borderRadius: 2, padding: "8px 10px" }} />
      </div>

      {alerts.map(a => (
        <div key={a.id} style={{ border: `1px solid ${ALERT_COLOR[a.level]}`, background: "#fff", borderRadius: 8, padding: "10px 14px", marginBottom: 8, fontSize: 13, color: INK }}>
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
          <div key={r.name} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${LINE}`, fontSize: 13 }}>
            <span>{r.name}</span><span style={{ color: MUTED }}>{r.count} חודשים</span>
          </div>
        ))}
      </div>

      <Sec title="קטגוריות חוזרות" />
      <div style={cardStyle}>
        {repCats.length === 0 && <div style={{ padding: "4px 0", fontSize: 13, color: MUTED }}>{INSUFFICIENT_DATA}</div>}
        {repCats.map(r => (
          <div key={r.category} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${LINE}`, fontSize: 13 }}>
            <span>{r.category}</span><span style={{ color: MUTED }}>{r.count} חודשים</span>
          </div>
        ))}
      </div>

      <Sec title="מחיר ליחידה (רכישות אחרונות עם מחיר וכמות תקינים)" />
      <div style={cardStyle}>
        {pricedRecent.length === 0 && <div style={{ padding: "4px 0", fontSize: 13, color: MUTED }}>{INSUFFICIENT_DATA} — הזינו מחיר וכמות תקינים בהיסטוריית הרכישות.</div>}
        {pricedRecent.map(h => (
          <div key={h.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${LINE}`, fontSize: 13 }}>
            <span>{h.name}</span><span style={{ color: MUTED }}>{ils(pricePerUnit(h))} ל{h.unit || "יח׳"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Grocery({ d, setD }) {
  const g = d.grocery;
  const [sub, setSub] = useState("list"); // list | savings
  const setGrocery = updater => setD(prev => ({ ...prev, grocery: typeof updater === "function" ? updater(prev.grocery) : updater }));

  if (!g) return null; // ensureGrocery ב-Company.jsx ממלא את השדה; זו רק הגנה כפולה

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        <button onClick={() => setSub("list")} style={tabBtn(sub === "list")}><ShoppingCart size={13} style={{ marginLeft: 5 }} />רשימת קניות</button>
        <button onClick={() => setSub("savings")} style={tabBtn(sub === "savings")}>חיסכון</button>
      </div>
      {sub === "list" ? <ShoppingList g={g} setGrocery={setGrocery} /> : <Savings g={g} setGrocery={setGrocery} />}
    </div>
  );
}
