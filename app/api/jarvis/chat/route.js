// Route Handler בצד שרת: שיחה רב-תורית עם JARVIS על סמך תמונת המצב שכבר
// מחושבת בלקוח (אותה context כמו /api/jarvis). המפתח (GEMINI_API_KEY) נשאר
// בשרת בלבד. בלי מפתח מוגדר — 503; הלקוח מציג הודעת שגיאה בצ'אט בלבד, לא
// שובר את שאר העמוד.
export const dynamic = "force-dynamic";

const MODEL = "gemini-flash-latest";
const MAX_HISTORY = 12;

const SYSTEM_PROMPT = `אתה JARVIS — עוזר ה-AI של Personal HQ, מערכת ניהול חיים אישית בהשראת ג'ארוויס מאיירון מן.
המשתמש עונה לך בעברית ואתה עונה בעברית, בטון בטוח, ענייני וקצר (כמה משפטים לכל היותר, לא חיבור).
יש לך תמונת מצב גולמית (JSON) מכל תתי-החברות שלו: בית חדש (שיפוץ), כלכלה, קריירה, בריאות, רווחה נפשית.
ענה על סמך הנתונים האלה בלבד. אם המידע לא מספיק כדי לענות בביטחון — תגיד את זה במפורש, אל תמציא נתון.
אתה לא נותן ייעוץ רפואי/פיננסי/משפטי מחייב — רק עוזר לארגן ולתעדף.`;

function err(message, status) {
  return Response.json({ error: message }, { status });
}

export async function POST(request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return err("JARVIS לא מוגדר בשרת.", 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return err("בקשה לא תקינה.", 400);
  }

  const { messages, context } = body || {};
  if (!Array.isArray(messages) || !messages.length) return err("בקשה לא תקינה.", 400);

  const history = messages.slice(-MAX_HISTORY).filter(m => m && typeof m.text === "string" && (m.role === "user" || m.role === "model"));
  if (!history.length) return err("בקשה לא תקינה.", 400);

  const contents = [
    { role: "user", parts: [{ text: `תמונת המצב הנוכחית שלי (JSON, לשימושך כרקע לתשובות):\n${JSON.stringify(context || {}, null, 2)}` }] },
    { role: "model", parts: [{ text: "קיבלתי את תמונת המצב. אני כאן, שאל/י." }] },
    ...history.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
  ];

  let res;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: { maxOutputTokens: 400 },
      }),
      cache: "no-store",
    });
  } catch {
    return err("שגיאה בפנייה ל-JARVIS.", 502);
  }

  if (res.status === 429) return err("JARVIS עמוס כרגע. נסה שוב בעוד רגע.", 429);
  if (!res.ok) return err("שגיאה בפנייה ל-JARVIS.", 502);

  let data;
  try {
    data = await res.json();
  } catch {
    return err("תשובה לא תקינה מ-JARVIS.", 502);
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return err("JARVIS לא הצליח לענות. נסה שוב.", 502);

  return Response.json({ reply: String(text).trim() });
}
