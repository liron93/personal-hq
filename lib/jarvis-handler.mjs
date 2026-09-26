// לוגיקת /api/jarvis ו-/api/jarvis/chat, מופרדת מה-route כדי שאפשר לבדוק אותה ב-node בלי רשת.
// סדר קבוע: שער אימות/הרשאה/קצב -> קונפיגורציה -> גוף וולידציה -> Gemini. המפתח לעולם לא מגיע ללקוח.
import { fail, reply, readJsonBody, fetchWithTimeout, logCode } from "./api-utils.mjs";

const MODEL = "gemini-flash-latest";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const GEMINI_TIMEOUT_MS = 9000;

export const LIMITS = {
  briefingBodyBytes: 32 * 1024,
  chatBodyBytes: 64 * 1024,
  urgentActions: 20,
  contextPartBytes: 6 * 1024,
  chatContextBytes: 24 * 1024,
  greeting: 200,
  messageText: 2000,
  messages: 50,
  history: 12,
};

const BRIEFING_PROMPT = `אתה JARVIS — עוזר ה-AI השקט של Personal HQ, מערכת ניהול חיים אישית בהשראת ג'ארוויס מאיירון מן.
תקבל תמונת מצב גולמית (JSON) מכל תתי-החברות: בית חדש (שיפוץ), כלכלה, קריירה, בריאות, רווחה נפשית.

המשימה שלך היא סינתזה, לא סיכום: אל תפרט מחדש כל תחום בנפרד. חפש קשר אמיתי בין
תחומים — תאריכים שחופפים, עומס נפשי (wellbeing.load) שפוגש דדליין בתחום אחר,
הוצאה כספית גדולה שמתנגשת עם תקציב, קריירה שדורשת זמן פנוי באותו שבוע שיש
פעולה דחופה בבית. אם יש קשר כזה — הוא הדבר הכי חשוב לומר. אם אין קשר אמיתי בין
תחומים, תעדיף פשוט את הפריט הכי דחוף (לפי תאריך, אם יש).
אם הנתונים לא מספיקים לזהות קשר אמיתי — אל תמציא אחד. עדיף פשוט וברור מאשר תובנה מזויפת.

טון: בטוח, ענייני, לא נלהב מדי, בלי אימוג'ים. שתי משפטים לכל היותר.
החזר אך ורק JSON תקין בצורה: {"headline": "...", "subtext": "..."}
headline — משפט מנחה אחד (עד 12 מילים). subtext — ההסבר/הקשר הקצר, או עידוד קצר אם הכל בסדר.`;

const CHAT_PROMPT = `אתה JARVIS — עוזר ה-AI של Personal HQ, מערכת ניהול חיים אישית בהשראת ג'ארוויס מאיירון מן.
המשתמש עונה לך בעברית ואתה עונה בעברית, בטון בטוח, ענייני וקצר (כמה משפטים לכל היותר, לא חיבור).
יש לך תמונת מצב גולמית (JSON) מכל תתי-החברות שלו: בית חדש (שיפוץ), כלכלה, קריירה, בריאות, רווחה נפשית.
ענה על סמך הנתונים האלה בלבד. אם המידע לא מספיק כדי לענות בביטחון — תגיד את זה במפורש, אל תמציא נתון.
אתה לא נותן ייעוץ רפואי/פיננסי/משפטי מחייב — רק עוזר לארגן ולתעדף.`;

const sleepDefault = ms => new Promise(resolve => setTimeout(resolve, ms));
const isPlainObject = v => v !== null && typeof v === "object" && !Array.isArray(v);
const sizeOf = v => { try { return JSON.stringify(v).length; } catch { return Infinity; } };

// Gemini מחזיר לפעמים 503 זמני ("high demand"). ניסיון חוזר אחד קצר, כמו קודם; לכל ניסיון timeout משלו.
async function callGemini({ fetcher, sleep }, apiKey, requestBody, attempt = 0) {
  let res;
  try {
    res = await fetchWithTimeout(fetcher, GEMINI_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(requestBody),
      cache: "no-store",
    }, GEMINI_TIMEOUT_MS);
  } catch (e) {
    if (attempt < 1) { await sleep(500); return callGemini({ fetcher, sleep }, apiKey, requestBody, attempt + 1); }
    throw e;
  }
  if (res.status === 503 && attempt < 1) { await sleep(700); return callGemini({ fetcher, sleep }, apiKey, requestBody, attempt + 1); }
  return res;
}

function makeDeps({ guard, getApiKey, fetcher = fetch, sleep = sleepDefault }) {
  return { guard, getApiKey, fetcher, sleep };
}

async function runGuard(deps, request, scope, limit) {
  const gate = await deps.guard(request, { scope, limit, windowMs: 60000 });
  return gate;
}

