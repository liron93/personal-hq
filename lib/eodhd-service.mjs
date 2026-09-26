import { createHash } from 'node:crypto';

// חמש קטגוריות שגיאה שהמוצר צריך להבחין ביניהן (מפרט Amit, Issue #7):
// מפתח נדחה, מסלול/הרשאה, מכסה/קצב, סימול לא תקין, רשת/timeout.
// 'not_configured' ו-'unknown' הן קטגוריות פנימיות נוספות (לא חלק מחמש הקטגוריות
// שהמשתמש רואה, אבל נדרשות כדי לתאר את שאר מצבי הכשל בלי לבדות קטגוריה שגויה).
export const ERROR_CATEGORIES = Object.freeze({
  KEY_REJECTED: 'key_rejected',
  PLAN_PERMISSION: 'plan_permission',
  QUOTA_RATE_LIMIT: 'quota_rate_limit',
  INVALID_SYMBOL: 'invalid_symbol',
  NETWORK_TIMEOUT: 'network_timeout',
  NOT_CONFIGURED: 'not_configured',
  UNKNOWN: 'unknown',
});

export class MarketError extends Error {
  constructor(message, status = 502, category = ERROR_CATEGORIES.UNKNOWN) {
    super(message); this.status = status; this.category = category;
  }
}
export function usSymbol(input) {
  const value = String(input || '').trim().toUpperCase().replace(/\.US$/, '');
  if (!/^[A-Z][A-Z0-9-]{0,14}$/.test(value)) throw new MarketError('יש להזין סימול אמריקאי תקין, למשל AAPL או BRK-B.', 400, ERROR_CATEGORIES.INVALID_SYMBOL);
  return `${value}.US`;
}
// ממפה קוד תשובה שהתקבל בפועל מ-EODHD לאחת מחמש הקטגוריות המוצריות.
// פונקציה טהורה ונפרדת כדי שאפשר לבדוק את המיפוי ישירות, בלי להזריק fetcher מזויף.
export function categorizeUpstreamStatus(status) {
  if (status === 401) return ERROR_CATEGORIES.KEY_REJECTED;
  if (status === 402 || status === 403) return ERROR_CATEGORIES.PLAN_PERMISSION;
  if (status === 429) return ERROR_CATEGORIES.QUOTA_RATE_LIMIT;
  if (status === 404) return ERROR_CATEGORIES.INVALID_SYMBOL;
  return ERROR_CATEGORIES.UNKNOWN;
}
export function normalizeBars(data, from, to) {
  if (!Array.isArray(data) || data.length > 400) throw new MarketError('ספק הנתונים החזיר מבנה לא תקין.', 502, ERROR_CATEGORIES.UNKNOWN);
  if (!data.length) throw new MarketError('לא נמצאו נתונים בטווח השנה האחרונה עבור הסימול הזה.', 404, ERROR_CATEGORIES.INVALID_SYMBOL);
  const seen = new Set();
  const bars = data.map(row => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row?.date || '') || !Number.isFinite(Date.parse(row.date)) || new Date(row.date).toISOString().slice(0,10) !== row.date || row.date < from || row.date > to || seen.has(row.date)) throw new MarketError('התקבלו תאריכים לא תקינים מהספק.', 502, ERROR_CATEGORIES.UNKNOWN);
    seen.add(row.date);
    if (!['open','high','low','close'].every(k => Number.isFinite(row[k]) && row[k] > 0) || !Number.isFinite(row.volume) || row.volume < 0 || row.high < Math.max(row.open,row.close,row.low) || row.low > Math.min(row.open,row.close)) throw new MarketError('התקבלו מחירים לא תקינים מהספק.', 502, ERROR_CATEGORIES.UNKNOWN);
    return { date:row.date, open:row.open, high:row.high, low:row.low, close:row.close, adjustedClose:Number.isFinite(row.adjusted_close)&&row.adjusted_close>0?row.adjusted_close:null, volume:row.volume };
  });
  return bars.sort((a,b)=>a.date.localeCompare(b.date));
}
// Best-effort process-local protection. Provider quota remains authoritative across
// serverless instances/restarts. This is deliberately NOT advertised as a global ledger.
export function createEodhdService({ fetcher = fetch, now = () => Date.now() } = {}) {
  const cache = new Map(), pending = new Map();
  let day = '';
  const calls = new Map();
  return async function history(input, token) {
    const symbol = usSymbol(input);
    if (!token || token.toLowerCase() === 'demo') throw new MarketError('טרם נשמר מפתח EODHD אישי. יש להזין מפתח בחיבור נתוני השוק.', 503, ERROR_CATEGORIES.NOT_CONFIGURED);
    const to = new Date(now()).toISOString().slice(0,10);
    if(day!==to){day=to;calls.clear();cache.clear();}
    const identity=createHash('sha256').update(token).digest('hex'), cacheKey=`${identity}:${to}:${symbol}`;
    if(cache.has(cacheKey))return {...cache.get(cacheKey),cached:true};
    if(pending.has(cacheKey))return pending.get(cacheKey);
    if((calls.get(identity)||0)>=15)throw new MarketError('הגענו למגבלת ההגנה של השרת להיום. אין ניסיון חוזר אוטומטי.',429, ERROR_CATEGORIES.QUOTA_RATE_LIMIT);
    calls.set(identity,(calls.get(identity)||0)+1);
    const task=(async()=>{
      // 364 days avoids crossing the free plan's one-year boundary on leap years.
      const from = new Date(now()-364*86400000).toISOString().slice(0,10);
      const url=new URL(`https://eodhd.com/api/eod/${symbol}`);
      url.search=new URLSearchParams({api_token:token,fmt:'json',period:'d',order:'a',from,to}).toString();
      let response;
      try { response=await fetcher(url,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)}); }
      catch {throw new MarketError('לא ניתן להגיע לספק הנתונים כרגע (רשת/זמן תגובה). לא בוצע ניסיון חוזר אוטומטי.', 502, ERROR_CATEGORIES.NETWORK_TIMEOUT);}
      if(response.status===401)throw new MarketError('הספק דחה את המפתח שהזנת. יש להחליף אותו למפתח תקין מחשבון ה-EODHD שלך בטופס למעלה.',503,categorizeUpstreamStatus(401));
      if(response.status===402||response.status===403)throw new MarketError('המסלול בחשבון ה-EODHD שלך אינו כולל את הנתונים המבוקשים.',403,categorizeUpstreamStatus(response.status));
      if(response.status===429)throw new MarketError('מכסת הקריאות היומית של EODHD מוצתה. יש לבדוק את המכסה בחשבון הספק ולנסות שוב מחר.',429,categorizeUpstreamStatus(429));
      if(response.status===404)throw new MarketError('הסימול לא נמצא אצל EODHD. בדוק את האיות.',404,categorizeUpstreamStatus(404));
      if(!response.ok)throw new MarketError('שגיאה בשירות הנתונים.', 502, categorizeUpstreamStatus(response.status));
      let body;try{body=await response.json();}catch{throw new MarketError('תגובה לא תקינה משירות הנתונים.', 502, ERROR_CATEGORIES.UNKNOWN);}
      const bars=normalizeBars(body,from,to);
      const result={symbol,provider:'EODHD',kind:'end-of-day',from,to,asOf:bars.at(-1).date,fetchedAt:new Date(now()).toISOString(),bars,cached:false};
      cache.set(cacheKey,result);return result;
    })();
    pending.set(cacheKey,task);
    try{return await task;}finally{pending.delete(cacheKey);}
  };
}
