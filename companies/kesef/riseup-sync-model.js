// מודל טהור (בלי import של @/...) לסנכרון RiseUp: מיפוי קטגוריות, דה-דופ, וצילום מצב
// לשמירה דרך lib/store.js (ראו RiseupSync.jsx). מיובא מ-./model.js בלבד (יחסי, לא @/).
import { BUDGET_CATS_DEFAULT } from "./model.js";

export const RISEUP_STORE_KEY = "hq:kesef:riseup-snapshot:v1";

// snapshot: null עד סנכרון ראשון מוצלח. lastError: תיעוד ניסיון הסנכרון האחרון שנכשל
// (כולל "לא מוגדר"), כדי שהמצב ישרוד רענון דף בלי לבצע קריאה נוספת.
export const RISEUP_INIT = { snapshot: null, lastError: null };

/*
  מיפוי envelopes[].type של RiseUp לקטגוריות התקציב הקיימות (BUDGET_CATS_DEFAULT מ-model.js):
  ["מזון", "ביטוחים", "מנויים", "פנאי", "חיסכון", "אחר"].

  הטיפוסים אצל RiseUp: fixed, trackingCategory, variable, variableIncome, riseupGoal.

  ההחלטה ולמה:
  - variableIncome: זו לא הוצאה בכלל - זו הכנסה. מוחרגת לגמרי מסכומי ההוצאה לפי קטגוריה,
    ומסוכמת בנפרד (summarizeEnvelopes().income). לצרף אותה ל"אחר" היה מעוות את סך ההוצאות.
  - riseupGoal: יעד חיסכון מפורש שהמשתמש הגדיר ב-RiseUp - יש כאן התאמה סמנטית אמיתית,
    לא ניחוש -> ממופה ל"חיסכון".
  - fixed / trackingCategory / variable: אלה מתארים *איך* המעטפה מתנהגת (סכום קבוע חודשי /
    מעקב מצטבר / סכום משתנה) ולא *במה* היא עוסקת. אין דרך אמינה להסיק מהטיפוס לבד אם מדובר
    ב"מזון", "ביטוחים" או "מנויים" - וה-API (כפי שתואר) לא חושף קטגוריה חופשית/שם מעטפה
    כחלק מהחוזה היציב שאפשר לסמוך עליו כאן. ניחוש כזה (למשל "fixed"->"ביטוחים") היה מטעה
    יותר משהוא מועיל, ומחזיק "עובדה" שאין לנו. לכן שלושת אלה נופלים ל"אחר" *בגלוי* -
    לא בשקט, ולא כברירת מחדל של "לא ידעתי מה לעשות עם type לא מוכר" (זו סיבה שונה, ראו למטה).
    שיפור עתידי אפשרי (מחוץ לתחום v1): מיפוי לפי שם/id של המעטפה במקום type בלבד.
  - כל type שאינו אחד מחמשת הטיפוסים המוכרים: גם הוא נופל ל"אחר", ולעולם לא גורם לקריסה,
    אבל מדווח בנפרד (summarizeEnvelopes().unmappedTypes) כדי להבדיל בין "ידענו וקבענו אחר
    במפורש" לבין "type לא מוכר בכלל" - הראשון צפוי, השני כדאי שיבלוט.
*/
export const INCOME_TYPES = Object.freeze(["variableIncome"]);
export const TYPE_TO_CATEGORY = Object.freeze({
  riseupGoal: "חיסכון",
  fixed: "אחר",
  trackingCategory: "אחר",
  variable: "אחר",
});
const FALLBACK_CATEGORY = "אחר";

export function isIncomeEnvelope(envelope) {
  return INCOME_TYPES.includes(envelope?.type);
}

/** מחזיר את קטגוריית ההוצאה של מעטפה, או null אם זו הכנסה (לא נספרת בקטגוריות הוצאה). */
export function mapEnvelopeCategory(envelope) {
  if (isIncomeEnvelope(envelope)) return null;
  const cat = TYPE_TO_CATEGORY[envelope?.type] || FALLBACK_CATEGORY;
  return BUDGET_CATS_DEFAULT.includes(cat) ? cat : FALLBACK_CATEGORY;
}

