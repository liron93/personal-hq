// לוגיקה טהורה של "שוברים" (לשונית במשק בית) — שובר = שם, סכום מקורי, סכום שנוצל, ויתרה
// מחושבת. אין פה קשר לרשימת הקניות/היסטוריית הרכישות (grocery-model.js) - שוברים יכולים
// להיות לכל חנות, לא רק סופר. קובץ טהור בכוונה (בלי React, בלי Supabase, בלי window, ובלי
// alias imports של "@/") כדי שיהיה אפשר לייבא אותו ישירות תחת node:test, בדיוק כמו grocery-model.js.
// state.vouchers יושב ברמה העליונה של state משק בית (hq:household:v1, ראה model.js), לצד
// items/history/receipts הקיימים - לא מפתח אחסון נפרד.

// זהה ל-uid()/norm() ב-grocery-model.js, משוכפל כאן בכוונה כדי שהמודול יישאר טהור ועצמאי.
const uid = () => Math.random().toString(36).slice(2, 10);
const norm = s => String(s || "").trim();
const isValidPositiveNumber = v => typeof v === "number" && Number.isFinite(v) && v > 0;
const isValidNonNegativeNumber = v => typeof v === "number" && Number.isFinite(v) && v >= 0;
const round2 = n => Math.round(n * 100) / 100;

// תוקף וקוד אבטחה (CVV) הם טקסט חופשי בכוונה, לא ולידציה/פורמט תאריך נוקשה: תוקף על שובר
// לרוב מודפס כ"חודש/שנה" (למשל "12/27") או "תוקף עד DD.MM.YYYY" ולא כתאריך מלא אחיד, וקוד
// אבטחה יכול להיות 3-4 ספרות או שילוב אותיות-ספרות תלוי המנפיק - שומרים בדיוק כמו שהוזן.
const MAX_EXPIRY_LEN = 20;
const MAX_CVV_LEN = 20;
const normExpiry = v => { const s = norm(v); return s ? s.slice(0, MAX_EXPIRY_LEN) : null; };
const normCvv = v => { const s = norm(v); return s ? s.slice(0, MAX_CVV_LEN) : null; };

/** שובר חדש: שם וסכום מקורי חובה (אחרת null - שם ריק/סכום לא חוקי לא בודים שובר). usedAmount
    מתחיל מ-0 (אפשר לעדכן בהמשך ב-updateVoucher), fullyUsed מתחיל כ-false. expiry/cvv
    אופציונליים ביצירה - אפשר להוסיף/לערוך גם מאוחר יותר דרך updateVoucher. */
export function createVoucher({ name, originalAmount, expiry, cvv } = {}) {
  const n = norm(name);
  if (!n || !isValidPositiveNumber(originalAmount)) return null;
  const now = new Date().toISOString();
  return {
    id: uid(), name: n, originalAmount, usedAmount: 0, fullyUsed: false,
    expiry: normExpiry(expiry), cvv: normCvv(cvv), createdAt: now, updatedAt: now,
  };
}

export function addVoucher(state, fields) {
  const voucher = createVoucher(fields);
  if (!voucher) return state;
  return { ...state, vouchers: [...(state.vouchers || []), voucher] };
}

/**
 * עדכון שובר קיים - usedAmount/originalAmount מנורמלים (ערך לא חוקי נשאר כמו שהיה, לא נדרס
 * בערך שגוי), fullyUsed/name עוברים ישירות. לעולם לא נוגע בשוברים אחרים.
 */
export function updateVoucher(state, id, patch) {
  const idx = (state.vouchers || []).findIndex(v => v.id === id);
  if (idx === -1) return state;
  const vouchers = state.vouchers.slice();
  const current = vouchers[idx];
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  if (Object.prototype.hasOwnProperty.call(patch, "usedAmount")) {
    next.usedAmount = isValidNonNegativeNumber(patch.usedAmount) ? patch.usedAmount : current.usedAmount;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "originalAmount")) {
    next.originalAmount = isValidPositiveNumber(patch.originalAmount) ? patch.originalAmount : current.originalAmount;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "name")) {
    next.name = norm(patch.name) || current.name; // שם ריק לא דורס שם קיים
  }
  if (Object.prototype.hasOwnProperty.call(patch, "expiry")) next.expiry = normExpiry(patch.expiry);
  if (Object.prototype.hasOwnProperty.call(patch, "cvv")) next.cvv = normCvv(patch.cvv);
  vouchers[idx] = next;
  return { ...state, vouchers };
}

/** מחיקה לצמיתות (עם אישור בממשק) - לשובר שהוזן בטעות, לא לשובר שרק נוצל במלואו (לזה יש fullyUsed). */
export function removeVoucher(state, id) {
  if (!(state.vouchers || []).some(v => v.id === id)) return state;
  return { ...state, vouchers: state.vouchers.filter(v => v.id !== id) };
}

/**
 * היתרה שנשארה בשובר: fullyUsed=true מציג 0 תמיד (סימון ידני "סיימתי איתו", גם אם החשבון
 * המדויק לא מסתדר עד הסוף - למשל חנות לא מחזירה עודף) בלי למחוק את השובר או לשנות usedAmount.
 * אחרת originalAmount-usedAmount כפי שהם - כולל שלילי אם usedAmount גדול מהמקורי (נשאר גלוי
 * בכוונה כדי שרואים טעות הזנה, לא מוסתר/מתוקן בשקט).
 */
export function remainingAmount(voucher) {
  if (!voucher) return 0;
  if (voucher.fullyUsed) return 0;
  return round2((voucher.originalAmount || 0) - (voucher.usedAmount || 0));
}

const heCompare = (a, b) => String(a).localeCompare(String(b), "he");

/** שוברים פעילים (לא נוצלו במלואם) קודם, ממוינים מהישן לחדש (שובר חדש מתווסף לתחתית
    הרשימה - פידבק מפורש, לא לראש הרשימה); נוצלו במלואם בסוף, גם הם מהישן לחדש. */
export function sortVouchers(vouchers) {
  return [...(vouchers || [])].sort((a, b) => {
    if (a.fullyUsed !== b.fullyUsed) return a.fullyUsed ? 1 : -1;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return heCompare(a.name, b.name);
  });
}

/** סך כל היתרות הפעילות (לא נוצלו במלואן) - לשימוש עתידי אפשרי בתצוגת סיכום. */
export function totalRemaining(vouchers) {
  return round2((vouchers || []).filter(v => !v.fullyUsed).reduce((sum, v) => sum + remainingAmount(v), 0));
}
