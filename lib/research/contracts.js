// חוזי נתונים למערכת מחקר השקעות — provider-agnostic. אין כאן שום ספק ספציפי,
// אין קריאת רשת ואין מפתחות: כל ספק (Finnhub, אחר) יימומש בשרת ויחזיר את הצורות האלה.
// כל ולידטור מחזיר { ok, value, errors } ולעולם לא "משלים" ערך חסר בערך מומצא.

export const DATA_STATUS = Object.freeze({ OK: "ok", STALE: "stale", ERROR: "error", EMPTY: "empty" });

const isNum = v => typeof v === "number" && Number.isFinite(v);
const numOrNull = v => (isNum(v) ? v : null);
const isSymbol = v => typeof v === "string" && /^[A-Z0-9.^=\-]{1,15}$/.test(v);
const isIso = v => typeof v === "string" && !Number.isNaN(Date.parse(v));
const isHttps = v => { try { return new URL(v).protocol === "https:"; } catch { return false; } };
const result = (errors, value) => (errors.length ? { ok: false, value: null, errors } : { ok: true, value, errors: [] });

/** @typedef {{symbol:string, price:number, currency:string, change:number|null, changePercent:number|null}} Quote */
export function validateQuote(input) {
  const errors = [];
  if (!isSymbol(input?.symbol)) errors.push("symbol");
  if (!isNum(input?.price) || input.price < 0) errors.push("price");
  if (typeof input?.currency !== "string" || !/^[A-Z]{3}$/.test(input.currency)) errors.push("currency");
  return result(errors, { symbol: input?.symbol, price: input?.price, currency: input?.currency, change: numOrNull(input?.change), changePercent: numOrNull(input?.changePercent) });
}

/** @typedef {{t:string,o:number,h:number,l:number,c:number,v:number|null}} Candle */
export function validateCandles(input) {
  const errors = [];
  if (!isSymbol(input?.symbol)) errors.push("symbol");
  if (!["1d", "1w", "1mo"].includes(input?.interval)) errors.push("interval");
  const candles = Array.isArray(input?.candles) ? input.candles : null;
  if (!candles) errors.push("candles");
  let prev = -Infinity;
  (candles || []).forEach((c, i) => {
    const ok = isIso(c?.t) && [c?.o, c?.h, c?.l, c?.c].every(isNum) && c.h >= c.l && c.h >= Math.max(c.o, c.c) && c.l <= Math.min(c.o, c.c);
    const time = ok ? Date.parse(c.t) : NaN;
    if (!ok || time <= prev) errors.push(`candles[${i}]`);
    else prev = time;
  });
  return result(errors, { symbol: input?.symbol, interval: input?.interval, candles: (candles || []).map(c => ({ t: c.t, o: c.o, h: c.h, l: c.l, c: c.c, v: numOrNull(c.v) })) });
}

export function validateFundamentals(input) {
  const errors = [];
  if (!isSymbol(input?.symbol)) errors.push("symbol");
  const fields = ["peRatio", "dividendYield", "marketCap", "revenueGrowth", "netMargin"];
  for (const key of fields) if (input?.[key] != null && !isNum(input[key])) errors.push(key);
  const value = { symbol: input?.symbol, sector: typeof input?.sector === "string" ? input.sector : null, reportDate: isIso(input?.reportDate) ? input.reportDate : null };
  for (const key of fields) value[key] = numOrNull(input?.[key]);
  return result(errors, value);
}

export function validateNews(input) {
  const errors = [];
  if (!Array.isArray(input)) return result(["news"], null);
  input.forEach((item, i) => {
    if (typeof item?.headline !== "string" || !item.headline.trim() || !isIso(item?.publishedAt) || (item?.url != null && !isHttps(item.url))) errors.push(`news[${i}]`);
  });
  return result(errors, input.map(n => ({ id: String(n.id ?? n.url ?? n.headline), headline: n.headline, source: typeof n.source === "string" ? n.source : null, publishedAt: n.publishedAt, url: n.url ?? null })));
}

/** פוזיציה קיימת בתיק — קלט מהמשתמש/מהתיק שלו, לא נגזרת מספק. */
export function validatePosition(input) {
  const errors = [];
  if (!isSymbol(input?.symbol)) errors.push("symbol");
  if (!isNum(input?.units) || input.units < 0) errors.push("units");
  if (input?.avgCost != null && (!isNum(input.avgCost) || input.avgCost < 0)) errors.push("avgCost");
  if (typeof input?.currency !== "string" || !/^[A-Z]{3}$/.test(input.currency)) errors.push("currency");
  return result(errors, { symbol: input?.symbol, units: input?.units, avgCost: numOrNull(input?.avgCost), currency: input?.currency });
}

/** מזומן זמין להשקעה. */
export function validateCashAvailable(input) {
  const errors = [];
  if (!isNum(input?.amount)) errors.push("amount");
  if (typeof input?.currency !== "string" || !/^[A-Z]{3}$/.test(input.currency)) errors.push("currency");
  return result(errors, { amount: input?.amount, currency: input?.currency });
}

export const VALIDATORS = Object.freeze({ quote: validateQuote, candles: validateCandles, fundamentals: validateFundamentals, news: validateNews, position: validatePosition, cashAvailable: validateCashAvailable });
