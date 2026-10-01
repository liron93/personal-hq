// קורא תמונת קבלה עם Gemini (אותו מפתח GEMINI_API_KEY שכבר משמש את JARVIS - ראה
// lib/jarvis-handler.mjs) ומחזיר רשימת פריטים מובנית. fetcher/sleep מוזרקים כדי שאפשר
// לבדוק בלי רשת אמיתית, בדיוק כמו lib/riseup-service.mjs ו-lib/jarvis-handler.mjs.
import { fetchWithTimeout } from "./api-utils.mjs";

// מודל יציב ונפרד מ-JARVIS (שמשתמש ב-gemini-flash-latest) בכוונה: "latest" מצביע תמיד על
// המודל הכי חדש והכי מבוקש של גוגל, ששני ה-503 וה-429 שקיבלנו מקורם בו (עומס/מכסה על
// הגרסה החדשה ביותר, משותף בין JARVIS וסריקת הקבלות על אותו מפתח). gemini-3.5-flash-lite
// הוא מודל יציב, מולטימודאלי (תמונה+טקסט), מומלץ ע"י גוגל לפרויקטים חדשים, עם מכסת
// חינמית נדיבה בהרבה - ובעיקר: מאגר מכסה נפרד לגמרי מ-JARVIS, בלי מפתח API חדש.
const MODEL = "gemini-3.5-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const TIMEOUT_MS = 20000; // ניתוח תמונה איטי יותר משיחת טקסט רגילה של JARVIS (9s) - קבלה יכולה לכלול הרבה שורות
const MAX_ITEMS = 80;
const MAX_NAME_LEN = 160;
const MAX_PROMO_LEN = 120;

const PROMPT = `זו תמונה של קבלת קניות (סופרמרקט/חנות). חלץ ממנה בדיוק את מה שכתוב - אל תמציא או תנחש פריט שלא רשום בבירור.

חלץ:
- store: שם החנות אם מופיע בבירור, אחרת null.
- date: תאריך הקנייה בפורמט YYYY-MM-DD אם מופיע בבירור, אחרת null.
- items: רשימת הפריטים שנרכשו בפועל, אחד לכל שורה בקבלה:
  - name: שם הפריט כפי שמופיע בקבלה (כולל מותג אם כתוב, בדיוק כמו שמודפס).
  - price: הסכום הכולל ששולם בפועל על השורה הזו - לא מחיר ליחידה בודדת! אם נרכשו כמה יחידות
    באותו מחיר (כולל במבצע "2 ב-X"), זה הסכום הכולל לכל היחידות יחד. מספר בלבד, ללא סימן מטבע.
  - qty: הכמות שנרכשה בשורה הזו אם מצוינת בבירור (למשל "2 יח'"), אחרת null.
  - promo: אם כתוב בבירור על הקבלה שהייתה הנחה/מבצע על השורה הזו (למשל "2 ב-20", "מועדון
    -10%", "מבצע") - תיאור קצר שלו בדיוק כפי שכתוב בקבלה. אחרת null. אל תמציא מבצע שלא כתוב בפירוש.
  התעלם משורות סיכום/הנחה כללית על כל הקבלה/מע"מ/עודף - רק פריטים בודדים שנרכשו.

אם התמונה לא קריאה, לא נראית כמו קבלה, או שאין בה אף פריט ברור - החזר items: [].

החזר אך ורק JSON תקין בצורה: {"store": "..."|null, "date": "YYYY-MM-DD"|null, "items": [{"name": "...", "price": number, "qty": number|null, "promo": string|null}]}`;

const sleepDefault = ms => new Promise(resolve => setTimeout(resolve, ms));

// עומס גבוה זמני אצל Gemini (503 "high demand") מתגלה גם ב-JARVIS באותו זמן בדיוק
// (log: "jarvis upstream_503") - זו תקלה אצל גוגל, לא בקוד שלנו. בניגוד ל-jarvis-handler.mjs
// שמוותר אחרי ניסיון חוזר אחד, כאן יש לנו יותר זמן (ניתוח תמונה כבר איטי מטבעו) אז שווה
// לנסות קצת יותר קשיח עם המתנה גדלה לפני שמוותרים בפני המשתמש.
const OVERLOAD_BACKOFF_MS = [700, 1500]; // 2 ניסיונות חוזרים על 503 (סה"כ 3 ניסיונות), ~2.2s המתנה נוספת

/** כמו callGemini ב-lib/jarvis-handler.mjs, עם עמידות חזקה יותר ל-503 (ראו הערה למעלה). */
async function callGemini({ fetcher, sleep }, apiKey, requestBody, attempt = 0, overloadAttempt = 0) {
  let res;
  try {
    res = await fetchWithTimeout(fetcher, GEMINI_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(requestBody),
      cache: "no-store",
    }, TIMEOUT_MS);
  } catch (e) {
    if (attempt < 1) { await sleep(500); return callGemini({ fetcher, sleep }, apiKey, requestBody, attempt + 1, overloadAttempt); }
    throw e;
  }
  if (res.status === 503 && overloadAttempt < OVERLOAD_BACKOFF_MS.length) {
    await sleep(OVERLOAD_BACKOFF_MS[overloadAttempt]);
    return callGemini({ fetcher, sleep }, apiKey, requestBody, attempt, overloadAttempt + 1);
  }
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
    const promo = typeof item.promo === "string" && item.promo.trim() ? item.promo.trim().slice(0, MAX_PROMO_LEN) : null;
    return { name, price, qty: Number.isFinite(qty) && qty > 0 ? qty : null, promo };
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
    if (!res.ok) {
      // אבחון בטוח: status + error.message/status מ-Gemini עצמה הם תיאור שירות גנרי על
      // הבקשה (מפתח לא תקין/מודל לא נמצא/תמונה גדולה מדי וכו') - לא תוכן מהקבלה/מהמשתמש,
      // בדיוק כמו ש-logSafe ב-lib/riseup-service.mjs רושם status+category, לא גוף תשובה.
      let detail = "";
      try { const body = await res.json(); detail = `${body?.error?.status || ""} ${String(body?.error?.message || "").slice(0, 200)}`.trim(); } catch { /* אין גוף תקין - משאירים ריק */ }
      console.warn(`[receipt-scan] upstream status=${res.status}${detail ? ` detail=${detail}` : ""}`);
      // 503 שנשאר אחרי כל הניסיונות החוזרים = עומס גבוה אמיתי אצל Gemini (ראו הערה ליד
      // OVERLOAD_BACKOFF_MS) - הודעה כנה למשתמש שזה זמני, לא "שגיאה" סתמית שמשתמעת כתקלה אצלנו.
      if (res.status === 503) throw new ReceiptScanError("overloaded", "שירות ניתוח התמונות עמוס כרגע (עומס גבוה אצל גוגל). נסו שוב בעוד כמה דקות.");
      throw new ReceiptScanError("upstream_error", "שגיאה בניתוח הקבלה. נסו שוב.");
    }

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
