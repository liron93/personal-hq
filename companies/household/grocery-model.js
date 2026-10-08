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
  return { items: [], history: [], categoryDict: { ...DEFAULT_CATEGORY_DICT }, monthlyBudget: null, receipts: [] };
}

/**
 * מבטיח שדות רשימת-קניות תקינים גם אם חסרים בנתונים ישנים (תאימות אחורה).
 * receipts: נוסף בפיצ'ר הקבלות — נתונים ישנים בלי השדה מקבלים מערך ריק, לא נדרס שום דבר קיים.
 */
export function ensureGroceryState(d) {
  const base = d && typeof d === "object" ? d : {};
  if (Array.isArray(base.items) && Array.isArray(base.history) && base.categoryDict && Array.isArray(base.receipts)) return base;
  return { ...createGroceryState(), ...base, receipts: Array.isArray(base.receipts) ? base.receipts : [] };
}

const norm = s => String(s || "").trim();

// ---------- זהות מוצר (Issue #7, P0 "זיהוי מוצר נכון") ----------
// עד כאן זיהוי פריט היה שם חופשי בלבד - "מגבונים" כללי ו"מגבונים אריאל 72 יח'" נחשבו אותו
// מוצר בכל חישוב השוואה/היסטוריה, כי הקיבוץ היה לפי norm(name) בלבד. brand/variant הם
// שדות אופציונליים חדשים (שם מותג, גודל/כמות-אריזה/וריאנט אחר) - productKey הוא מפתח הזהות
// המלא (שם+מותג+וריאנט, תמיד שלושתם, גם כשהשניים האחרונים ריקים) שמשמש מעכשיו לכל קיבוץ/
// השוואה/היסטוריה. פריט ישן בלי brand/variant ממשיך לקבץ אך ורק מול פריטים אחרים בלי
// brand/variant באותו שם (לא "נבלע" לתוך/לא "בולע" גרסה ממותגת חדשה בטעות) - זה בדיוק מה
// שמבטיח "מגבונים כלליים יוצגו כפריט כללי ולא ישויכו אוטומטית למותג/וריאנט חדש".
export function productKey(entry) {
  const name = norm(entry?.name).toLowerCase();
  const brand = norm(entry?.brand).toLowerCase();
  const variant = norm(entry?.variant).toLowerCase();
  return `${name}|${brand}|${variant}`;
}

/** שם לתצוגה: השם עצמו, ועוד מותג/וריאנט בסוגריים-עם-נקודה אם קיימים. */
export function productDisplayName(entry) {
  const parts = [norm(entry?.brand), norm(entry?.variant)].filter(Boolean);
  const name = norm(entry?.name);
  return parts.length ? `${name} · ${parts.join(" · ")}` : name;
}

/** true כש-אין מותג ואין וריאנט - "פריט כללי": השוואת מחיר עליו היא כללית בכוונה, לא ספציפית
    למוצר מדויק - ה-UI חייב לציין את זה במפורש (לא לשתוק), לפי דרישת עמית. */
export const isGenericIdentity = entry => !norm(entry?.brand) && !norm(entry?.variant);

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
export function newGroceryItem({ name, qty = null, unit = "", category, priority = DEFAULT_PRIORITY, note = "", brand = "", variant = "", dict } = {}) {
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
    brand: norm(brand),
    variant: norm(variant),
    purchased: false,
    createdAt: now,
    updatedAt: now,
  };
}

/** פריט פעיל (לא נרכש) עם אותה זהות מוצר בדיוק (שם+מותג+וריאנט, לא רגיש לרישיות/רווחים) אם
    קיים - כדי להזהיר לפני הוספת כפילות בטעות, במקום ליצור שורה כפולה בשקט. identity
    אופציונלי (brand/variant) - כשריק (כמו ב-QuickAdd, שאין בו שדות מותג) מתאים רק מול
    פריטים אחרים שגם הם בלי מותג/וריאנט, לא "בולע" בטעות גרסה ממותגת קיימת - בכוונה: הוספת
    "מגבונים אריאל" לא אמורה להיחסם כי יש כבר "מגבונים" כללי ברשימה, וההפך. */