export function createBriefingHandler(opts) {
  const deps = makeDeps(opts);
  return async function POST(request) {
    try {
      const gate = await runGuard(deps, request, "jarvis", 12);
      if (!gate.ok) return gate.response;
      const apiKey = deps.getApiKey();
      if (!apiKey) return fail("unavailable", 503);

      const parsed = await readJsonBody(request, LIMITS.briefingBodyBytes);
      if (!parsed.ok) return parsed.response;
      const body = parsed.value;
      if (!isPlainObject(body) || !Array.isArray(body.urgentActions) || body.urgentActions.length > LIMITS.urgentActions * 5) return fail("bad_request", 400);
      const { urgentActions, openTasks, greeting, money, home, finance, career, health, wellbeing } = body;
      if (greeting != null && (typeof greeting !== "string" || greeting.length > LIMITS.greeting)) return fail("bad_request", 400);
      if (openTasks != null && (typeof openTasks !== "number" || !Number.isFinite(openTasks))) return fail("bad_request", 400);
      const parts = { money, home, finance, career, health, wellbeing };
      for (const value of Object.values(parts)) {
        if (value != null && (!isPlainObject(value) || sizeOf(value) > LIMITS.contextPartBytes)) return fail("bad_request", 400);
      }
      const actions = urgentActions.slice(0, 6);
      if (sizeOf(actions) > LIMITS.contextPartBytes) return fail("bad_request", 400);

      const context = {
        greeting: greeting || null,
        totalOpenTasks: openTasks ?? 0,
        urgentActions: actions,
        money: money || null,
        home: home || null,
        finance: finance || null,
        career: career || null,
        health: health || null,
        wellbeing: wellbeing || null,
      };
      const userPrompt = `תמונת המצב היום:\n${JSON.stringify(context, null, 2)}`;

      let res;
      try {
        res = await callGemini(deps, apiKey, {
          systemInstruction: { parts: [{ text: BRIEFING_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: { maxOutputTokens: 300, responseMimeType: "application/json" },
        });
      } catch {
        logCode("jarvis", "upstream_unreachable");
        return fail("unavailable", 502);
      }
      if (res.status === 429) return reply({ error: "JARVIS עמוס כרגע. נסה שוב בעוד רגע.", code: "rate_limited" }, 429);
      if (!res.ok) { logCode("jarvis", `upstream_${res.status}`); return reply({ error: "שגיאה בפנייה ל-JARVIS.", code: "upstream" }, 502); }

      let text = "";
      let out;
      try {
        const data = await res.json();
        text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        out = JSON.parse(text);
      } catch {
        return reply({ error: "תשובה לא תקינה מ-JARVIS.", code: "upstream" }, 502);
      }
      if (!out?.headline || !out?.subtext) return reply({ error: "תשובה לא תקינה מ-JARVIS.", code: "upstream" }, 502);
      return reply({ headline: String(out.headline), subtext: String(out.subtext) });
    } catch {
      logCode("jarvis", "internal");
      return fail("unavailable", 500);
    }
  };
}

export function createChatHandler(opts) {
  const deps = makeDeps(opts);
  return async function POST(request) {
    try {
      const gate = await runGuard(deps, request, "jarvis-chat", 20);
      if (!gate.ok) return gate.response;
      const apiKey = deps.getApiKey();
      if (!apiKey) return fail("unavailable", 503);

      const parsed = await readJsonBody(request, LIMITS.chatBodyBytes);
      if (!parsed.ok) return parsed.response;
      const { messages, context } = parsed.value && typeof parsed.value === "object" ? parsed.value : {};
      if (!Array.isArray(messages) || !messages.length || messages.length > LIMITS.messages) return fail("bad_request", 400);
      if (context != null && (!isPlainObject(context) || sizeOf(context) > LIMITS.chatContextBytes)) return fail("bad_request", 400);

      const history = messages.slice(-LIMITS.history);
      for (const m of history) {
        if (!isPlainObject(m) || (m.role !== "user" && m.role !== "model") || typeof m.text !== "string" || !m.text.trim() || m.text.length > LIMITS.messageText) return fail("bad_request", 400);
      }
      if (history[history.length - 1].role !== "user") return fail("bad_request", 400);

      const contents = [
        { role: "user", parts: [{ text: `תמונת המצב הנוכחית שלי (JSON, לשימושך כרקע לתשובות):\n${JSON.stringify(context || {}, null, 2)}` }] },
        { role: "model", parts: [{ text: "קיבלתי את תמונת המצב. אני כאן, שאל/י." }] },
        ...history.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
      ];

      let res;
      try {
        res = await callGemini(deps, apiKey, {
          systemInstruction: { parts: [{ text: CHAT_PROMPT }] },
          contents,
          generationConfig: { maxOutputTokens: 400 },
        });
      } catch {
        logCode("jarvis-chat", "upstream_unreachable");
        return fail("unavailable", 502);
      }
      if (res.status === 429) return reply({ error: "JARVIS עמוס כרגע. נסה שוב בעוד רגע.", code: "rate_limited" }, 429);
      if (!res.ok) { logCode("jarvis-chat", `upstream_${res.status}`); return reply({ error: "שגיאה בפנייה ל-JARVIS.", code: "upstream" }, 502); }

      let reText;
      try {
        const data = await res.json();
        reText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      } catch {
        return reply({ error: "תשובה לא תקינה מ-JARVIS.", code: "upstream" }, 502);
      }
      if (!reText) return reply({ error: "JARVIS לא הצליח לענות. נסה שוב.", code: "upstream" }, 502);
      return reply({ reply: String(reText).trim() });
    } catch {
      logCode("jarvis-chat", "internal");
      return fail("unavailable", 500);
    }
  };
}
