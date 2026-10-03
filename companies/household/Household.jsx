"use client";
import { useEffect, useRef, useState } from "react";
import { ShoppingBasket, ChevronDown, Plus, Receipt, Store, X, ScanLine, Tag } from "lucide-react"; // RotateCcw הוסר - הצ'קבוקס מבטל סימון כשמסירים ✓
import { INK, BG, GREEN, RUST, AMBER, MUTED, LINE, cardStyle, inputStyle, tabBtn } from "@/lib/theme";
import { apiFetch, apiErrorMessage } from "@/lib/api-client.mjs";
import { toN } from "@/lib/format";
import { Sec, Metric, LabeledInput } from "@/lib/ui";
import { useStore } from "@/lib/store";
import { STORE_KEY, INIT, ensureHousehold } from "./model";
import {
  CATEGORIES, PRIORITIES, FILTERS,
  quickAddItem, addItem, updateItem, removeItem, markPurchased, updateHistoryEntry, findActiveDuplicate, findReceiptMatch, lastPromoForProduct,
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
const round2 = n => Math.round(n * 100) / 100;
/** טקסט לאייקון "מבצע": המבצע כפי שנקרא מהקבלה אם קיים, אחרת (כמה יחידות באותה רכישה,
    גם בלי שהקבלה סימנה הנחה בפירוש) תיאור מחיר ליחידה - ראו lastPromoForProduct. */
const describePromo = entry => {
  if (!entry) return "";
  if (entry.promo) return entry.promo;
  const perUnit = pricePerUnit(entry);
  return perUnit != null ? `${entry.qty} יח' ב-${ils(entry.price)} (${ils(perUnit)} ליח')` : "";
};
const FILTER_LABEL = { all: "הכול", need: "צריך לקנות", purchased: "נרכש" };
const PRIORITY_COLOR = { "דחוף": RUST, "חשוב": AMBER, "רגיל": MUTED };
const ALERT_COLOR = { critical: RUST, warning: AMBER, info: MUTED };

/** מכווץ תמונה (canvas, לא ספרייה חיצונית) לפני שליחה לסריקת AI - תמונת טלפון גולמית יכולה
    להיות 5-10MB, מיותר ויקר לשלוח ככה. maxDim=1600 מספיק לקריאת טקסט על קבלה. מחזיר base64
    בלי ה-prefix של data URL (זה מה ש-lib/receipt-scan-service.mjs מצפה לקבל). */
function compressReceiptImage(file, maxDim = 1600, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error("compress failed")); return; }
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
        reader.onerror = () => reject(new Error("read failed"));
        reader.readAsDataURL(blob);
      }, "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image load failed")); };
    img.src = url;
  });
}

function Pill({ color, children }) {
  return <span style={{ fontSize: 13, color: BG, background: color, borderRadius: 2, padding: "2px 9px", whiteSpace: "nowrap" }}>{children}</span>;
}

/** בורר כמות עם +/- בשורה עצמה - במקום שדה כמות (וגם יחידה, שהוסרה) שהיו רק בלשונית
    העריכה שנפתחת; פידבק מפורש שזה לא נוח. ברירת המחדל המוצגת היא 1 (גם כש-item.qty
    עדיין null בפועל) - לא יורד מתחת ל-1 מהכפתורים (למחוק פריט שלא רוצים יותר, לא "0"). */
