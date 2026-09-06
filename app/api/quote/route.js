// Route Handler בצד שרת: מקבל ?symbol=AAPL, קורא ל-Finnhub עם המפתח הסודי,
// ומחזיר לדפדפן רק JSON נקי. המפתח (FINNHUB_API_KEY) לעולם לא מגיע ללקוח.
export const dynamic = "force-dynamic";

const BASE = "https://finnhub.io/api/v1";

function err(message, status) {
  return Response.json({ error: message }, { status });
}

async function fh(path, token) {
  const res = await fetch(`${BASE}${path}&token=${token}`, { cache: "no-store" });
  return res;
}

export async function GET(request) {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) return err("מפתח Finnhub לא מוגדר בשרת.", 500);

  const symbol = (new URL(request.url).searchParams.get("symbol") || "").trim().toUpperCase();
  if (!symbol) return err("לא צוין סימבול.", 400);

  let quoteRes, profileRes, metricRes;
  try {
    [quoteRes, profileRes, metricRes] = await Promise.all([
      fh(`/quote?symbol=${encodeURIComponent(symbol)}`, token),
      fh(`/stock/profile2?symbol=${encodeURIComponent(symbol)}`, token),
      fh(`/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all`, token),
    ]);
  } catch {
    return err("שגיאה בפנייה לשירות המידע. נסה שוב.", 502);
  }

  if (quoteRes.status === 429) return err("מכסת הקריאות לשירות המידע נגמרה. נסה שוב בעוד דקה.", 429);
  if (!quoteRes.ok) return err("שגיאה בפנייה לשירות המידע. נסה שוב.", 502);

  let quote;
  try {
    quote = await quoteRes.json();
  } catch {
    return err("תשובה לא תקינה משירות המידע.", 502);
  }

  // סימבול לא קיים: Finnhub מחזיר מחיר 0 וסגירה קודמת 0
  if (!quote || (!quote.c && !quote.pc)) {
    return err("לא נמצא מידע לסימבול הזה. בדוק את האיות.", 404);
  }

  const profile = profileRes.ok ? await profileRes.json().catch(() => ({})) : {};
  const metricBody = metricRes.ok ? await metricRes.json().catch(() => ({})) : {};
  const m = metricBody?.metric || {};

  const num = v => (typeof v === "number" && isFinite(v) ? v : null);

  return Response.json({
    price: num(quote.c),
    sector: profile?.finnhubIndustry || null,
    peRatio: num(m.peTTM) ?? num(m.peBasicExclExtraTTM) ?? null,
    dividendYield: num(m.dividendYieldIndicatedAnnual) ?? num(m.currentDividendYieldTTM) ?? null,
    fetchedAt: new Date().toISOString(),
  });
}
