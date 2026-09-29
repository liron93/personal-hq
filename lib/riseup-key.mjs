// קורא את RISEUP_PAT בצד שרת בלבד (לעולם לא NEXT_PUBLIC_).
//
// בכוונה לא מבנה של lib/market-key.mjs: market-key.mjs מצפין ושומר בעוגייה פר-משתמש מפתח
// שכל משתמש מזין בעצמו בטופס (EODHD). RISEUP_PAT הוא ההפך - סוד שרת יחיד שאמית מגדיר
// ב-Vercel, בלי קלט מהמשתמש ובלי אחסון בדפדפן - בדיוק כמו FINNHUB_API_KEY שנקרא ישירות
// ב-lib/quote-handler.mjs דרך getApiKey(). לכן זהו מודול קריאה פשוט, לא מודול הצפנה.
//
// "לא מוגדר" (המשתנה חסר/ריק) הוא מצב תקין ונפוץ - ה-route חייב להחזיר עליו תשובה ברורה
// (503, code: not_configured), לא לזרוק/502.
export function getRiseupKey(env = process.env) {
  const value = typeof env.RISEUP_PAT === "string" ? env.RISEUP_PAT.trim() : "";
  return value ? value : null;
}

export function isRiseupConfigured(env = process.env) {
  return getRiseupKey(env) !== null;
}
