// לוגיקת GET /api/quote (Finnhub), מופרדת מה-route לצורכי בדיקה. שער אימות ראשון; המפתח לעולם לא מגיע ללקוח.
import { fail, reply, fetchWithTimeout, logCode } from "./api-utils.mjs";

const BASE = "https://finnhub.io/api/v1";
const TIMEOUT_MS = 8000;
const SYMBOL = /^[A-Z0-9][A-Z0-9.\-]{0,14}$/;

export function createQuoteHandler({ guard, getApiKey, fetcher = fetch }) {
  // המפתח נשלח בכותרת ולא ב-URL, כדי שלא יופיע בלוגים/שגיאות.
  const fh = (path, token) => fetchWithTimeout(fetcher, `${BASE}${path}`, { headers: { "X-Finnhub-Token": token }, cache: "no-store" }, TIMEOUT_MS);

  return async function GET(request) {
    try {
      const gate = await guard(request, { scope: "quote", limit: 40, windowMs: 60000 });
      if (!gate.ok) return gate.response;

      const symbol = (new URL(request.url).searchParams.get("symbol") || "").trim().toUpperCase();
      if (!symbol) return reply({ error: "לא צוין סימבול.", code: "bad_request" }, 400);
      if (!SYMBOL.test(symbol)) return reply({ error: "סימבול לא תקין.", code: "bad_request" }, 400);

      const token = getApiKey();
      if (!token) return reply({ error: "שירות נתוני המניות אינו מוגדר כרגע.", code: "unavailable" }, 503);

      let quoteRes, profileRes, metricRes;
      try {
        [quoteRes, profileRes, metricRes] = await Promise.all([
          fh(`/quote?symbol=${encodeURIComponent(symbol)}`, token),
          fh(`/stock/profile2?symbol=${encodeURIComponent(symbol)}`, token),
          fh(`/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all`, token),
        ]);
      } catch {
        logCode("quote", "upstream_unreachable");
        return reply({ error: "שגיאה בפנייה לשירות המידע. נסה שוב.", code: "upstream" }, 502);
      }

      if (quoteRes.status === 429) return reply({ error: "מכסת הקריאות לשירות המידע נגמרה. נסה שוב בעוד דקה.", code: "rate_limited" }, 429);
      if (!quoteRes.ok) { logCode("quote", `upstream_${quoteRes.status}`); return reply({ error: "שגיאה בפנייה לשירות המידע. נסה שוב.", code: "upstream" }, 502); }

      let quote;
      try { quote = await quoteRes.json(); } catch { return reply({ error: "תשובה לא תקינה משירות המידע.", code: "upstream" }, 502); }

      // סימבול לא קיים: Finnhub מחזיר מחיר 0 וסגירה קודמת 0
      if (!quote || (!quote.c && !quote.pc)) return reply({ error: "לא נמצא מידע לסימבול הזה. בדוק את האיות.", code: "not_found" }, 404);

      const profile = profileRes.ok ? await profileRes.json().catch(() => ({})) : {};
      const metricBody = metricRes.ok ? await metricRes.json().catch(() => ({})) : {};
      const m = metricBody?.metric || {};
      const num = v => (typeof v === "number" && isFinite(v) ? v : null);

      return reply({
        price: num(quote.c),
        sector: typeof profile?.finnhubIndustry === "string" ? profile.finnhubIndustry : null,
        peRatio: num(m.peTTM) ?? num(m.peBasicExclExtraTTM) ?? null,
        dividendYield: num(m.dividendYieldIndicatedAnnual) ?? num(m.currentDividendYieldTTM) ?? null,
        fetchedAt: new Date().toISOString(),
      });
    } catch {
      logCode("quote", "internal");
      return fail("unavailable", 500);
    }
  };
}
