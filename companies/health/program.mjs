// לוגיקה טהורה (ללא React, ללא אחסון) של תוכנית האימונים A/B/C.
// נבדקת ב-tests/health-program.test.mjs. אין כאן המצאת משקלים: משקל מופיע רק אם המשתמש הזין אותו.

export const SESSION_IDS = ["A", "B", "C"];
export const SAFE_ANSWER = "לא ידוע לי על מגבלה";
export const DEFAULT_REST = 75; // שניות; ההנחיה הקיימת היא 60–90

// מגבלה או אי-ודאות => לא בונים תוכנית תרגילים מותאמת (כמו ב-README של החברה).
export function isRestricted(profile) {
  const p = profile || {};
  return Boolean(p.sensitiveFlag) || (Boolean(p.safety) && p.safety !== SAFE_ANSWER);
}

export function hasGym(profile) {
  const place = profile?.place;
  return (Array.isArray(place) ? place : [place]).includes("חדר כושר");
}

// כמה אימונים בשבוע (1-3 מתוך A/B/C). בלי פרופיל מלא: ברירת מחדל 3.
export function sessionCount(profile) {
  const n = parseInt(profile?.availability, 10);
  if (Number.isFinite(n)) return Math.min(3, Math.max(1, n));
  return profile?.complete ? 2 : 3;
}

const ex = (name, load, hint) => ({ name, load: load ? String(load) : null, hint: hint || "" });

function gymSessions(b) {
  return {
    A: [ex("לחיצת רגליים", b.legPress), ex("לחיצת חזה במכונה", b.chestPress), ex("חתירה בישיבה", b.row), ex("פלאנק קצר", null, "משקל גוף")],
    B: [ex("דדליפט רומני עם משקולות", null, "בחירת משקל"), ex("לחיצת כתפיים במכונה", null, "בחירת משקל"), ex("פולי עליון", null, "בחירת משקל"), ex("דד־באג", null, "משקל גוף")],
    C: [ex("סקוואט גביע", null, "בחירת משקל"), ex("לחיצת חזה בשיפוע", null, "בחירת משקל"), ex("חתירה ביד אחת", null, "בחירת משקל"), ex("נשיאת משקולות", null, "בחירת משקל")],
  };
}
function homeSessions() {
  return {
    A: [ex("סקוואט לכיסא", null, "משקל גוף"), ex("שכיבות סמיכה על קיר", null, "משקל גוף"), ex("גשר ישבן", null, "משקל גוף"), ex("פלאנק קצר", null, "משקל גוף")],
    B: [ex("לאנג׳ אחורי נתמך", null, "משקל גוף"), ex("חתירה עם גומייה / תיק", null, "בחירת עומס"), ex("לחיצת כתפיים עם גומייה", null, "בחירת עומס"), ex("דד־באג", null, "משקל גוף")],
    C: [ex("עלייה למדרגה נמוכה", null, "משקל גוף"), ex("שכיבות סמיכה על שולחן", null, "משקל גוף"), ex("היפ־הינג׳ עם תיק", null, "בחירת עומס"), ex("Bird-dog", null, "משקל גוף")],
  };
}

// מחזיר { restricted, ids, sessions } כאשר sessions[id] = [{ id, name, sets, reps, load, hint }].
// load הוא null כשאין נתון אמיתי — לעולם לא מנחשים.
export function buildProgram(profile) {
  const p = profile || {};
  if (isRestricted(p)) return { restricted: true, ids: [], sessions: {} };
  const ids = SESSION_IDS.slice(0, sessionCount(p));
  const base = hasGym(p) ? gymSessions(p.baseline || {}) : homeSessions();
  const sessions = {};
  for (const id of ids) {
    sessions[id] = base[id].map((e, i) => ({ id: `${id}${i + 1}`, name: e.name, sets: 2, reps: "8–12", load: e.load, hint: e.hint, rest: DEFAULT_REST }));
  }
  return { restricted: false, ids, sessions };
}

// חלופה קצרה לימים בלי זמן. אינה תוכנית נוספת — רק "משהו קטן שנספר".
export const SHORT_ALTERNATIVE = {
  title: "10 דקות בבית",
  items: ["סקוואט לכיסא — 10 חזרות", "שכיבות סמיכה על קיר — 8 חזרות", "פלאנק קצר — 20 שניות", "הליכה במקום או במדרגות — 3 דקות"],
};
