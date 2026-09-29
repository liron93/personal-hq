// מודל טהור (בלי import של @/...) לסנכרון RiseUp: הכנסה/הוצאה, תיוג מעטפות אישי, דה-דופ,
// וצילום מצב לשמירה דרך lib/store.js (ראו RiseupSync.jsx).

export const RISEUP_STORE_KEY = "hq:kesef:riseup-snapshot:v1";

// snapshot: null עד סנכרון ראשון מוצלח. lastError: תיעוד ניסיון הסנכרון האחרון שנכשל
// (כולל "לא מוגדר"), כדי שהמצב ישרוד רענון דף בלי לבצע קריאה נוספת. envelopeLabels: תיוג
// אישי של המשתמש/ת למעטפות RiseUp לפי id יציב (ראו למטה) - נשמר בנפרד מהצילום עצמו, כדי
// שתיוג לא ידרוס/יאבד בסנכרון הבא ולהפך.
export const RISEUP_INIT = { snapshot: null, lastError: null, envelopeLabels: {} };

export const UNLABELED = "לא מתויג";
export const SAVINGS_LABEL = "חיסכון";
const MAX_LABEL_LEN = 40;

/*
  זיהוי הכנסה מול הוצאה: לפי הסימן של הסכום, כמו שהתיעוד הרשמי של RiseUp מגדיר במפורש
  ("originalAmount: positive = income, negative = expense") - לא לפי envelopes[].type.
  גרסה קודמת הסתמכה על type==="variableIncome" בלבד, וזה היה שגוי בפועל: לא כל מעטפת
  הכנסה אמיתית (למשל משכורת שמוגדרת ב-RiseUp כמעטפה "fixed") נושאת את ה-type הזה, וזה
  גרם ל"הכנסה בפועל: 0 ₪" גם כשהיו נתוני הכנסה אמיתיים - הם פשוט נספרו כהוצאה ב"אחר".
  riseupGoal (יעד חיסכון) הוא חריג מפורש: אף פעם לא הכנסה, גם אם מוגדר עם סכום חיובי.
*/
export function isIncomeEnvelope(envelope) {
  if (!envelope || envelope.type === "riseupGoal") return false;
  if (envelope.type === "variableIncome") return true;
  // originalAmount=0 אינו אות אמין ("שום דבר לא תוכנן"), אז נופלים ל-balancedAmount (בפועל)
  // כדי לא לפספס הכנסה בלתי מתוכננת/חד-פעמית.
  const planned = envelope.originalAmount;
  const amount = Number.isFinite(planned) && planned !== 0 ? planned
    : Number.isFinite(envelope.balancedAmount) ? envelope.balancedAmount : 0;
  return amount > 0;
}

const norm = s => String(s ?? "").trim().slice(0, MAX_LABEL_LEN);

/** תיוג אישי חדש/מעודכן למעטפה לפי id. תווית ריקה מוחקת תיוג קיים (חוזר ל"לא מתויג"). */
export function setEnvelopeLabel(labels, id, label) {
  const clean = labels && typeof labels === "object" ? { ...labels } : {};
  if (!id) return clean;
  const value = norm(label);
  if (!value) delete clean[id]; else clean[id] = value;
  return clean;
}

/** כל התוויות שכבר בשימוש, ממוינות א"ב, לצורך auto-complete בממשק - לא רשימה סגורה. */
export function knownLabels(labels) {
  return [...new Set(Object.values(labels || {}).filter(Boolean))].sort((a, b) => a.localeCompare(b, "he"));
}

/**
 * מסכם envelopes[] להכנסה (בנפרד) ולהוצאות לפי התיוג האישי של המשתמש/ת (labels: id -> תווית).
 * מעטפת יעד חיסכון (riseupGoal) מתויגת אוטומטית "חיסכון" גם בלי תיוג ידני - יש כאן התאמה
 * סמנטית אמיתית מה-type. מעטפת הוצאה בלי תיוג אישי נופלת ל"לא מתויג" בגלוי, ולא מנוחשת -
 * ל-RiseUp אין שם/קטגוריה חופשית בחוזה היציב של ה-API (רק id יציב + type כללי), אז המשתמש/ת
 * הם היחידים שיכולים לדעת אם מעטפה מסוימת היא "סופר", "דלק" או "מסעדות". סכומים בערך מוחלט
 * (כמו est/act בתקציב הרגיל, שתמיד מוצגים כחיוביים). לא קורס על קלט חסר/משונה.
 */
export function summarizeEnvelopes(envelopes, labels = {}) {
  const income = { planned: 0, actual: 0, count: 0 };
  const byLabel = new Map(); // תווית -> { planned, actual, count }
  const bump = (label, planned, actual) => {
    const row = byLabel.get(label) || { label, planned: 0, actual: 0, count: 0 };
    row.planned += Math.abs(planned); row.actual += Math.abs(actual); row.count += 1;
    byLabel.set(label, row);
  };

  for (const raw of Array.isArray(envelopes) ? envelopes : []) {
    const envelope = raw || {};
    const planned = Number.isFinite(envelope.originalAmount) ? envelope.originalAmount : 0;
    const actual = Number.isFinite(envelope.balancedAmount) ? envelope.balancedAmount : 0;

    if (isIncomeEnvelope(envelope)) {
      income.planned += planned; income.actual += actual; income.count += 1;
      continue;
    }
    const label = envelope.type === "riseupGoal" ? SAVINGS_LABEL : (labels?.[envelope.id] || UNLABELED);
    bump(label, planned, actual);
  }

  const byLabelSorted = [...byLabel.values()].sort((a, b) => b.actual - a.actual || b.planned - a.planned || a.label.localeCompare(b.label, "he"));
  return { income, byLabel: byLabelSorted };
}

/** דה-דופ: אותו budgetDate + אותו cashflowHash כמו הצילום השמור = שום דבר לא השתנה. */
export function isSameAsLastSnapshot(prevSnapshot, response) {
  return !!prevSnapshot && !!response && prevSnapshot.budgetDate === response.budgetDate && prevSnapshot.cashflowHash === response.cashflowHash;
}

/**
 * בונה צילום מעודכן משמור מתוצאת סנכרון מוצלחת. הצילום שומר רק את envelopes הגולמיים -
 * הסיכום (summarizeEnvelopes) מחושב חי במסך מה-envelopes + התיוגים הנוכחיים, כדי שעריכת
 * תיוג תשפיע מיד על הפילוח בלי לדרוש סנכרון חוזר. changed=false כשה-cashflowHash זהה
 * לצילום הקודם לאותו חודש (no-op מתועד); syncedAt כן מתעדכן בכל מקרה כדי שהממשק ישקף מתי
 * בוצע ניסיון הסנכרון האחרון בפועל, גם כשהוא היה no-op.
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
