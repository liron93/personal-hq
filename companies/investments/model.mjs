export const STORE_KEY = 'hq:investments:v1';
export const INIT = { holdings: [], watchlist: [], goals: [], concentrationLimit: 30 };
export const finite = v => typeof v === 'number' && Number.isFinite(v);
export function capacity(value, now = Date.now()) {
  const valid = value?.approved === true && finite(value.amount) && value.amount >= 0 && value.currency === 'ILS' && value.source && !value.missingItems?.length && Date.parse(value.calculatedAt) <= now && Date.parse(value.validUntil) > now;
  return valid ? { status: 'approved', amount: value.amount } : { status: 'blocked', amount: null };
}
export function fresh(quote, now = Date.now()) {
  const time = Date.parse(quote?.asOf);
  return finite(quote?.price) && quote.price > 0 && time <= now && now - time < 86400000;
}
export function condition(item, quote, now) {
  if (!fresh(quote, now) || quote.currency !== item.currency) return 'unknown';
  if (finite(item.exitAbove) && quote.price >= item.exitAbove) return 'exit';
  if (finite(item.entryBelow) && quote.price <= item.entryBelow) return 'entry';
  return 'waiting';
}
export function portfolio(holdings, quotes, now) {
  const groups = {}, sectors = {}; let missing = 0;
  for (const h of holdings) {
    const q = quotes[h.symbol];
    if (!fresh(q, now) || q.currency !== h.currency || !finite(h.units) || h.units < 0) { missing++; continue; }
    const value = h.units * q.price;
    groups[h.currency] = (groups[h.currency] || 0) + value;
    const key = `${h.currency}:${h.sector || 'לא סווג'}`;
    sectors[key] = (sectors[key] || 0) + value;
  }
  return { groups, missing, sectors };
}
export function summarize(d = INIT) {
  return { openTasks: (d.goals || []).length, flag: 'amber', latestUpdate: null, holdings: (d.holdings || []).length };
}
