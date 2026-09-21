export class MarketError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}
export function usSymbol(input) {
  const value = String(input || '').trim().toUpperCase().replace(/\.US$/, '');
  if (!/^[A-Z][A-Z0-9-]{0,14}$/.test(value)) throw new MarketError('יש להזין סימול אמריקאי תקין, למשל AAPL או BRK-B.', 400);
  return `${value}.US`;
}
export function normalizeBars(data, from, to) {
  if (!Array.isArray(data) || data.length > 400) throw new MarketError('ספק הנתונים החזיר מבנה לא תקין.');
  if (!data.length) throw new MarketError('לא נמצאו נתונים בטווח השנה האחרונה.', 404);
  const seen = new Set();
  const bars = data.map(row => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row?.date || '') || !Number.isFinite(Date.parse(row.date)) || new Date(row.date).toISOString().slice(0,10) !== row.date || row.date < from || row.date > to || seen.has(row.date)) throw new MarketError('התקבלו תאריכים לא תקינים מהספק.');
    seen.add(row.date);
    if (!['open','high','low','close'].every(k => Number.isFinite(row[k]) && row[k] > 0) || !Number.isFinite(row.volume) || row.volume < 0 || row.high < Math.max(row.open,row.close,row.low) || row.low > Math.min(row.open,row.close)) throw new MarketError('התקבלו מחירים לא תקינים מהספק.');
    return { date:row.date, open:row.open, high:row.high, low:row.low, close:row.close, adjustedClose:Number.isFinite(row.adjusted_close)&&row.adjusted_close>0?row.adjusted_close:null, volume:row.volume };
  });
  return bars.sort((a,b)=>a.date.localeCompare(b.date));
}
// Best-effort process-local protection. Provider quota remains authoritative across
// serverless instances/restarts. This is deliberately NOT advertised as a global ledger.
export function createEodhdService({ fetcher = fetch, now = () => Date.now() } = {}) {
  const cache = new Map(), pending = new Map();
  let day = '', calls = 0;
  return async function history(input, token) {
    const symbol = usSymbol(input);
    if (!token || token.toLowerCase() === 'demo') throw new MarketError('מפתח EODHD אישי עדיין לא הוגדר בשרת.',503);
    const to = new Date(now()).toISOString().slice(0,10);
    if(day!==to){day=to;calls=0;cache.clear();}
    if(cache.has(symbol))return {...cache.get(symbol),cached:true};
    if(pending.has(symbol))return pending.get(symbol);
    if(calls>=15)throw new MarketError('הגענו למגבלת ההגנה של השרת להיום. אין ניסיון חוזר אוטומטי.',429);
    calls++;
    const task=(async()=>{
      // 364 days avoids crossing the free plan's one-year boundary on leap years.
      const from = new Date(now()-364*86400000).toISOString().slice(0,10);
      const url=new URL(`https://eodhd.com/api/eod/${symbol}`);
      url.search=new URLSearchParams({api_token:token,fmt:'json',period:'d',order:'a',from,to}).toString();
      let response;
      try { response=await fetcher(url,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)}); }
      catch {throw new MarketError('לא ניתן להגיע לספק הנתונים כרגע. לא בוצע ניסיון חוזר אוטומטי.');}
      if(response.status===401)throw new MarketError('הספק דחה את המפתח. יש לבדוק את ההגדרה בשרת.',503);
      if(response.status===402||response.status===403)throw new MarketError('המסלול בחשבון אינו מאפשר את הנתונים המבוקשים.',403);
      if(response.status===429)throw new MarketError('מכסת EODHD מוצתה. יש לבדוק את המכסה בחשבון הספק.',429);
      if(response.status===404)throw new MarketError('הסימול לא נמצא אצל EODHD.',404);
      if(!response.ok)throw new MarketError('שגיאה בשירות הנתונים.');
      let body;try{body=await response.json();}catch{throw new MarketError('תגובה לא תקינה משירות הנתונים.');}
      const bars=normalizeBars(body,from,to);
      const result={symbol,provider:'EODHD',kind:'end-of-day',from,to,asOf:bars.at(-1).date,fetchedAt:new Date(now()).toISOString(),bars,cached:false};
      cache.set(symbol,result);return result;
    })();
    pending.set(symbol,task);
    try{return await task;}finally{pending.delete(symbol);}
  };
}
