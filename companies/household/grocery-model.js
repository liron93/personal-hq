// לוגיקה טהורה של "סופר" (רשימת קניות משותפת) עבור תת-החברה "משק בית" — קטגוריות, זיהוי
// אוטומטי, מיון/קיבוץ לפי מסלול קנייה, מעבר בין "צריך לקנות" להיסטוריית רכישות, וחישובי
// חיסכון/תקציב/מגמה/התראות.
// קובץ טהור בכוונה (בלי React, בלי Supabase, בלי window, ובלי alias imports של "@/") כדי שיהיה
// אפשר לייבא אותו ישירות תחת node:test (`node --test`) בלי טוען מודולים מיוחד — ראה tests/household-grocery.test.mjs.
// state כאן = הנתונים שנשמרים תחת hq:household:v1 (ראה model.js); items/history/categoryDict/monthlyBudget
// יושבים ברמה העליונה של ה-state, ולא מקוננים תחת שדה משנה, כי זו כל תת-החברה ב-v1.

// זהה ל-uid() ב-lib/format.js, משוכפל כאן בכוונה כדי שהמודול יישאר טהור וללא import של "@/".
const uid = () => Math.random().toString(36).slice(2, 10);

// סדר הקטגוריות = גם רשימת הקטגוריות הסופית וגם סדר מסלול הקנייה, עם "אחר" תמיד אחרון.
export const CATEGORIES = Object.freeze([
  "פירות וירקות",
  "יבשים ומזווה",
  "קירור",
  "ניקיון",
  "טיפוח",
  "תינוקות וחיות מחמד",
  "אחר",
]);
export const FALLBACK_CATEGORY = "אחר";

export const PRIORITIES = Object.freeze(["רגיל", "חשוב", "דחוף"]);
const PRIORITY_WEIGHT = { "דחוף": 2, "חשוב": 1, "רגיל": 0 };
export const DEFAULT_PRIORITY = "רגיל";

// מילון ברירת מחדל לזיהוי קטגוריה לפי מילת מפתח בשם הפריט. ניתן לעריכה על ידי המשתמש (נשמר
// ב-state.categoryDict), ולכן זו רק ברירת המחדל ההתחלתית — לא מקור אמת קבוע.
export const DEFAULT_CATEGORY_DICT = Object.freeze({
  "עגבני": "פירות וירקות", "מלפפון": "פירות וירקות", "בצל": "פירות וירקות", "תפוח אדמה": "פירות וירקות",
  "בטטה": "פירות וירקות", "גזר": "פירות וירקות", "פלפל": "פירות וירקות", "חסה": "פירות וירקות",
  "תפוח": "פירות וירקות", "בננה": "פירות וירקות", "תות": "פירות וירקות", "אבוקדו": "פירות וירקות",
  "לימון": "פירות וירקות", "ירק": "פירות וירקות", "פרי": "פירות וירקות", "פירות": "פירות וירקות",
  "אורז": "יבשים ומזווה", "פסטה": "יבשים ומזווה", "קמח": "יבשים ומזווה", "סוכר": "יבשים ומזווה",
  "שמן": "יבשים ומזווה", "קטני": "יבשים ומזווה", "שימור": "יבשים ומזווה", "קפה": "יבשים ומזווה",
  "תה": "יבשים ומזווה", "חטיף": "יבשים ומזווה", "ביסקוויט": "יבשים ומזווה", "מלח": "יבשים ומזווה",
  "תבלין": "יבשים ומזווה", "לחם": "יבשים ומזווה", "קרקר": "יבשים ומזווה",
  "חלב": "קירור", "ביצ": "קירור", "גבינה": "קירור", "יוגורט": "קירור", "חמאה": "קירור",
  "עוף": "קירור", "בשר": "קירור", "דג": "קירור", "קפוא": "קירור", "גלידה": "קירור", "קוטג": "קירור", "לבן": "קירור",
  "סבון": "ניקיון", "אקונומיקה": "ניקיון", "מטהר": "ניקיון", "נייר טואלט": "ניקיון",
  "מגבונים": "ניקיון", "כביסה": "ניקיון", "ניקוי": "ניקיון", "שקיות אשפה": "ניקיון",
  "שמפו": "טיפוח", "משחת שיניים": "טיפוח", "דאודורנט": "טיפוח", "קרם": "טיפוח", "סבון גוף": "טיפוח",
  "חיתול": "תינוקות וחיות מחמד", "מטרנה": "תינוקות וחיות מחמד", "מזון לכלב": "תינוקות וחיות מחמד",
  "מזון לחתול": "תינוקות וחיות מחמד", "חול לחתול": "תינוקות וחיות מחמד",
});