// מסכם envelopes[] לפי קטגוריית הוצאה (מתוכנן/בפועל, ערך מוחלט - כמו est/act בקטגוריית
// תקציב רגילה ב-model.js, שתמיד מוצגים כחיוביים) + סה"כ הכנסה בנפרד. לא קורס על קלט
// חסר/משונה - כל שדה חסר מטופל כ-0/מחרוזת ריקה.
export function summarizeEnvelopes(envelopes) {
  const byCategory = Object.fromEntries(BUDGET_CATS_DEFAULT.map(c => [c, { planned: 0, actual: 0, count: 0 }]));
  const income = { planned: 0, actual: 0, count: 0 };
  const unmappedTypes = new Set();

  for (const raw of Array.isArray(envelopes) ? envelopes : []) {
    const envelope = raw || {};
    const planned = Number.isFinite(envelope.originalAmount) ? envelope.originalAmount : 0;
    const actual = Number.isFinite(envelope.balancedAmount) ? envelope.balancedAmount : 0;

    if (isIncomeEnvelope(envelope)) {
      income.planned += planned;
      income.actual += actual;
      income.count += 1;
      continue;
    }

    const knownType = envelope.type === "riseupGoal" || Object.prototype.hasOwnProperty.call(TYPE_TO_CATEGORY, envelope.type);
    if (!knownType) unmappedTypes.add(envelope.type || "(ללא סוג)");

    const cat = mapEnvelopeCategory(envelope) || FALLBACK_CATEGORY;
    byCategory[cat].planned += Math.abs(planned);
    byCategory[cat].actual += Math.abs(actual);
    byCategory[cat].count += 1;
  }

  return { byCategory, income, unmappedTypes: Array.from(unmappedTypes) };
}

/** דה-דופ: אותו budgetDate + אותו cashflowHash כמו הצילום השמור = שום דבר לא השתנה. */
export function isSameAsLastSnapshot(prevSnapshot, response) {
  return !!prevSnapshot && !!response && prevSnapshot.budgetDate === response.budgetDate && prevSnapshot.cashflowHash === response.cashflowHash;
}

/**
 * בונה צילום מעודכן משמור מתוצאת סנכרון מוצלחת.
 * changed=false כשה-cashflowHash זהה לצילום הקודם לאותו חודש (no-op מתועד - שום דבר לא
 * חושב/הוחלף מחדש); syncedAt כן מתעדכן בכל מקרה כדי שהממשק ישקף מתי בוצע ניסיון הסנכרון
 * האחרון בפועל, גם כשהוא היה no-op.
 */
export function buildSyncedSnapshot(prevSnapshot, response, now = () => new Date().toISOString()) {
  const syncedAt = now();
  if (isSameAsLastSnapshot(prevSnapshot, response)) {
    return { snapshot: { ...prevSnapshot, syncedAt, stale: false, staleReason: null, staleAt: null }, changed: false };
  }
  const snapshot = {
    budgetDate: response.budgetDate,
    cashflowHash: response.cashflowHash,
    lastUpdatedAt: response.lastUpdatedAt || null,
    envelopes: Array.isArray(response.envelopes) ? response.envelopes : [],
    summary: summarizeEnvelopes(response.envelopes),
    syncedAt,
    stale: false,
    staleReason: null,
    staleAt: null,
  };
  return { snapshot, changed: true };
}

/**
 * סנכרון שנכשל: הצילום הקודם (אם קיים) נשאר על המסך כמות שהוא, רק מסומן stale עם סיבה
 * וזמן - כלל "כשל משאיר את הצילום הקודם על המסך ומסומן". אם אין צילום קודם - אין מה
 * להשאיר (המצב "לא סונכרן מעולם" ממילא ברור מ-lastError לבדו).
 */
export function markSyncFailed(prevSnapshot, reason, now = () => new Date().toISOString()) {
  if (!prevSnapshot) return null;
  return { ...prevSnapshot, stale: true, staleReason: reason, staleAt: now() };
}
