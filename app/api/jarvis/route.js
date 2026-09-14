// Route Handler בצד שרת: מקבל תקציר מצב (כבר מחושב בלקוח מתוך summarize() של
// כל תת-חברה), שולח ל-Gemini עם המפתח הסודי, ומחזיר משפט תדריך קצר בעברית.
// המפתח (GEMINI_API_KEY) לעולם לא מגיע ללקוח. בלי מפתח מוגדר — 503, והלקוח
// נופל בחזרה לטקסט הסטטי שלו (ראה app/page.jsx).
export const dynamic = "force-dynamic";

// alias שמצביע תמיד על הגרסה העדכנית של Gemini Flash, כדי לא להיתקע על גרסה מיושנת.
const MODEL = "gemini-flash-latest";

const SYSTEM_PROMPT = `אתה JARVIS — עוזר ה-AI השקט של Personal HQ, מערכת ניהול חיים אישית בהשראת ג'ארוויס מאיירון מן.
תפקידך: לקרוא תקציר מצב של תתי-החברות (בית, כלכלה, קריירה, בריאות, רווחה נפשית) ולנסח תדריך קצר, רגוע ומדויק בעברית.
טון: בטוח, ענייני, לא נלהב מדי, בלי אימוג'ים. שתי משפטים לכל היותר.
החזר אך ורק JSON תקין בצורה: {"headline": "...", "subtext": "..."}
headline — משפט מנחה אחד (עד 12 מילים). subtext — פירוט קצר של מה שדורש תשומת לב, או עידוד קצר אם הכל בסדר.`;

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

  const { urgentActions, openTasks, greeting } = body || {};
  if (!Array.isArray(urgentActions)) return err("בקשה לא תקינה.", 400);

  const summary = urgentActions.length
    ? urgentActions.slice(0, 6).map(a => `- [${a.company}] ${a.text} (${a.detail})`).join("\n")
    : "אין פעולות דחופות פתוחות כרגע.";
  const userPrompt = `${greeting || ""}\nסה"כ פעולות פתוחות בכל החברות: ${openTasks ?? 0}\nפעולות שדורשות תשומת לב:\n${summary}`;

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