export function createGroceryState() {
  return { items: [], history: [], categoryDict: { ...DEFAULT_CATEGORY_DICT }, monthlyBudget: null };
}

/** מבטיח שדות רשימת-קניות תקינים גם אם חסרים בנתונים ישנים (תאימות אחורה). */
export function ensureGroceryState(d) {
  const base = d && typeof d === "object" ? d : {};
  if (Array.isArray(base.items) && Array.isArray(base.history) && base.categoryDict) return base;
  return { ...createGroceryState(), ...base };
}

const norm = s => String(s || "").trim();

/** קטגוריה מזוהה אוטומטית לפי שם, מהמילון (ברירת מחדל או שנערך). התאמה ראשונה, נופלת ל"אחר". */
export function detectCategory(name, dict = DEFAULT_CATEGORY_DICT) {
  const n = norm(name);
  if (!n) return FALLBACK_CATEGORY;
  for (const [keyword, category] of Object.entries(dict || {})) {
    if (keyword && n.includes(keyword)) return category;
  }
  return FALLBACK_CATEGORY;
}

/** true אם הקטגוריה היא "אחר" בלבד כי שום מילת מפתח לא תאמה (לא כי המשתמש בחר "אחר" ביודעין). */
export const isGenuineFallback = (name, dict) => detectCategory(name, dict) === FALLBACK_CATEGORY;

export function addCategoryKeyword(dict, keyword, category) {
  const k = norm(keyword);
  if (!k || !CATEGORIES.includes(category)) return dict;
  return { ...dict, [k]: category };
}

// ---------- ולידציה ----------
export const isValidName = name => norm(name).length > 0;
export const isValidPositiveNumber = v => typeof v === "number" && Number.isFinite(v) && v > 0;
export const isValidNonNegativeNumber = v => typeof v === "number" && Number.isFinite(v) && v >= 0;

// ---------- פריטים ----------
export function newGroceryItem({ name, qty = null, unit = "", category, priority = DEFAULT_PRIORITY, note = "", dict } = {}) {
  const n = norm(name);
  const categoryAuto = category === undefined || category === null || category === "";
  const resolvedCategory = categoryAuto ? detectCategory(n, dict) : category;
  const now = new Date().toISOString();
  return {
    id: uid(),
    name: n,
    qty: isValidPositiveNumber(qty) ? qty : null,
    unit: norm(unit),
    category: CATEGORIES.includes(resolvedCategory) ? resolvedCategory : FALLBACK_CATEGORY,
    categoryAuto,
    priority: PRIORITIES.includes(priority) ? priority : DEFAULT_PRIORITY,
    note: norm(note),
    purchased: false,
    createdAt: now,
    updatedAt: now,
  };
}

/** הוספה מהירה: שם בלבד (Enter), קטגוריה מזוהה אוטומטית. שם ריק לא משנה כלום. */
export function quickAddItem(state, name, dict = state?.categoryDict) {
  if (!isValidName(name)) return state;
  const item = newGroceryItem({ name, dict });
  return { ...state, items: [...state.items, item] };
}

export function addItem(state, fields) {
  if (!isValidName(fields?.name)) return state;
  const item = newGroceryItem({ ...fields, dict: state?.categoryDict });
  return { ...state, items: [...state.items, item] };
}

export function updateItem(state, id, patch) {
  const idx = (state.items || []).findIndex(i => i.id === id);
  if (idx === -1) return state;
  const items = state.items.slice();
  const wasAuto = items[idx].categoryAuto;
  // אם המשתמש שינה קטגוריה ידנית, categoryAuto הופך ל-false (אלא אם התיקון מפורש להיפך).
  const categoryAuto = Object.prototype.hasOwnProperty.call(patch, "categoryAuto")
    ? patch.categoryAuto
    : Object.prototype.hasOwnProperty.call(patch, "category") ? false : wasAuto;
  items[idx] = { ...items[idx], ...patch, categoryAuto, updatedAt: new Date().toISOString() };
  return { ...state, items };
}

/** מחיקה קבועה של פריט פעיל (עם אישור בממשק). לא נוגע בהיסטוריה. */
export function removeItem(state, id) {
  if (!(state.items || []).some(i => i.id === id)) return state;
  return { ...state, items: state.items.filter(i => i.id !== id) };
}

/** סימון כנרכש: מעביר את הפריט מ-items להיסטוריה (לא נמחק לעולם). מחיר אופציונלי, לחישובי חיסכון. */
export function markPurchased(state, id, { price = null, purchasedAt = new Date().toISOString() } = {}) {
  const idx = (state.items || []).findIndex(i => i.id === id);
  if (idx === -1) return state;
  const item = state.items[idx];
  const entry = {
    id: item.id, name: item.name, qty: item.qty, unit: item.unit, category: item.category, priority: item.priority,
    note: item.note, price: isValidNonNegativeNumber(price) ? price : null, purchasedAt,
  };
  return {
    ...state,
    items: state.items.filter(i => i.id !== id),
    history: [...state.history, entry],
  };
}

