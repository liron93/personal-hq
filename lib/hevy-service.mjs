// קריאות ל-Hevy API (https://api.hevyapp.com/docs) - תיעוד פומבי של Hevy, נבדק ישירות מול
// ה-Swagger הרשמי ב-2026-10-04. קריאה בלבד (GET) - שום POST/PUT/DELETE לעולם, לא לקוד הזה
// ולא לאף מי שקורא לו. fetcher מוזרק כדי שאפשר לבדוק בלי רשת אמיתית, אותו דפוס כמו
// lib/riseup-service.mjs/lib/receipt-scan-service.mjs.
import { fetchWithTimeout } from "./api-utils.mjs";

const BASE_URL = "https://api.hevyapp.com/v1";
const TIMEOUT_MS = 12000;
// pageSize המקסימלי של Hevy עצמו הוא 10 (ראו /v1/workouts בתיעוד) - לא בחירה שלנו.
const PAGE_SIZE = 10;
// תקרה שמרנית לייבוא אחד: "rate limit שמרני" (דרישת עמית) - מספיק להיסטוריה אחרונה
// משמעותית בלי להציף את ה-API של Hevy בעשרות בקשות בלחיצה אחת. ייבוא חוזר מביא את מה
// שנוסף מאז בקלות (dedupe לפי hevySourceId ב-companies/health/model.js).
const MAX_WORKOUTS = 50;

export class HevyError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function hevyFetch({ fetcher, apiKey, path, query }) {
  const url = new URL(BASE_URL + path);
  for (const [key, value] of Object.entries(query || {})) url.searchParams.set(key, String(value));
  let res;
  try {
    res = await fetchWithTimeout(fetcher, url.toString(), {
      method: "GET",
      headers: { "api-key": apiKey },
      cache: "no-store",
    }, TIMEOUT_MS);
  } catch {
    throw new HevyError("network_error", "לא ניתן להתחבר ל-Hevy כרגע. נסו שוב בעוד רגע.");
  }
  if (res.status === 401 || res.status === 403 || res.status === 404) {
    throw new HevyError("invalid_key", "מפתח Hevy לא תקין, או שאין הרשאת Hevy Pro לחשבון הזה.");
  }
  if (res.status === 429) throw new HevyError("rate_limited", "יותר מדי בקשות ל-Hevy. נסו שוב בעוד רגע.");
  if (!res.ok) {
    // אבחון בטוח: רק status - לא גוף התשובה (עלול לכלול פרטי חשבון Hevy של המשתמש).
    console.warn(`[hevy] upstream status=${res.status}`);
    throw new HevyError("unavailable", "שירות Hevy לא זמין כרגע. נסו שוב מאוחר יותר.");
  }
  try {
    return await res.json();
  } catch {
    throw new HevyError("unavailable", "תשובה לא תקינה משירות Hevy.");
  }
}

/**
 * בדיקת תקינות מפתח - GET /v1/user/info, הכי קל וחסר תופעות-לוואי שיש ב-API של Hevy. מחזיר
 * רק את מה שדרוש לאישור חיבור (לא שומרים/מציגים יותר מהנדרש - "לא פרטי ספק מיותרים").
 */
export async function testHevyConnection({ fetcher = fetch } = {}, apiKey) {
  const body = await hevyFetch({ fetcher, apiKey, path: "/user/info" });
  return { username: typeof body?.data?.username === "string" ? body.data.username : null };
}

const toDateOnly = iso => (typeof iso === "string" && iso.length >= 10 ? iso.slice(0, 10) : null);

function sanitizeWorkout(raw) {
  if (!raw || typeof raw !== "object" || typeof raw.id !== "string") return null;
  const exercises = Array.isArray(raw.exercises) ? raw.exercises.map(ex => ({
    name: typeof ex?.title === "string" ? ex.title : "תרגיל",
    sets: Array.isArray(ex?.sets) ? ex.sets.map(s => ({
      reps: Number.isFinite(s?.reps) ? s.reps : null,
      weightKg: Number.isFinite(s?.weight_kg) ? s.weight_kg : null,
    })) : [],
  })) : [];
  return {
    hevySourceId: raw.id,
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : "אימון",
    date: toDateOnly(raw.start_time) || toDateOnly(raw.created_at),
    exercises,
  };
}

/**
 * שולף עד MAX_WORKOUTS אימונים אחרונים (החדשים ביותר קודם - כך Hevy ממיין כברירת מחדל),
 * דפדוף עד שמגיעים לתקרה או שנגמרים העמודים. קריאה בלבד - לעולם לא שומר/משנה כלום ב-Hevy.
 */
export async function fetchRecentHevyWorkouts({ fetcher = fetch } = {}, apiKey) {
  const out = [];
  let page = 1;
  for (;;) {
    const body = await hevyFetch({ fetcher, apiKey, path: "/workouts", query: { page, pageSize: PAGE_SIZE } });
    const workouts = Array.isArray(body?.workouts) ? body.workouts : [];
    for (const w of workouts) {
      const clean = sanitizeWorkout(w);
      if (clean) out.push(clean);
      if (out.length >= MAX_WORKOUTS) return out;
    }
    const pageCount = Number(body?.page_count);
    if (workouts.length === 0 || !Number.isFinite(pageCount) || page >= pageCount) return out;
    page += 1;
  }
}

/** factory בסגנון createReceiptScanService/createRiseupService - fetcher מוזרק פעם אחת, ואז
    שתי הפונקציות נקראות רק עם apiKey (אותו דפוס שה-handler מצפה לו). */
export function createHevyService({ fetcher = fetch } = {}) {
  return {
    testConnection: apiKey => testHevyConnection({ fetcher }, apiKey),
    fetchWorkouts: apiKey => fetchRecentHevyWorkouts({ fetcher }, apiKey),
  };
}
