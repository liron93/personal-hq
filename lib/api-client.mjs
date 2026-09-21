// עזרי לקוח לקריאות /api/*: מצרף Authorization: Bearer <access token של סשן Supabase>.
// ה-getSession מוזרק לבדיקות; ברירת המחדל טוענת את לקוח Supabase רק בדפדפן.
// בלי סשן לא נשלחת כותרת - השרת יחזיר 401 (או יאפשר דמו מקומי רק אם הופעל שם במפורש מחוץ ל-production).

async function defaultGetSession() {
  const { supabase } = await import("./supabase.js");
  const { data } = await supabase.auth.getSession();
  return data?.session ?? null;
}

export async function authHeaders(getSession = defaultGetSession) {
  try {
    const session = await getSession();
    const token = session?.access_token;
    return typeof token === "string" && token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export async function apiFetch(url, init = {}, { getSession = defaultGetSession, fetcher = fetch } = {}) {
  const auth = await authHeaders(getSession);
  return fetcher(url, { ...init, headers: { ...(init.headers || {}), ...auth } });
}

/** הודעת עברית קצרה לפי סטטוס; לא מציגה טקסט גולמי מהשרת עבור 401/403/413/429. */
export function apiErrorMessage(status, serverMessage, fallback = "לא ניתן להשלים את הבקשה כרגע.") {
  if (status === 401) return "פג תוקף ההתחברות. יש להתחבר מחדש.";
  if (status === 403) return "אין לך הרשאה לפעולה הזו.";
  if (status === 413) return "הבקשה גדולה מדי.";
  if (status === 429) return typeof serverMessage === "string" && serverMessage ? serverMessage : "יותר מדי בקשות. נסה שוב בעוד רגע.";
  return typeof serverMessage === "string" && serverMessage ? serverMessage : fallback;
}
