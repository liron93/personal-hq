// לוגיקה טהורה (בלי React, בלי fetch) לתצוגת חיבור נתוני השוק (EODHD):
// בניית "צילום מצב" מתוצאת שליפה מוצלחת, סימון "מיושן" אחרי כשל, ומצב-מצב
// (state machine) של תגית הסטטוס. נבדק ישירות ב-tests/market-snapshot.test.mjs.
//
// חשוב: אין כאן שום לוגיקת קנייה/מכירה/המלצה/ציון ביטחון — רק תיאור נתונים.

// מפתח אחסון נפרד מ-model.js של קסף: הצילום הוא נתון אישי פר-משתמש (lib/store.js
// מפריד לפי user_id בכל מקרה), אבל שמירתו בנפרד מ-STORE_KEY של קסף מונעת ערבוב
// בין "נתוני החברה המשותפים" ל"מה אני אישית ראיתי לאחרונה מהספק".
export const STORE_KEY = 'hq:kesef:market-snapshot:v1';

const round2 = n => (Number.isFinite(n) ? Math.round(n * 100) / 100 : null);

// history = תוצאת POST מוצלחת מ-/api/market/eodhd: {symbol, provider, asOf, fetchedAt, bars, ...}
// bars ממוינים מהישן לחדש (ראו normalizeBars ב-lib/eodhd-service.mjs).
export function buildSnapshot(history) {
  const bars = Array.isArray(history?.bars) ? history.bars : [];
  const last = bars.length ? bars[bars.length - 1] : null;
  const prev = bars.length > 1 ? bars[bars.length - 2] : null;
  const changeAbs = last && prev ? round2(last.close - prev.close) : null;
  const changePct = last && prev && prev.close ? round2(((last.close - prev.close) / prev.close) * 100) : null;
  const fetchedAt = history?.fetchedAt || new Date().toISOString();
  return {
    symbol: history?.symbol ?? null,
    provider: 'EODHD',
    mode: 'end-of-day',
    asOf: last?.date ?? null,
    fetchedAt,
    verifiedAt: fetchedAt, // "מאומת" = הרגע שבו הצלחנו בפועל לקרוא נתון אמיתי מהספק
    close: last?.close ?? null,
    previousClose: prev?.close ?? null,
    changeAbs,
    changePct,
    adjustedClose: last?.adjustedClose ?? null,
    volume: last?.volume ?? null,
    // סדרה מצומצמת (תאריך+סגירה בלבד) לגרף התיאורי; לא כל שדות ה-OHLCV, כדי לא
    // לנפח את הרשומה הנשמרת פר-משתמש.
    bars: bars.map(b => ({ date: b.date, close: b.close })),
    stale: false,
    staleReason: null,
    staleCategory: null,
    staleSince: null,
  };
}

// ניסיון רענון שנכשל: משאירים את הצילום הקודם על המסך (שלא ייעלם), אבל מסמנים
// אותו כמיושן עם זמן וסיבת הכשל. verifiedAt לא משתנה — הוא עדיין מתאר את הפעם
// האחרונה שבאמת אומת מול הספק.
export function markStale(snapshot, { message, category, at } = {}) {
  if (!snapshot) return null;
  return { ...snapshot, stale: true, staleReason: message || null, staleCategory: category || null, staleSince: at || new Date().toISOString() };
}

// הזנת מפתח חדשה היא פעולה מתקנת מפורשת של המשתמש: מנקים את דגל "מיושן" כדי
// שהסטטוס יחזור להיות "נשמר · טרם אומת" ולא ימשיך להראות "נדרש חידוש" בגלל
// כשל שקרה מול מפתח קודם. לא נוגעים בנתוני הצילום עצמם (עדיין הנתון האחרון שידוע).
export function clearStale(snapshot) {
  if (!snapshot) return snapshot;
  return { ...snapshot, stale: false, staleReason: null, staleCategory: null, staleSince: null };
}

export const STATUS = Object.freeze({
  NOT_CONFIGURED: 'not_configured',
  SAVED_UNVERIFIED: 'saved_unverified',
  VERIFIED: 'verified',
  NEEDS_RENEWAL: 'needs_renewal',
});

// מעולם לא "מחובר" רק כי יש עוגייה/דגל מקומי: הסטטוס נגזר מ(א) האם מפתח נשמר,
// ו(ב) האם יש צילום מצב שנבנה מתוך שליפה אמיתית שהצליחה (verifiedAt), ו(ג) האם
// ניסיון הרענון האחרון נכשל (stale) — לא מ"האם הדפדפן חושב שהוא מחובר".
export function connectionStatus({ configured, snapshot }) {
  if (snapshot?.stale) return STATUS.NEEDS_RENEWAL;
  if (!configured) return STATUS.NOT_CONFIGURED;
  if (!snapshot?.verifiedAt) return STATUS.SAVED_UNVERIFIED;
  return STATUS.VERIFIED;
}

export const STATUS_LABEL = Object.freeze({
  [STATUS.NOT_CONFIGURED]: 'החיבור אינו מוגדר',
  [STATUS.SAVED_UNVERIFIED]: 'המפתח נשמר · טרם אומת',
  [STATUS.VERIFIED]: 'מאומת',
  [STATUS.NEEDS_RENEWAL]: 'נדרש חידוש',
});

// תוויות עבריות קצרות לחמש קטגוריות השגיאה (companies/kesef/MarketConnection.jsx
// מציג גם את הודעת lib/eodhd-service.mjs עצמה; התווית כאן היא כותרת-על עקבית).
export const ERROR_CATEGORY_LABEL = Object.freeze({
  key_rejected: 'המפתח נדחה',
  plan_permission: 'מסלול/הרשאה בחשבון EODHD',
  quota_rate_limit: 'מכסה/קצב בקשות',
  invalid_symbol: 'סימול לא תקין',
  network_timeout: 'רשת/זמן תגובה',
  not_configured: 'המפתח טרם הוגדר',
  unknown: 'שגיאה לא צפויה',
});

export const errorCategoryLabel = category => ERROR_CATEGORY_LABEL[category] || ERROR_CATEGORY_LABEL.unknown;
