// קורא תמונת קבלה עם Gemini (אותו מפתח GEMINI_API_KEY שכבר משמש את JARVIS - ראה
// lib/jarvis-handler.mjs) ומחזיר רשימת פריטים מובנית. fetcher/sleep מוזרקים כדי שאפשר
// לבדוק בלי רשת אמיתית, בדיוק כמו lib/riseup-service.mjs ו-lib/jarvis-handler.mjs.
import { fetchWithTimeout } from "./api-utils.mjs";

const MODEL = "gemini-flash-latest"; // אותו מודל בדיוק כמו JARVIS - תומך גם בקלט תמונה
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const TIMEOUT_MS = 20000; // ניתוח תמונה איטי יותר משיחת טקסט רגילה של JARVIS (9s) - קבלה יכולה לכלול הרבה שורות
const MAX_ITEMS = 80;
const MAX_NAME_LEN = 160;

const PROMPT = `זו תמונה של קבלת קניות (סופרמרקט/חנות). חלץ ממנה בדיוק את מה שכתוב - אל תמציא או תנחש פריט שלא רשום בבירור.

חלץ:
- store: שם החנות אם מופיע בבירור, אחרת null.
- date: תאריך הקנייה בפורמט YYYY-MM-DD אם מופיע בבירור, אחרת null.
- items: רשימת הפריטים שנרכשו בפועל - שם ומחיר (מספר בלבד, ללא סימן מטבע) לכל פריט, וכמות אם מצוינת בבירור (אחרת null). התעלם משורות סיכום/הנחה/מע"מ/עודף - רק פריטים בודדים שנרכשו.

אם התמונה לא קריאה, לא נראית כמו קבלה, או שאין בה אף פריט ברור - החזר items: [].

החזר אך ורק JSON תקין בצורה: {"store": "..."|null, "date": "YYYY-MM-DD"|null, "items": [{"name": "...", "price": number, "qty": number|null}]}`;

const sleepDefault = ms => new Promise(resolve => setTimeout(resolve, ms));

/** כמו callGemini ב-lib/jarvis-handler.mjs - ניסיון חוזר קצר אחד על 503 (עומס זמני אצל Gemini). */
async function callGemini({ fetcher, sleep }, apiKey, requestBody, attempt = 0) {
  let res;
  try {
    res = await fetchWithTimeout(fetcher, GEMINI_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(requestBody),
      cache: "no-store",
    }, TIMEOUT_MS);
  } catch (e) {
    if (attempt < 1) { await sleep(500); return callGemini({ fetcher, sleep }, apiKey, requestBody, attempt + 1); }
    throw e;
  }
  if (res.status === 503 && attempt < 1) { await sleep(700); return callGemini({ fetcher, sleep }, apiKey, requestBody, attempt + 1); }
  return res;
}

export class ReceiptScanError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function sanitizeItems(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_ITEMS).map(item => {
    if (!item || typeof item !== "object") return null;
    const name = String(item.name ?? "").trim().slice(0, MAX_NAME_LEN);
    const price = Number(item.price);
    if (!name || !Number.isFinite(price) || price <= 0) return null;
    const qty = Number(item.qty);
    return { name, price, qty: Number.isFinite(qty) && qty > 0 ? qty : null };
  }).filter(Boolean);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * שירות סריקת קבלה: תמונה (base64, בלי ה-prefix של data URL) + mimeType -> {store, date, items}.
 * אף פעם לא זורק על תוכן "חלש" (קבלה לא ברורה) - מחזיר items:[] ותן ל-UI להציג "לא זוהו פריטים,
 * מלא ידנית". זורק רק על כשל אמיתי (רשת/timeout/תשובה לא-JSON/שגיאת שרת).
 */
export function createReceiptScanService({ fetcher = fetch, sleep = sleepDefault } = {}) {
  return async function scanReceipt(apiKey, { imageBase64, mimeType }) {
    if (!apiKey) throw new ReceiptScanError("not_configured", "סריקת קבלות עדיין לא מוגדרת בשרת.");
    if (!imageBase64 || typeof imageBase64 !== "string") throw new ReceiptScanError("bad_request", "לא התקבלה תמונה.");

    let res;
    try {
      res = await callGemini({ fetcher, sleep }, apiKey, {
        contents: [{
          role: "user",
          parts: [
            { text: PROMPT },
            { inlineData: { mimeType: mimeType || "image/jpeg", data: imageBase64 } },
          ],
        }],
        generationConfig: { maxOutputTokens: 2000, responseMimeType: "application/json" },
      });
    } catch {
      throw new ReceiptScanError("network_error", "לא ניתן להתחבר לשירות הניתוח כרגע. נסו שוב בעוד רגע.");
    }

    if (res.status === 429) throw new ReceiptScanError("rate_limited", "יותר מדי בקשות ניתוח תמונה. נסו שוב בעוד רגע.");
    if (!res.ok) throw new ReceiptScanError("upstream_error", "שגיאה בניתוח הקבלה. נסו שוב.");

    let out;
    try {
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      out = JSON.parse(text);
    } catch {
      throw new ReceiptScanError("upstream_error", "תשובה לא תקינה משירות הניתוח.");
    }
    if (!out || typeof out !== "object") throw new ReceiptScanError("upstream_error", "תשובה לא תקינה משירות הניתוח.");

    return {
      store: typeof out.store === "string" && out.store.trim() ? out.store.trim().slice(0, 160) : null,
      date: typeof out.date === "string" && DATE_RE.test(out.date) ? out.date : null,
      items: sanitizeItems(out.items),
    };
  };
}
