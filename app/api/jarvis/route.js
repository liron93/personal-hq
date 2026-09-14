// Route Handler בצד שרת: מקבל תמונת מצב גולמית מכל תתי-החברות (כבר מחושבת
// בלקוח מתוך summarize()+data), שולח ל-Gemini עם המפתח הסודי, ומחזיר תדריך
// קצר בעברית. המטרה: לא רק לנסח מחדש רשימת פעולות — לזהות קשרים אמיתיים בין
// תחומים (תאריכים חופפים, עומס מול דדליין וכד') שקוד דטרמיניסטי לא רואה.
// המפתח (GEMINI_API_KEY) לעולם לא מגיע ללקוח. בלי מפתח מוגדר — 503, והלקוח
// נופל בחזרה לטקסט הסטטי שלו (ראה app/page.jsx).
export const dynamic = "force-dynamic";

// alias שמצביע תמיד על הגרסה העדכנית של Gemini Flash, כדי לא להיתקע על גרסה מיושנת.
const MODEL = "gemini-flash-latest";

const SYSTEM_PROMPT = `אתה JARVIS — עוזר ה-AI השקט של Personal HQ, מערכת ניהול חיים אישית בהשראת ג'ארוויס מאיירון מן.
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

  const { urgentActions, openTasks, greeting, money, home, finance, career, health, wellbeing } = body || {};
  if (!Array.isArray(urgentActions)) return err("בקשה לא תקינה.", 400);

  const context = {
    greeting: greeting || null,
    totalOpenTasks: openTasks ?? 0,
    urgentActions: urgentActions.slice(0, 6),
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
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: { maxOutputTokens: 200, responseMimeType: "application/json" },
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

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return err("תשובה לא תקינה מ-JARVIS.", 502);
  }

  if (!parsed?.headline || !parsed?.subtext) return err("תשובה לא תקינה מ-JARVIS.", 502);

  return Response.json({ headline: String(parsed.headline), subtext: String(parsed.subtext) });
}
