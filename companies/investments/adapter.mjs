import { finite } from './model.mjs';
// The injected transport must be an authenticated, same-origin, read-only server proxy.
// No provider credentials or order endpoints belong in this adapter.
export function createAdapter(transport) {
  return {
    async snapshot({ signal } = {}) {
      if (!transport) return { status: 'disconnected', holdings: [], quotes: {}, asOf: null };
      const result = await transport({ signal });
      if (!result || !Array.isArray(result.holdings) || !Array.isArray(result.quotes)) throw new Error('מבנה תשובה לא תקין');
      if (result.holdings.some(h => !h.symbol || !finite(h.units) || h.units < 0 || !/^[A-Z]{3}$/.test(h.currency))) throw new Error('נתוני תיק לא תקינים');
      const quotes = {};
      for (const q of result.quotes) {
        if (!q.symbol || !finite(q.price) || q.price <= 0 || !/^[A-Z]{3}$/.test(q.currency) || !Number.isFinite(Date.parse(q.asOf))) throw new Error('נתוני מחיר לא תקינים');
        if (quotes[q.symbol]) throw new Error('סימול כפול: נדרש מזהה בורסה ייחודי');
        quotes[q.symbol] = q;
      }
      return { status: 'connected', holdings: result.holdings, quotes, asOf: result.asOf || null };
    },
  };
}
export const disconnectedAdapter = createAdapter();