/** עדכון רשומת היסטוריה (בעיקר תיקון מחיר בדיעבד). ההיסטוריה עצמה אף פעם לא נמחקת. */
export function updateHistoryEntry(state, id, patch) {
  const idx = (state.history || []).findIndex(h => h.id === id);
  if (idx === -1) return state;
  const history = state.history.slice();
  history[idx] = { ...history[idx], ...patch };
  return { ...state, history };
}

// ---------- מיון / קיבוץ ----------
const heCompare = (a, b) => String(a).localeCompare(String(b), "he");

export function sortItems(items) {
  return [...(items || [])].sort((a, b) => (PRIORITY_WEIGHT[b.priority] ?? 0) - (PRIORITY_WEIGHT[a.priority] ?? 0) || heCompare(a.name, b.name));
}

/** קיבוץ לפי מסלול הקנייה (CATEGORIES בסדר), רק פריטים "צריך לקנות". קטגוריות ריקות לא מוצגות. */
export function groupByRoute(items) {
  const sorted = sortItems(items);
  return CATEGORIES.map(category => ({ category, items: sorted.filter(i => i.category === category) })).filter(g => g.items.length > 0);
}

export const FILTERS = Object.freeze(["all", "need", "purchased"]);

/**
 * רשימת כניסות לתצוגת הכותרת "הקנייה הבאה" לפי פילטר.
 * need = פריטים פעילים (טרם נרכשו). purchased = היסטוריית רכישות (החדשות קודם). all = שניהם, פעילים קודם.
 */
export function filterEntries(state, filter = "all", { purchasedLimit = 30 } = {}) {
  const need = sortItems(state.items).map(i => ({ ...i, purchased: false }));
  const purchased = [...(state.history || [])].sort((a, b) => (a.purchasedAt < b.purchasedAt ? 1 : -1)).map(h => ({ ...h, purchased: true }));
  if (filter === "need") return need;
  if (filter === "purchased") return purchased;
  return [...need, ...purchased.slice(0, purchasedLimit)];
}

// ---------- חיסכון / תקציב ----------
export const INSUFFICIENT_DATA = "אין מספיק נתונים";
const round2 = n => Math.round(n * 100) / 100;
const avg = arr => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);

export const monthKeyOf = iso => String(iso || "").slice(0, 7); // "YYYY-MM"
export const nowMonth = (now = new Date()) => now.toISOString().slice(0, 7);

export const hasValidPrice = entry => isValidNonNegativeNumber(entry?.price);
export const hasValidQty = entry => isValidPositiveNumber(entry?.qty);

/** מחיר ליחידה — רק כשגם מחיר וגם כמות הם מספרים תקינים. אחרת null (לעולם לא מנחשים). */
export function pricePerUnit(entry) {
  if (!hasValidPrice(entry) || !hasValidQty(entry)) return null;
  return round2(entry.price / entry.qty);
}

/** כל החודשים (YYYY-MM) שיש להם לפחות רשומת היסטוריה אחת, ממוינים עולה. */
export function distinctMonthsWithData(history) {
  return [...new Set((history || []).map(h => monthKeyOf(h.purchasedAt)).filter(Boolean))].sort();
}

/** חודשים "מלאים" (שהסתיימו) — כל החודשים בהיסטוריה שהם לפני חודש הייחוס (בד"כ החודש הנוכחי). */
export function completeMonths(history, referenceMonth = nowMonth()) {
  return distinctMonthsWithData(history).filter(m => m < referenceMonth);
}

/** הוצאה בפועל בחודש נתון, מחושבת רק מרשומות עם מחיר תקין. hasData=false = אין שום רכישה מתועדת באותו חודש. */
export function monthlySpend(history, month) {
  const entries = (history || []).filter(h => monthKeyOf(h.purchasedAt) === month);
  if (entries.length === 0) return { hasData: false, total: 0, itemCount: 0, pricedCount: 0 };
  const priced = entries.filter(hasValidPrice);
  return { hasData: true, total: round2(priced.reduce((s, e) => s + e.price, 0)), itemCount: entries.length, pricedCount: priced.length };
}

/** תקציב מול בפועל לחודש נתון. budget=null (לא הוגדר) או spend.hasData=false => over=false, בלי לבדות מספר. */
export function budgetVsActual(state, { referenceMonth = nowMonth() } = {}) {
  const budget = isValidNonNegativeNumber(state?.monthlyBudget) ? state.monthlyBudget : null;
  const spend = monthlySpend(state?.history, referenceMonth);
  const over = budget != null && spend.hasData && spend.total > budget;
  return { budget, spend, over, referenceMonth };
}

