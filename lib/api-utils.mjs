// כלים משותפים ל-API routes: תשובות JSON בטוחות, קריאת גוף עם תקרת גודל, הגבלת קצב בזיכרון וקריאה עם timeout.
// שום פונקציה כאן לא מחזירה או רושמת פרטים פנימיים - רק קודים קצרים והודעות עבריות גנריות.

export const NO_STORE = { "Cache-Control": "private, no-store" };

export function reply(data, status = 200, extraHeaders = {}) {
  return Response.json(data, { status, headers: { ...NO_STORE, ...extraHeaders } });
}

export const MESSAGES = {
  unauthorized: "נדרשת התחברות.",
  forbidden: "אין הרשאה לפעולה הזו.",
  bad_request: "בקשה לא תקינה.",
  too_large: "הבקשה גדולה מדי.",
  rate_limited: "יותר מדי בקשות. נסה שוב בעוד רגע.",
  unavailable: "השירות אינו זמין כרגע.",
};

export function fail(code, status, extraHeaders) {
  return reply({ error: MESSAGES[code] || MESSAGES.unavailable, code }, status, extraHeaders);
}

/**
 * קורא גוף JSON עם תקרת בתים. מחזיר {ok:true,value} או {ok:false,response}.
 * בודק Content-Length מראש וגם סופר בתים בזמן הקריאה (למקרה שאין כותרת).
 */
export async function readJsonBody(request, maxBytes) {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, response: fail("too_large", 413) };
  let text = "";
  try {
    if (request.body && typeof request.body.getReader === "function") {
      const reader = request.body.getReader();
      const decoder = new TextDecoder();
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          try { await reader.cancel(); } catch {}
          return { ok: false, response: fail("too_large", 413) };
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } else {
      text = await request.text();
      if (new TextEncoder().encode(text).byteLength > maxBytes) return { ok: false, response: fail("too_large", 413) };
    }
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, response: fail("bad_request", 400) };
  }
}

/** הגבלת קצב לפי מפתח בחלון קבוע. בזיכרון של התהליך בלבד (ראה docs/api-auth.md לגבי serverless). */
export function createRateLimiter({ now = Date.now, maxKeys = 2000 } = {}) {
  const hits = new Map();
  return function check(key, limit, windowMs) {
    const t = now();
    if (hits.size > maxKeys) for (const [k, v] of hits) if (v.reset <= t) hits.delete(k);
    if (hits.size > maxKeys) hits.clear();
    let entry = hits.get(key);
    if (!entry || entry.reset <= t) { entry = { count: 0, reset: t + windowMs }; hits.set(key, entry); }
    entry.count += 1;
    if (entry.count > limit) return { ok: false, retryAfter: Math.max(1, Math.ceil((entry.reset - t) / 1000)) };
    return { ok: true };
  };
}

/** fetch עם timeout; ה-fetcher מוזרק לבדיקות. */
export function fetchWithTimeout(fetcher, url, init = {}, timeoutMs = 9000) {
  return fetcher(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

/** רישום בטוח: רק סקופ וקוד קצר, בלי הודעות/גופים/מזהים. */
export function logCode(scope, code) {
  console.warn(`[api] ${String(scope).slice(0, 40)} ${String(code).slice(0, 40)}`);
}