export function findActiveDuplicate(items, name, identity = {}) {
  const n = norm(name);
  if (!n) return null;
  const key = productKey({ name: n, brand: identity.brand, variant: identity.variant });
  return (items || []).find(i => productKey(i) === key) || null;
}

const tokensOf = name => norm(name).toLowerCase().split(/[\s,.-]+/).filter(Boolean);

/**
 * התאמת שם פריט שנסרק מקבלה (למשל "רוטב סויה יאמסה") לפריט קיים ברשימה (למשל "רוטב סויה") -
 * לשימוש בסריקת קבלה בלבד, לא להוספה ידנית (שם משתמשים ב-findActiveDuplicate המדויק, כדי לא
 * לחסום בטעות הוספת פריט שונה באמת). כאן מספיק שכל המילים של השם הקצר יותר מופיעות אצל הארוך
 * יותר (מכל כיוון - לפעמים הקבלה מוסיפה פרטים כמו מותג, ולפעמים דווקא מקוצרת מהרשימה).
 * זה יכול במקרים נדירים להתאים יתר על המידה (למשל "חלב" מול "חלב סויה" - מוצרים שונים) - אבל
 * קביל כאן כי ההתאמה רק ממלאת מחיר על פריט קיים לפני אישור ידני בטופס (לעולם לא יוצרת/מוחקת
 * נתון בשקט), וניתן לערוך/לנקות לפני השמירה בפועל.
 */
export function findReceiptMatch(items, scannedName) {
  const exact = findActiveDuplicate(items, scannedName);
  if (exact) return exact;
  const scannedTokens = tokensOf(scannedName);
  if (!scannedTokens.length) return null;
  const scannedSet = new Set(scannedTokens);
  for (const item of items || []) {
    const itemSet = new Set(tokensOf(item.name));
    if (!itemSet.size) continue;
    const [smaller, larger] = itemSet.size <= scannedSet.size ? [itemSet, scannedSet] : [scannedSet, itemSet];
    if ([...smaller].every(t => larger.has(t))) return item;
  }
  return null;
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
  const normalizedPatch = { ...patch };
  if (Object.prototype.hasOwnProperty.call(patch, "brand")) normalizedPatch.brand = norm(patch.brand);
  if (Object.prototype.hasOwnProperty.call(patch, "variant")) normalizedPatch.variant = norm(patch.variant);
  items[idx] = { ...items[idx], ...normalizedPatch, categoryAuto, updatedAt: new Date().toISOString() };
  return { ...state, items };
}

/** מחיקה קבועה של פריט פעיל (עם אישור בממשק). לא נוגע בהיסטוריה. */
export function removeItem(state, id) {
  if (!(state.items || []).some(i => i.id === id)) return state;
  return { ...state, items: state.items.filter(i => i.id !== id) };
}

/** נורמליזציה של שם חנות: טקסט חופשי, נשמר null כשריק (בדיוק כמו price). לעולם לא בודים שם. */
const normStore = store => { const s = norm(store); return s || null; };

/** נורמליזציה של תיאור מבצע (למשל "2 ב-20", "מועדון -10%") - טקסט חופשי קצר, null כשריק.
    לעולם לא בודים מבצע - זה תמיד מגיע מהמשתמש/ת או מתוכן שנקרא בפועל מהקבלה. */
const MAX_PROMO_LEN = 120;
const normPromo = promo => { const s = norm(promo); return s ? s.slice(0, MAX_PROMO_LEN) : null; };

