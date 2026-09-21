// הגבלת קצב פשוטה לפי משתמש (חלון הזזה, בזיכרון). מגבלה ידועה: בסביבת serverless כל instance סופר לעצמו,
// אז זו הגנה סבירה מפני לחיצות חוזרות/לולאות, לא הגנה מפני תוקף מכוון (לזה נדרש מונה משותף, למשל ב-DB).
export function createRateLimiter({ max = 10, windowMs = 60_000, now = () => Date.now() } = {}) {
  const hits = new Map();
  return {
    check(key) {
      const t = now();
      const recent = (hits.get(key) || []).filter(x => t - x < windowMs);
      if (recent.length >= max) { hits.set(key, recent); return { ok: false, retryAfterSec: Math.max(1, Math.ceil((windowMs - (t - recent[0])) / 1000)) }; }
      recent.push(t); hits.set(key, recent);
      if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(x => t - x < windowMs)) hits.delete(k);
      return { ok: true };
    },
  };
}