function QtyStepper({ qty, onChange }) {
  const value = qty ?? 1;
  return (
    <div onClick={e => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <button type="button" aria-label="הפחתת כמות" disabled={value <= 1} onClick={() => onChange(value - 1)}
        style={{ width: 22, height: 22, border: `1px solid ${LINE}`, background: "transparent", borderRadius: 2, fontSize: 14, lineHeight: 1, color: value <= 1 ? MUTED : INK, opacity: value <= 1 ? 0.5 : 1, cursor: value <= 1 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        −
      </button>
      <span style={{ fontSize: 13, minWidth: 16, textAlign: "center" }}>{value}</span>
      <button type="button" aria-label="הוספת כמות" onClick={() => onChange(value + 1)}
        style={{ width: 22, height: 22, border: `1px solid ${LINE}`, background: "transparent", borderRadius: 2, fontSize: 14, lineHeight: 1, color: INK, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        +
      </button>
    </div>
  );
}

/** שורת פריט: תצוגה מקופלת + טופס עריכה מלא (קטגוריה, עדיפות, הערה) בפתיחה. כמות מוצגת
    ונערכת תמיד עם QtyStepper בשורה עצמה, לא בלשונית - ואין יותר שדה "יחידה" בכלל
    (פידבק מפורש: לא נחוץ). סימון "נרכש" עם צ'קבוקס בצד ימין לשם - לא ג'סטורת גרירה (ראו
    היסטוריה ב-git log: כמה ניסיונות סליידר בהשראת iOS Messages לא עבדו אמין על מכשיר
    אמיתי; פידבק מפורש לעבור לצ'קבוקס פשוט וודאי). סימון = onPurchase; ביטול סימון על
    פריט שכבר נרכש (סומן בטעות) = onRestore - אותו צ'קבוקס, שני הכיוונים. לחיצה ארוכה
    על השם פותחת עריכה שלו (פידבק מפורש - לא הייתה דרך לשנות שם פריט קיים); הקשה רגילה
    עדיין פותחת/סוגרת את לשונית העריכה. */
const NAME_LONG_PRESS_MS = 500;
const NAME_PRESS_CANCEL_PX = 8; // תזוזה מעבר לזה תוך כדי לחיצה = לא לחיצה ארוכה, לא לפתוח עריכה

function ItemRow({ item, onUpdate, onDelete, onPurchase, onRestore, purchased, lastPromo }) {
  const [open, setOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [price, setPrice] = useState(item.price ?? "");
  const [store, setStore] = useState(item.store ?? "");
  const [showPromo, setShowPromo] = useState(false);
  // פריט שנרכש: אם יש promo מפורש או שנרכשו כמה יחידות יחד (גם בלי סימון מבצע מפורש) -
  // שייך ישירות לרשומת ההיסטוריה הזו. פריט פעיל (עדיין לא נרכש): אין לו נתונים משלו עדיין -
  // lastPromo הוא מה שהתקבל מההיסטוריה (ראה lastPromoForProduct, אותו קריטריון בדיוק).
  const purchasedWorthShowing = item.promo || (item.qty > 1 && item.price != null);
  const promoInfo = purchased ? (purchasedWorthShowing ? { promo: item.promo, qty: item.qty, price: item.price, purchasedAt: item.purchasedAt, store: item.store } : null) : lastPromo;
  // לחיצה ארוכה על השם פותחת עריכה שלו - פידבק מפורש (אין דרך אחרת לשנות שם פריט קיים).
  // לא ג'סטורת גרירה/כיוון - רק טיימר, בלי כל מחלקת הבאגים שהייתה עם הסליידר. תזוזה קטנה
  // בזמן הלחיצה (למשל תחילת גלילה) מבטלת את הטיימר כרגיל, בלי להתערב בגלילה עצמה.
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(item.name);
  const pressTimerRef = useRef(null);
  const pressStartRef = useRef(null);
  const clearPressTimer = () => { if (pressTimerRef.current) { clearTimeout(pressTimerRef.current); pressTimerRef.current = null; } };
  const onNamePointerDown = e => {
    if (editingName) return;
    pressStartRef.current = { x: e.clientX, y: e.clientY };
    clearPressTimer();
    pressTimerRef.current = setTimeout(() => { pressTimerRef.current = null; setNameDraft(item.name); setEditingName(true); }, NAME_LONG_PRESS_MS);
  };
  const onNamePointerMove = e => {
    const start = pressStartRef.current;
    if (!start || !pressTimerRef.current) return;
    if (Math.abs(e.clientX - start.x) > NAME_PRESS_CANCEL_PX || Math.abs(e.clientY - start.y) > NAME_PRESS_CANCEL_PX) clearPressTimer();
  };
  const saveNameEdit = () => {
    const trimmed = nameDraft.trim();
    setEditingName(false);
    if (trimmed && trimmed !== item.name) onUpdate(item.id, { name: trimmed });
  };
  const cancelNameEdit = () => { setEditingName(false); setNameDraft(item.name); };

  return (
    <div style={{ borderBottom: `1px solid ${LINE}`, padding: "10px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <label
          style={{ display: "flex", alignItems: "center", padding: 8, margin: -8, cursor: "pointer", flexShrink: 0 }}
          aria-label={purchased ? `שחזור ${item.name} לרשימת הקניות (סומן בטעות)` : `סימון ${item.name} כנרכש`}
        >
          <input type="checkbox" checked={purchased} onChange={() => (purchased ? onRestore(item.id) : onPurchase(item.id))} style={{ width: 20, height: 20 }} />
        </label>
        <div style={{ minWidth: 0, flex: 1 }}>
          {editingName ? (
            <input
              autoFocus className="hq-field" value={nameDraft} onChange={e => setNameDraft(e.target.value)}
              onBlur={saveNameEdit}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); saveNameEdit(); } else if (e.key === "Escape") { e.preventDefault(); cancelNameEdit(); } }}
              onClick={e => e.stopPropagation()}
              style={{ ...inputStyle, width: "100%", fontSize: 16, border: `1px solid ${LINE}`, borderRadius: 2, padding: "4px 6px" }}
            />
          ) : (
            <div
              style={{ cursor: "pointer", WebkitTouchCallout: "none", userSelect: "none", WebkitUserSelect: "none" }}
              onClick={() => setOpen(o => !o)}
              onPointerDown={onNamePointerDown} onPointerMove={onNamePointerMove} onPointerUp={clearPressTimer} onPointerCancel={clearPressTimer}
            >
              <div style={{ fontSize: 16, overflowWrap: "anywhere", textDecoration: purchased ? "line-through" : "none", opacity: purchased ? 0.55 : 1 }}>
                {item.name}
              </div>
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 4 }}>
            <Pill color={INK}>{item.category}</Pill>
            {!purchased && <Pill color={PRIORITY_COLOR[item.priority] || MUTED}>{item.priority}</Pill>}
            {!purchased && <QtyStepper qty={item.qty} onChange={q => onUpdate(item.id, { qty: q })} />}
            {purchased && item.price != null && <Pill color={GREEN}>{ils(item.price)}</Pill>}
            {purchased && item.store && <Pill color={MUTED}>{item.store}</Pill>}
            {promoInfo && (
              <button type="button" onClick={() => setShowPromo(s => !s)}
                aria-label={purchased ? "המבצע ברכישה הזו" : "המבצע האחרון שראינו במוצר הזה"}
                style={{ display: "inline-flex", alignItems: "center", gap: 3, border: "none", background: "transparent", color: AMBER, cursor: "pointer", fontSize: 12, padding: 0, fontFamily: "inherit" }}>
                <Tag size={13} /> מבצע
              </button>
            )}
          </div>
          {showPromo && promoInfo && (
            <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
              {describePromo(promoInfo)}
              {!purchased && (promoInfo.store || promoInfo.purchasedAt) && (
                <> · בפעם האחרונה{promoInfo.store ? ` ב${promoInfo.store}` : ""}{promoInfo.purchasedAt ? ` (${new Date(promoInfo.purchasedAt).toLocaleDateString("he-IL")})` : ""}</>
              )}
            </div>
          )}
          {item.note && <div style={{ fontSize: 14, color: MUTED, marginTop: 4, overflowWrap: "anywhere" }}>{item.note}</div>}
        </div>
        <button aria-label={open ? "כיווץ" : "הרחבה"} onClick={() => setOpen(o => !o)} style={{ border: "none", background: "transparent", cursor: "pointer", width: 32, height: 32, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ChevronDown size={14} color={MUTED} style={{ transform: open ? "rotate(180deg)" : "none" }} />
        </button>
      </div>

      {open && !purchased && (
        <div style={{ marginTop: 10, marginRight: 4, display: "grid", gap: 8 }}>
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

function QuickAdd({ items, onQuickAdd, onOpenForm }) {
  const [name, setName] = useState("");
  // אזהרה לפני הוספה כפולה בטעות, במקום ליצור שורה כפולה בשקט - פידבק מפורש. חוסמת
  // בפועל (submit לא מוסיף) - הכפילות עצמה עדיין קיימת ברשימה, מוטב לכוון לשנות כמות שם.
  const duplicate = name.trim() ? findActiveDuplicate(items, name) : null;
  const submit = () => { if (!name.trim() || duplicate) return; onQuickAdd(name); setName(""); };
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 8, minWidth: 0 }}>
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
      {duplicate && <p role="alert" style={{ color: RUST, fontSize: 12, margin: "6px 0 0" }}>"{duplicate.name}" כבר קיים ברשימה - אפשר לשנות כמות בשורה הקיימת במקום להוסיף שוב.</p>}
    </div>
  );
}

function FullAddForm({ dict, items, onAdd, onClose }) {
  const [f, setF] = useState({ name: "", qty: "", category: "", priority: "רגיל", note: "" });
  const detected = f.name.trim() ? detectCategory(f.name, dict) : "";
  const duplicate = f.name.trim() ? findActiveDuplicate(items, f.name) : null;
  const submit = () => {
    if (!f.name.trim() || duplicate) return;
    onAdd({ name: f.name, qty: toN(f.qty) || null, category: f.category || undefined, priority: f.priority, note: f.note });
    onClose();
  };
  return (
    <div style={{ ...cardStyle, padding: 14 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <input className="hq-field" placeholder="שם פריט" value={f.name} onChange={e => setF(s => ({ ...s, name: e.target.value }))} style={inputStyle} />
        {duplicate && <p role="alert" style={{ color: RUST, fontSize: 12, margin: 0 }}>"{duplicate.name}" כבר קיים ברשימה - אפשר לשנות כמות בשורה הקיימת במקום להוסיף שוב.</p>}
        <input className="hq-field" placeholder="כמות" value={f.qty} onChange={e => setF(s => ({ ...s, qty: e.target.value }))} style={inputStyle} />
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

      <QuickAdd items={g.items} onQuickAdd={onQuickAdd} onOpenForm={() => setShowFullForm(s => !s)} />
      {showFullForm && <FullAddForm dict={g.categoryDict} items={g.items} onAdd={onAdd} onClose={() => setShowFullForm(false)} />}
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
              {items.map(item => <ItemRow key={item.id} item={item} purchased={false} onUpdate={onUpdate} onDelete={onDelete} onPurchase={onPurchase} onRestore={onRestore} lastPromo={lastPromoForProduct(g.history, item.name)} />)}
            </div>
          </div>
        ))
      ) : (
        <div style={cardStyle}>
          {entries.length === 0 && <div style={{ padding: 16, fontSize: 14, color: MUTED, lineHeight: 1.7 }}>אין פריטים להצגה בפילטר הזה.</div>}
          {entries.map(item => (
            <ItemRow key={`${item.purchased ? "h" : "i"}-${item.id}`} item={item} purchased={item.purchased}
              onUpdate={item.purchased ? onUpdatePurchased : onUpdate} onDelete={onDelete} onPurchase={onPurchase} onRestore={onRestore}
              lastPromo={item.purchased ? null : lastPromoForProduct(g.history, item.name)} />
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

/** שורת פריט אד-הוק בטופס הקבלה: דבר שלא היה ברשימה (קבלות אמיתיות כוללות תמיד גם כאלה).
    row.promo (אם קיים - תמיד מגיע מסריקת AI, לא שדה שמוזן ידנית) מוצג כטקסט בלבד. */
function AdHocRow({ row, onChange, onRemove }) {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) auto", gap: 6, alignItems: "center" }}>
        <input className="hq-field" placeholder="שם פריט" value={row.name} onChange={e => onChange({ ...row, name: e.target.value })} style={{ ...inputStyle, minWidth: 0 }} />
        <input className="hq-field" placeholder="מחיר ₪" value={row.price} onChange={e => onChange({ ...row, price: e.target.value })} style={{ ...inputStyle, minWidth: 0 }} />
        <input className="hq-field" placeholder="כמות" value={row.qty} onChange={e => onChange({ ...row, qty: e.target.value })} style={{ ...inputStyle, minWidth: 0 }} />
        <button type="button" aria-label="הסרת שורה" onClick={onRemove} style={{ border: "none", background: "transparent", color: MUTED, cursor: "pointer", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={15} /></button>
      </div>
      {row.promo && <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: AMBER, marginTop: 2 }}><Tag size={11} /> {row.promo}</div>}
    </div>
  );
}

/** טופס "קבלה": שם חנות + תאריך, בחירה ממה שברשימה (עם מחיר לכל פריט) ושורות אד-הוק, ותמונה אופציונלית. */
function ReceiptForm({ g, setGrocery }) {
  const stores = knownStores(g);
  const [store, setStore] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [prices, setPrices] = useState({}); // itemId -> price string, נוכח = נבחר
  const [scanPromos, setScanPromos] = useState({}); // itemId -> promo string, רק לפריטים שהותאמו מסריקת AI
  const [scanQtys, setScanQtys] = useState({}); // itemId -> כמות שזוהתה בסריקה (למשל 2 אם המוצר הופיע פעמיים/במבצע)
  // קבלה ישנה: דווח שסריקת קבלה ישנה "חיברה" בטעות פריטים שנרכשו בעבר לפריטים ברשימת
  // "צריך לקנות" הנוכחית (סימון אוטומטי כאילו נקנו עכשיו) - למשל אם אותו מוצר נוסף שוב
  // לרשימה מאז. כש-isOldReceipt מסומן, הסריקה לא מנסה להתאים לרשימה הפעילה בכלל - הכל
  // נכנס כשורות אד-הוק (נוספות ישירות להיסטוריה, בלי לגעת ב-items).
  const [isOldReceipt, setIsOldReceipt] = useState(false);
  const [adHoc, setAdHoc] = useState([]);
  const [images, setImages] = useState([]);
  const [error, setError] = useState("");
  const [savedMsg, setSavedMsg] = useState("");
  const tracker = useImageTracker([]);
  // סריקת קבלה עם AI (Gemini, אותו מפתח שכבר משמש את JARVIS - אין הגדרה חדשה נדרשת):
  // ממלאת אוטומטית את אותם prices/adHoc שהמשתמש/ת היו ממלאים ידנית - לא שומרת כלום
  // בעצמה. "אישור לפני שמירה" מתקבל בחינם כי זו בדיוק הטופס הקיים, עם שדות שאפשר לערוך/
  // למחוק לפני לחיצה על "שמירת קבלה" הרגילה.
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [scanInfo, setScanInfo] = useState(""); // משוב הצלחה - בלי זה סריקה שמצאה פריטים הייתה "שקטה" לגמרי (באג שדווח: "לא עובד, אין הודעת שגיאה" - בפועל כן עבד, רק בלי משוב)
  const scanInputRef = useRef(null);

  const toggleItem = id => setPrices(prev => { const next = { ...prev }; if (id in next) delete next[id]; else next[id] = ""; return next; });
  const reset = () => { tracker.settle(images, false); tracker.reset([]); setStore(""); setPrices({}); setScanPromos({}); setScanQtys({}); setIsOldReceipt(false); setAdHoc([]); setImages([]); setSavedMsg(""); setScanError(""); setScanInfo(""); };

  const scanReceipt = async file => {
    setScanning(true); setScanError(""); setScanInfo(""); setError(""); setSavedMsg("");
    try {
      const imageBase64 = await compressReceiptImage(file);
      const response = await apiFetch("/api/household/receipt-scan", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageBase64, mimeType: "image/jpeg" }),
      });
      const value = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apiErrorMessage(response.status, value.error, "סריקת הקבלה נכשלה."));
      if (value.store && !store.trim()) setStore(value.store);
      if (value.date) setDate(value.date);
      const items = Array.isArray(value.items) ? value.items : [];
      if (!items.length) { setScanError("לא זוהו פריטים ברורים בתמונה. אפשר למלא ידנית למטה."); return; }
      // חישוב טהור לפני שקוראים ל-setState (לא בתוך updater של setPrices) - גרסה קודמת
      // ניסתה לצבור unmatched כתופעת-לוואי מתוך ה-updater וזה לא היה אמין (נתפס בבדיקה
      // ידנית: פריטים לא-תואמים פשוט לא הגיעו ל-adHoc). g.items הוא מקור האמת ל"קיים
      // ברשימה", לא prices הקודם - אין תלות במצב הקודם כאן, אז אין צורך ב-updater בכלל.
      // findReceiptMatch (לא findActiveDuplicate המדויק) - כדי ש"רוטב סויה" ברשימה יתאים
      // ל"רוטב סויה יאמסה" בקבלה (שם עם מותג), ראו ההסבר ב-grocery-model.js. קבלה ישנה:
      // לא מתאימים בכלל לרשימה הפעילה (ראו הסבר ליד isOldReceipt).
      // צבירה (לא דריסה!) לפי match.id: קבלה אמיתית לפעמים מדפיסה את אותו מוצר כשתי שורות
      // נפרדות (למשל שני יחידות באותו מחיר) במקום שורה אחת עם qty - בלי צבירה היינו מאבדים
      // את השורה הראשונה כשהשנייה דורסת אותה באותו מפתח.
      const matchedPrices = {};
      const matchedQtys = {};
      const matchedPromos = {};
      const unmatchedItems = [];
      for (const item of items) {
        const match = !isOldReceipt ? findReceiptMatch(g.items, item.name) : null;
        if (match) {
          matchedPrices[match.id] = round2((matchedPrices[match.id] || 0) + item.price);
          matchedQtys[match.id] = (matchedQtys[match.id] || 0) + (item.qty || 1);
          if (item.promo) matchedPromos[match.id] = matchedPromos[match.id] ? `${matchedPromos[match.id]}; ${item.promo}` : item.promo;
        } else {
          unmatchedItems.push(item);
        }
      }
      if (Object.keys(matchedPrices).length) {
        setPrices(prev => { const next = { ...prev }; for (const id in matchedPrices) next[id] = String(matchedPrices[id]); return next; });
        setScanQtys(prev => ({ ...prev, ...matchedQtys }));
      }
      if (Object.keys(matchedPromos).length) setScanPromos(prev => ({ ...prev, ...matchedPromos }));
      if (unmatchedItems.length) {
        // דה-דופ לפי שם (לא רגיש לאותיות/רווחים) מול מה שכבר ב-adHoc: אם המשתמש/ת מנסים
        // לסרוק שוב (למשל כי בפעם הקודמת לא היה משוב והם חשבו שזה לא עבד) - לא נוצרות שורות כפולות.
        setAdHoc(prev => {
          const existing = new Set(prev.map(r => r.name.trim().toLowerCase()));
          const toAdd = unmatchedItems.filter(item => !existing.has(item.name.trim().toLowerCase()));
          return [...prev, ...toAdd.map(item => ({ name: item.name, price: String(item.price), qty: item.qty != null ? String(item.qty) : "", promo: item.promo || null }))];
        });
      }
      const matchedCount = Object.keys(matchedPrices).length;
      const unmatchedCount = unmatchedItems.length;
      setScanInfo(isOldReceipt
        ? `זוהו ${items.length} פריטים, כולם נוספו כשורות חדשות למטה (קבלה ישנה - לא הותאם לרשימה הנוכחית). אפשר לבדוק ולערוך לפני השמירה.`
        : `זוהו ${items.length} פריטים: ${matchedCount} הותאמו לרשימה${unmatchedCount ? `, ${unmatchedCount} נוספו כשורות חדשות למטה` : ""}. אפשר לבדוק ולערוך לפני השמירה.`);
    } catch (e) {
      setScanError(e.message || "סריקת הקבלה נכשלה.");
    } finally {
      setScanning(false);
    }
  };

  const submit = () => {
    setError(""); setSavedMsg(""); setScanError(""); setScanInfo("");
    const listItems = Object.entries(prices).map(([id, p]) => ({ id, price: toN(p) || null, promo: scanPromos[id] || null, qty: toN(scanQtys[id]) || null }));
    const adHocItems = adHoc.filter(r => r.name.trim()).map(r => ({ name: r.name, price: toN(r.price) || null, qty: toN(r.qty) || null, promo: r.promo || null }));
    if (!store.trim()) { setError("בחרו או הזינו שם חנות."); return; }
    if (listItems.length === 0 && adHocItems.length === 0) { setError("בחרו לפחות פריט אחד מהרשימה, או הוסיפו שורה ידנית."); return; }
    const { state: next, receiptId } = logReceipt(g, { store, date, listItems, adHocItems });
    if (!receiptId) { setError("לא הצלחנו לרשום את הקבלה — בדקו את הפרטים."); return; }
    const withImages = images.length ? updateReceiptImages(next, receiptId, images) : next;
    tracker.settle(images, true);
    setGrocery(withImages);
    tracker.reset([]); setStore(""); setPrices({}); setScanPromos({}); setScanQtys({}); setIsOldReceipt(false); setAdHoc([]); setImages([]);
    setSavedMsg("הקבלה נשמרה, ועברה להיסטוריית הרכישות.");
  };

  const activeItems = g.items;

  return (
    <div>
      <h3 style={{ margin: "0 0 4px", fontSize: 18 }}>רישום קבלה</h3>
      <p style={{ fontSize: 13, color: MUTED, margin: "0 0 14px" }}>אחרי קנייה: מי החנות, מתי, ומה נקנה בפועל (מהרשימה ו/או דברים שלא תוכננו) — כדי לדעת איפה כדאי לקנות.</p>

      <div style={{ ...cardStyle, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>סריקת קבלה עם AI (ניסיוני) — ממלא אוטומטית את הפריטים והמחירים למטה; תמיד אפשר לערוך או למחוק לפני שמירה.</div>
        <input ref={scanInputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
          onChange={e => { const file = e.target.files?.[0]; if (file) scanReceipt(file); e.target.value = ""; }} />
        <button type="button" disabled={scanning} onClick={() => scanInputRef.current?.click()}
          style={{ fontSize: 13, border: `1px solid ${LINE}`, background: "transparent", color: INK, borderRadius: 2, padding: "9px 14px", cursor: scanning ? "not-allowed" : "pointer", opacity: scanning ? 0.6 : 1, fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <ScanLine size={15} /> {scanning ? "סורק קבלה…" : "סריקת קבלה עם AI"}
        </button>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: MUTED, marginTop: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={isOldReceipt} onChange={e => setIsOldReceipt(e.target.checked)} />
          קבלה ישנה — אל תתאימו אוטומטית לרשימת הקניות הנוכחית (כל הפריטים ייכנסו כשורות חדשות למטה)
        </label>
        {scanError && <p role="alert" style={{ color: RUST, fontSize: 12, margin: "8px 0 0" }}>{scanError}</p>}
        {scanInfo && <p role="status" style={{ color: GREEN, fontSize: 12, margin: "8px 0 0" }}>{scanInfo}</p>}
      </div>

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
                      <span style={{ overflowWrap: "anywhere" }}>{item.name}{item.qty != null && ` (${item.qty})`}</span>
                    </label>
                    {checked && (
                      <>
                        <input className="hq-field" placeholder="מחיר ₪" value={prices[item.id]} onChange={e => setPrices(prev => ({ ...prev, [item.id]: e.target.value }))} style={{ ...inputStyle, width: 90, flexShrink: 0 }} />
                        <input className="hq-field" placeholder="כמות" value={scanQtys[item.id] ?? ""} onChange={e => setScanQtys(prev => ({ ...prev, [item.id]: e.target.value }))} style={{ ...inputStyle, width: 64, flexShrink: 0 }} />
                      </>
                    )}
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
          <button type="button" onClick={() => setAdHoc(rows => [...rows, { name: "", price: "", qty: "", promo: null }])}
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