/** סימון כנרכש: מעביר את הפריט מ-items להיסטוריה (לא נמחק לעולם). מחיר, חנות ומבצע אופציונליים, לחישובי חיסכון/ניתוח לפי חנות. */
export function markPurchased(state, id, { price = null, purchasedAt = new Date().toISOString(), store = null, promo = null } = {}) {
  const idx = (state.items || []).findIndex(i => i.id === id);
  if (idx === -1) return state;
  const item = state.items[idx];
  const entry = {
    id: item.id, name: item.name, qty: item.qty, unit: item.unit, category: item.category, priority: item.priority,
    note: item.note, brand: item.brand || "", variant: item.variant || "",
    price: isValidNonNegativeNumber(price) ? price : null, purchasedAt, store: normStore(store),
    receiptId: null, promo: normPromo(promo),
  };
  return {
    ...state,
    items: state.items.filter(i => i.id !== id),
    history: [...state.history, entry],
  };
}

/**
 * שחזור: מבטל סימון "נרכש" בטעות ומחזיר את הפריט לרשימת "צריך לקנות". מוחק את רשומת ההיסטוריה
 * (השונה מהכלל הרגיל "היסטוריה לא נמחקת לעולם" בכוונה: זו לא היסטוריית רכישה אמיתית, אלא תיקון
 * טעות לחיצה, ולכן היא לא אמורה להשפיע על ניתוח חיסכון/הוצאה). אם הרשומה הייתה חלק מקבלה
 * (receiptId) ואחרי ההסרה לא נשארו לקבלה שורות, מנקה גם את רשומת הקבלה עצמה כדי לא להשאיר קבלה ריקה.
 */
