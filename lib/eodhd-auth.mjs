// הרשאת /api/market/eodhd: מסתמך על השער המשותף לאימות שרת + הגבלת קצב בלבד (skipAllowlist:true — eodhd
// לא תלוי ב-API_ALLOWED_USER_IDS הגנרית), ומוסיף את רשימת הבעלים הקשיחה שלו EODHD_ALLOWED_USER_IDS
// (fail-closed בפני עצמה: חסרה/ריקה = אף משתמש לא מורשה). מעקף דמו כבוי כאן: העוגייה קשורה למזהה משתמש אמיתי.
import { fail } from "./api-utils.mjs";
import { parseAllowedUserIds } from "./server-auth.mjs";

export function createEodhdAuthorizer({ guard, env = process.env }) {
  return async function authorize(request) {
    const gate = await guard(request, { scope: "eodhd", limit: 30, windowMs: 60000, allowDemo: false, skipAllowlist: true });
    if (!gate.ok) return gate;
    if (!parseAllowedUserIds(env.EODHD_ALLOWED_USER_IDS).has(gate.user.id)) return { ok: false, response: fail("forbidden", 403) };
    return gate;
  };
}