/**
 * מגמה מול בסיס היסטורי. זמינה רק אחרי לפחות שני חודשים מלאים של נתונים (לא רק כשיש שתי רשומות),
 * ורק אם לחודש הנוכחי יש כבר נתון בפועל להשוואה. אחרת available=false בלי מספר מומצא.
 */
export function budgetTrend(history, { referenceMonth = nowMonth(), baselineMonths = 3 } = {}) {
  const complete = completeMonths(history, referenceMonth);
  if (complete.length < 2) return { available: false, reason: "not_enough_months", monthsAvailable: complete.length };
  const current = monthlySpend(history, referenceMonth);
  if (!current.hasData) return { available: false, reason: "no_current_data", monthsAvailable: complete.length };
  const baseline = complete.slice(-baselineMonths);
  const baselineAvg = round2(avg(baseline.map(m => monthlySpend(history, m).total)));
  const deltaPercent = baselineAvg > 0 ? Math.round(((current.total - baselineAvg) / baselineAvg) * 100) : null;
  return { available: true, baselineAvg, baselineMonths: baseline, current: current.total, deltaPercent };
}

/** מוצרים חוזרים על פני יותר מחודש אחד (ברירת מחדל: לפחות 2 חודשים שונים). */
export function repeatProducts(history, { minMonths = 2 } = {}) {
  const byName = new Map();
  for (const h of history || []) {
    const key = norm(h.name).toLowerCase();
    if (!key) continue;
    const months = byName.get(key) || new Set();
    months.add(monthKeyOf(h.purchasedAt));
    byName.set(key, months);
  }
  return [...byName.entries()]
    .map(([name, months]) => ({ name, months: [...months].sort(), count: months.size }))
    .filter(r => r.count >= minMonths)
    .sort((a, b) => b.count - a.count || heCompare(a.name, b.name));
}

/** קטגוריות חוזרות על פני יותר מחודש אחד. */
export function repeatCategories(history, { minMonths = 2 } = {}) {
  const byCat = new Map();
  for (const h of history || []) {
    const months = byCat.get(h.category) || new Set();
    months.add(monthKeyOf(h.purchasedAt));
    byCat.set(h.category, months);
  }
  return [...byCat.entries()]
    .map(([category, months]) => ({ category, months: [...months].sort(), count: months.size }))
    .filter(r => r.count >= minMonths)
    .sort((a, b) => b.count - a.count || heCompare(a.category, b.category));
}

/** פריטים פעילים שקיבלו "אחר" רק כי שום מילת מפתח לא תאמה — מועמדים לסיווג ידני. */
export function missingCategorizationItems(items) {
  return (items || []).filter(i => i.category === FALLBACK_CATEGORY && i.categoryAuto);
}

const ils = v => "₪" + Math.round(v || 0).toLocaleString("he-IL");

/**
 * התראות סופר — אך ורק שלושת התנאים שהוגדרו: חריגה מתקציב, עלייה מול בסיס היסטורי, וחוסר סיווג.
 * כל התראה כוללת הסבר בעברית למה היא הופיעה. בלי מספיק נתונים — פשוט אין התראה (לעולם לא תחזית מומצאת).
 */
export function groceryAlerts(state, { referenceMonth = nowMonth(), trendThresholdPercent = 20 } = {}) {
  const alerts = [];
  const bva = budgetVsActual(state, { referenceMonth });
  if (bva.over) {
    alerts.push({
      id: "over_budget", level: "critical",
      message: `חריגה מהתקציב החודשי למשק הבית: הוצאתם ${ils(bva.spend.total)} מתוך תקציב של ${ils(bva.budget)} החודש (${referenceMonth}).`,
    });
  }
  const trend = budgetTrend(state?.history, { referenceMonth });
  if (trend.available && trend.deltaPercent != null && trend.deltaPercent >= trendThresholdPercent) {
    alerts.push({
      id: "increase_vs_baseline", level: "warning",
      message: `עלייה של ${trend.deltaPercent}% בהוצאת הסופר החודש (${ils(trend.current)}) לעומת ממוצע ${trend.baselineMonths.length} החודשים הקודמים (${ils(trend.baselineAvg)}).`,
    });
  }
  const missing = missingCategorizationItems(state?.items);
  if (missing.length > 0) {
    alerts.push({
      id: "missing_categorization", level: "info",
      message: `${missing.length} פריטים לא זוהו אוטומטית לאף קטגוריה וסווגו כ"אחר" — סווגו אותם ידנית כדי שהניתוח והמסלול יהיו מדויקים (${missing.map(i => i.name).slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}).`,
    });
  }
  return alerts;
}