export function restoreToList(state, id) {
  const idx = (state.history || []).findIndex(h => h.id === id);
  if (idx === -1) return state;
  const entry = state.history[idx];
  const item = {
    id: crypto.randomUUID ? crypto.randomUUID() : uid(), name: entry.name, qty: entry.qty, unit: entry.unit,
    category: entry.category, categoryAuto: false, priority: entry.priority || DEFAULT_PRIORITY, note: entry.note || "",
    brand: entry.brand || "", variant: entry.variant || "",
    purchased: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  const history = state.history.filter(h => h.id !== id);
  const stillLinked = entry.receiptId && history.some(h => h.receiptId === entry.receiptId);
  const receipts = entry.receiptId && !stillLinked ? (state.receipts || []).filter(r => r.id !== entry.receiptId) : state.receipts;
  return { ...state, items: [...(state.items || []), item], history, receipts };
}

/** עדכון רשומת היסטוריה (בעיקר תיקון מחיר/חנות/מבצע בדיעבד). ההיסטוריה עצמה אף פעם לא נמחקת. */
export function updateHistoryEntry(state, id, patch) {
  const idx = (state.history || []).findIndex(h => h.id === id);
  if (idx === -1) return state;
  const history = state.history.slice();
  const next = { ...history[idx], ...patch };
  if (Object.prototype.hasOwnProperty.call(patch, "store")) next.store = normStore(patch.store);
  if (Object.prototype.hasOwnProperty.call(patch, "promo")) next.promo = normPromo(patch.promo);
  if (Object.prototype.hasOwnProperty.call(patch, "brand")) next.brand = norm(patch.brand);
  if (Object.prototype.hasOwnProperty.call(patch, "variant")) next.variant = norm(patch.variant);
  // שם ריק לא נשמר (שדה חובה) - נשאר השם הקודם, לא "נעלם" בטעות.
  if (Object.prototype.hasOwnProperty.call(patch, "name")) next.name = norm(patch.name) || history[idx].name;
  history[idx] = next;
  return { ...state, history };
}

/**
 * המבצע/עסקת-כמות האחרונה שראינו למוצר הזה (לפי שם מדויק, לא רגיש לרישיות/רווחים - פריט
 * פעיל שנוצר מההיסטוריה הזו אמור לשאת את אותו שם) - למשל להציג אייקון ברשימת "צריך לקנות".
 * "שווה הצגה" = יש promo מפורש שנקרא מהקבלה, או שנרכשו כמה יחידות יחד במחיר כולל ידוע (גם
 * בלי שהקבלה סימנה את זה כ"מבצע" בפירוש - "2 יחידות ב-22" זה מידע שימושי כשלעצמו). ה-UI
 * (Household.jsx) מרכיב את הטקסט הסופי מ-promo אם יש, אחרת מ-qty/price (ils/pricePerUnit
 * שייכים ל-UI, לא לקובץ הטהור הזה). null אם אין שום דבר רלוונטי להציג.
 */
/** identity: אובייקט {name, brand?, variant?} (או פריט עצמו) - זהות מוצר מדויקת, לא רק שם,
    כדי שלא יוצג "המבצע האחרון" של מותג/גודל אחר לגמרי שרק חולק שם גנרי. */
export function lastPromoForProduct(history, identity) {
  if (!norm(identity?.name)) return null;
  const key = productKey(identity);
  const worthShowing = h => h.promo || (isValidPositiveNumber(h.qty) && h.qty > 1 && isValidNonNegativeNumber(h.price));
  const matches = (history || []).filter(h => productKey(h) === key && worthShowing(h));
  if (!matches.length) return null;
  const latest = [...matches].sort((a, b) => (a.purchasedAt < b.purchasedAt ? 1 : -1))[0];
  return { promo: latest.promo, qty: latest.qty, price: latest.price, purchasedAt: latest.purchasedAt, store: latest.store };
}

/** רשימת שמות חנויות שהוזנו בעבר (מהיסטוריה + מקבלות), למיון/הצעה בטופס — רשימה מקומית פשוטה, בלי API חיצוני. */
export function knownStores(state) {
  const names = new Set();
  for (const h of state?.history || []) if (h.store) names.add(h.store);
  for (const r of state?.receipts || []) if (r.store) names.add(r.store);
  return [...names].sort((a, b) => heCompare(a, b));
}

// ---------- קבלה (receipt): רישום קנייה שלמה בבת אחת ----------
// state.receipts = [{ id, store, date (YYYY-MM-DD), images: [], createdAt }] — מטא-דאטה של הקבלה עצמה
// (כולל תמונה, ראה ImageAttachments), בנפרד משורות ההיסטוריה כדי לא לשכפל תמונה לכל שורה.
// כל רשומת היסטוריה שנוצרת מקבלה מקבלת receiptId (נולל'בילי) שמצביע לכאן, לצורך ניתוח עתידי —
// הבחירה הזו (ולא שכפול store/date/images על כל שורה) שומרת על מקור אמת יחיד לפרטי הקבלה.
export function createReceiptRecord({ store, date = new Date().toISOString().slice(0, 10) } = {}) {
  const s = normStore(store);
  if (!s) return null;
  return { id: uid(), store: s, date, images: [], createdAt: new Date().toISOString() };
}

/**
 * רישום קבלה: פריטים שנבחרו מהרשימה הפעילה (listItems: [{id, price, qty?, promo?}]), שורות
 * אד-הוק שלא היו ברשימה (adHocItems: [{name, price, qty, unit, category, promo?}]) - קבלות
 * אמיתיות כוללות תמיד גם דברים שלא תוכננו - וגם עדכון מחיר על רכישות שכבר סומנו כנרכשו בלי
 * מחיר (historyUpdates: [{id, price, qty?, promo?}]). השימוש האחרון קיים כי הזרימה הטבעית
 * היא: מסמנים "נרכש" בזמן הקנייה (צ'קבוקס, בלי מחיר עדיין - markPurchased בלי פרמטרים) ורק
 * אחר כך סורקים את הקבלה כדי למלא מחירים בדיעבד - findReceiptMatch (ב-Household.jsx) מחפש
 * גם ברשימה הפעילה וגם ברכישות כאלה (receiptId==null, price==null), לא רק ברשימה הפעילה.
 * price/qty אופציונליים בכל שורה (בדיוק כמו markPurchased) — לעולם לא בודים מחיר.
 * לא עושה כלום אם אין שם חנות תקין או ששלוש הרשימות ריקות (אין מה לרשום).
 * @returns {{state:object, receiptId:string|null}}
 */
export function logReceipt(state, { store, date = new Date().toISOString().slice(0, 10), listItems = [], adHocItems = [], historyUpdates = [] } = {}) {
  const receipt = createReceiptRecord({ store, date });
  const validList = (listItems || []).filter(li => li && typeof li.id === "string" && (state.items || []).some(i => i.id === li.id));
  const validAdHoc = (adHocItems || []).filter(a => isValidName(a?.name));
  const validHistoryUpdates = (historyUpdates || []).filter(hu => hu && typeof hu.id === "string" && (state.history || []).some(h => h.id === hu.id));
  if (!receipt || (validList.length === 0 && validAdHoc.length === 0 && validHistoryUpdates.length === 0)) return { state, receiptId: null };
  const purchasedAt = `${date}T12:00:00.000Z`;
  const pickedIds = new Set(validList.map(li => li.id));
  const fromList = validList.map(li => {
    const item = state.items.find(i => i.id === li.id);
    return {
      id: item.id, name: item.name, qty: isValidPositiveNumber(li.qty) ? li.qty : item.qty, unit: item.unit,
      category: item.category, priority: item.priority, note: item.note,
      brand: item.brand || "", variant: item.variant || "",
      price: isValidNonNegativeNumber(li.price) ? li.price : null, purchasedAt, store: receipt.store, receiptId: receipt.id,
      promo: normPromo(li.promo),
    };
  });
  const fromAdHoc = validAdHoc.map(a => ({
    id: uid(), name: norm(a.name), qty: isValidPositiveNumber(a.qty) ? a.qty : null, unit: norm(a.unit),
    category: CATEGORIES.includes(a.category) ? a.category : detectCategory(a.name, state.categoryDict), priority: DEFAULT_PRIORITY,
    note: norm(a.note), brand: norm(a.brand), variant: norm(a.variant),
    price: isValidNonNegativeNumber(a.price) ? a.price : null, purchasedAt, store: receipt.store, receiptId: receipt.id,
    promo: normPromo(a.promo),
  }));
  const updatesById = new Map(validHistoryUpdates.map(hu => [hu.id, hu]));
  const history = state.history.map(h => {
    const hu = updatesById.get(h.id);
    if (!hu) return h;
    return {
      ...h,
      price: isValidNonNegativeNumber(hu.price) ? hu.price : h.price,
      qty: isValidPositiveNumber(hu.qty) ? hu.qty : h.qty,
      promo: hu.promo != null ? normPromo(hu.promo) : h.promo,
      brand: hu.brand != null ? norm(hu.brand) : h.brand,
      variant: hu.variant != null ? norm(hu.variant) : h.variant,
      store: receipt.store, receiptId: receipt.id,
    };
  });
  return {
    state: {
      ...state,
      items: state.items.filter(i => !pickedIds.has(i.id)),
      history: [...history, ...fromList, ...fromAdHoc],
      receipts: [...(state.receipts || []), receipt],
    },
    receiptId: receipt.id,
  };
}

/** עדכון תמונות של קבלה קיימת (ImageAttachments onChange). */
export function updateReceiptImages(state, receiptId, images) {
  const idx = (state.receipts || []).findIndex(r => r.id === receiptId);
  if (idx === -1) return state;
  const receipts = state.receipts.slice();
  receipts[idx] = { ...receipts[idx], images: Array.isArray(images) ? images : [] };
  return { ...state, receipts };
}

/**
 * מחיקה לצמיתות של קבלה שלמה - רשומת הקבלה עצמה וכל שורות ההיסטוריה שמקושרות אליה
 * (receiptId). לשימוש "התחלה מחדש" כשקבלה נרשמה לא נכון (למשל לפני PR #144, כש-התאמות
 * שגויות נכנסו בשקט). עם אישור בממשק; לא נוגע בשום פריט/רכישה אחרים. תמונות הקבלה
 * (Storage) מטופלות בצד ה-UI עם purgeImages לפני הקריאה לכאן - קובץ טהור, בלי side effects חיצוניים.
 */
export function removeReceiptRecord(state, receiptId) {
  if (!(state.receipts || []).some(r => r.id === receiptId)) return state;
  return {
    ...state,
    receipts: state.receipts.filter(r => r.id !== receiptId),
    history: (state.history || []).filter(h => h.receiptId !== receiptId),
  };
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

/**
 * פירוט רכישות החודש לפי מוצר - בניגוד ל-mostPurchasedProducts (לכל ההיסטוריה, בלי הגבלת
 * זמן), זה עונה בדיוק על "מה קניתי החודש, כמה פעמים, וכמה זה עלה": לכל מוצר שנרכש בחודש
 * הנתון - כמה פעמים (count), וסך ההוצאה עליו באותו חודש (total, רק מרשומות עם מחיר תקין -
 * pricedCount אומר מתוך כמה רכישות זה חושב). ממוין מהגבוה בהוצאה.
 */
export function monthlyProductBreakdown(history, month = nowMonth()) {
  const byKey = new Map();
  for (const h of history || []) {
    if (monthKeyOf(h.purchasedAt) !== month) continue;
    if (!norm(h.name)) continue;
    const key = productKey(h);
    const row = byKey.get(key) || { key, name: productDisplayName(h), generic: isGenericIdentity(h), count: 0, total: 0, pricedCount: 0 };
    row.count += 1;
    if (hasValidPrice(h)) { row.total = round2(row.total + h.price); row.pricedCount += 1; }
    byKey.set(key, row);
  }
  return [...byKey.values()].sort((a, b) => b.total - a.total || b.count - a.count || heCompare(a.name, b.name));
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

/** מוצרים חוזרים על פני יותר מחודש אחד (ברירת מחדל: לפחות 2 חודשים שונים). לפי זהות מוצר
    מדויקת (productKey) - מוצר ממותג ומוצר כללי עם אותו שם נספרים בנפרד. */
export function repeatProducts(history, { minMonths = 2 } = {}) {
  const byKey = new Map();
  for (const h of history || []) {
    if (!norm(h.name)) continue;
    const key = productKey(h);
    const row = byKey.get(key) || { name: productDisplayName(h), months: new Set() };
    row.months.add(monthKeyOf(h.purchasedAt));
    byKey.set(key, row);
  }
  return [...byKey.entries()]
    .map(([key, row]) => ({ key, name: row.name, months: [...row.months].sort(), count: row.months.size }))
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

// ---------- ניתוח לפי חנות (מסך "לפי חנות") ----------
// כל הפונקציות כאן: לוגיקה טהורה בלבד, אך ורק מרשומות עם מחיר תקין (hasValidPrice) וחנות ידועה, בדיוק
// כמו pricePerUnit ו-monthlySpend הקיימים. לעולם לא ממציאות מספר — כשאין מספיק נתונים, מחזירות רשימה
// ריקה / available:false, וה-UI מציג "אין מספיק נתונים" בדיוק כמו מסך החיסכון הקיים.

/** סך הוצאה ומחיר הזמנה ממוצע לכל חנות, מרשומות עם מחיר תקין וחנות ידועה בלבד. ממוין מהגבוה לנמוך. */
export function storeTotals(history) {
  const byStore = new Map();
  for (const h of history || []) {
    if (!h.store || !hasValidPrice(h)) continue;
    const s = byStore.get(h.store) || { store: h.store, total: 0, count: 0 };
    s.total = round2(s.total + h.price); s.count += 1;
    byStore.set(h.store, s);
  }
  return [...byStore.values()].map(s => ({ ...s, avgItemPrice: round2(s.total / s.count) })).sort((a, b) => b.total - a.total || heCompare(a.store, b.store));
}

/**
 * המוצרים/הקטגוריות שנרכשים הכי הרבה — לפי תדירות (מספר רכישות, בלי תלות במחיר) ולפי סך הוצאה
 * (רק מרשומות עם מחיר תקין). שתי רשימות נפרדות כי הן עונות על שאלות שונות ("מה קונים הכי הרבה"
 * מול "על מה מוציאים הכי הרבה כסף") ולא תמיד אותו מוצר מוביל בשתיהן.
 */
function mostPurchasedBy(history, keyOf, labelOf, { limit = 10 } = {}) {
  const freq = new Map(), spend = new Map(), labels = new Map();
  for (const h of history || []) {
    const key = keyOf(h);
    if (!key) continue;
    if (!labels.has(key)) labels.set(key, labelOf(h));
    freq.set(key, (freq.get(key) || 0) + 1);
    if (hasValidPrice(h)) spend.set(key, round2((spend.get(key) || 0) + h.price));
  }
  const byFrequency = [...freq.entries()].map(([key, count]) => ({ key, name: labels.get(key), count })).sort((a, b) => b.count - a.count || heCompare(a.name, b.name)).slice(0, limit);
  const bySpend = [...spend.entries()].map(([key, total]) => ({ key, name: labels.get(key), total })).sort((a, b) => b.total - a.total || heCompare(a.name, b.name)).slice(0, limit);
  return { byFrequency, bySpend };
}

// זהות מוצר מדויקת (productKey) - לא שם בלבד, כך שמוצר ממותג ומוצר כללי עם אותו שם לא מתערבבים.
export const mostPurchasedProducts = (history, opts) => mostPurchasedBy(history, h => norm(h.name) ? productKey(h) : "", h => productDisplayName(h), opts);
export const mostPurchasedCategories = (history, opts) => mostPurchasedBy(history, h => h.category || "", h => h.category, opts);

/**
 * "החנות הזולה ביותר שראינו" למוצר X: קריאה עובדתית טהורה מתוך היסטוריית מחירים — לא המלצה, לא
 * השוואת מחירים חיה. מופיע רק כשיש נתוני מחיר מ-2 חנויות שונות לפחות לאותו מוצר (אחרת אין בסיס
 * להשוואה, ולא בודים "הכי זול" משחנות אחת).
 */
/** "החנות הזולה ביותר שראינו" - לפי זהות מוצר מדויקת (productKey), לא שם בלבד: שני מוצרים
    עם אותו שם אבל מותג/גודל שונה לא מתערבבים בהשוואה (בדיוק התרחיש שהוביל לדרישה הזו -
    "מגבונים" כלליים מול מותג/גודל ספציפי). generic=true כש-הזהות בלי מותג/וריאנט - ה-UI
    חייב לציין את זה במפורש, לא לשתוק (דרישת עמית). */
export function cheapestStoreSeen(history) {
  const byKey = new Map(); // productKey -> { name, generic, stores: Map(store -> minPrice) }
  for (const h of history || []) {
    if (!h.store || !hasValidPrice(h) || !norm(h.name)) continue;
    const key = productKey(h);
    const row = byKey.get(key) || { name: productDisplayName(h), generic: isGenericIdentity(h), stores: new Map() };
    row.stores.set(h.store, Math.min(row.stores.get(h.store) ?? Infinity, h.price));
    byKey.set(key, row);
  }
  const out = [];
  for (const [key, row] of byKey) {
    if (row.stores.size < 2) continue; // פחות מ-2 חנויות: אין מספיק נתונים להשוואה
    const ranked = [...row.stores.entries()].map(([store, minPrice]) => ({ store, minPrice: round2(minPrice) })).sort((a, b) => a.minPrice - b.minPrice || heCompare(a.store, b.store));
    out.push({ key, name: row.name, generic: row.generic, cheapestStore: ranked[0].store, cheapestPrice: ranked[0].minPrice, stores: ranked });
  }
  return out.sort((a, b) => heCompare(a.name, b.name));
}

/** עד limit הרכישות האחרונות (חדשות קודם) לאותה זהות מוצר בדיוק - "כרטיס פריט". */
export function productHistory(history, identity, { limit = 10 } = {}) {
  if (!norm(identity?.name)) return [];
  const key = productKey(identity);
  return [...(history || [])]
    .filter(h => productKey(h) === key)
    .sort((a, b) => (a.purchasedAt < b.purchasedAt ? 1 : -1))
    .slice(0, limit);
}

/** סיכום מחיר ל"כרטיס פריט": מחיר אחרון, הכי נמוך שראינו + איפה/מתי - רק מרכישות עם מחיר
    תקין, לאותה זהות מוצר בדיוק. בלי מספיק נתונים - last/lowest null, לא בודה מספר.
    generic=true כש-הזהות בלי מותג/וריאנט (ה-UI מציין "השוואה כללית" לפי דרישת עמית). */
export function productPriceSummary(history, identity) {
  const generic = isGenericIdentity(identity);
  if (!norm(identity?.name)) return { generic, count: 0, last: null, lowest: null };
  const key = productKey(identity);
  const priced = (history || []).filter(h => productKey(h) === key && hasValidPrice(h));
  if (!priced.length) return { generic, count: 0, last: null, lowest: null };
  const last = [...priced].sort((a, b) => (a.purchasedAt < b.purchasedAt ? 1 : -1))[0];
  const lowest = [...priced].sort((a, b) => a.price - b.price || (a.purchasedAt < b.purchasedAt ? 1 : -1))[0];
  return {
    generic, count: priced.length,
    last: { price: last.price, store: last.store, purchasedAt: last.purchasedAt },
    lowest: { price: lowest.price, store: lowest.store, purchasedAt: lowest.purchasedAt },
  };
}

/** זהויות מוצר ידועות (שם+מותג+וריאנט) מהרשימה הפעילה + ההיסטוריה, להצעה/השלמה בהוספת
    פריט חדש - datalist בלבד (לא select סגור), תמיד אפשר להקליד ערך חדש שלא ברשימה. */
export function knownProducts(state) {
  const byKey = new Map();
  for (const entry of [...(state?.items || []), ...(state?.history || [])]) {
    if (!norm(entry?.name)) continue;
    const key = productKey(entry);
    if (!byKey.has(key)) byKey.set(key, { name: norm(entry.name), brand: norm(entry.brand || ""), variant: norm(entry.variant || "") });
  }
  return [...byKey.values()].sort((a, b) => heCompare(a.name, b.name) || heCompare(a.brand, b.brand) || heCompare(a.variant, b.variant));
}

/** אזהרה (לא חסימה - אישור ידני כבר חובה בכל מקרה): ההתאמה המוצעת היא לפריט עם מותג/וריאנט
    ידועים ברשימה, אבל טקסט השם שנסרק מהקבלה לא כולל אותם בכלל - סימן אפשרי שזה מוצר/גודל
    שונה בפועל (בדיוק התרחיש: "מגבונים" כללי ברשימה מול מותג/גודל ספציפי בקבלה, ולהפך). אין
    שדה מותג נפרד בתוצאת הסריקה (רק שם גולמי) - לכן זו בדיקת substring על הטקסט, לא זיהוי מדויק. */
export function identityMismatchWarning(candidate, scannedName) {
  const scanned = norm(scannedName).toLowerCase();
  if (!scanned) return false;
  const brand = norm(candidate?.brand).toLowerCase();
  const variant = norm(candidate?.variant).toLowerCase();
  if (!brand && !variant) return false;
  const brandFound = !brand || scanned.includes(brand);
  const variantFound = !variant || scanned.includes(variant);
  return !(brandFound && variantFound);
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
