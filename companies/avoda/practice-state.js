// בנק שאלות התרגול — תוכן סטטי שהועבר מהמוצר הישן (Job-guide, data/questions.json +
// data/terminology-questions.json). זה תוכן גנרי (שאלות ראיון PM), לא מידע אישי —
// לכן הוא חי כאן כ-JSON קבוע בתוך הריפו, לא ב-Supabase ולא במודל של המשתמש.
// אין כאן שום קריאת AI: המשתמש/ת מסמנים לעצמם "תרגלתי" ופותחים רמז/תשובה נכונה
// כשיש כזו (שאלות אמריקאיות) — בלי הערכה אוטומטית. זה יתחבר בעתיד.
import questions from "./data/questions.json";
import terminology from "./data/terminology-questions.json";

export const QUESTIONS = [...questions, ...terminology];
export const CATEGORIES = Array.from(new Set(QUESTIONS.map(q => q.category))).sort((a, b) => a.localeCompare(b, "he"));
export const DIFFICULTY_LABELS = { easy: "קל", medium: "בינוני", hard: "קשה" };

export function selectQuestions(practiced, query = "", category = "all", onlyUnpracticed = false) {
  const needle = query.trim().toLocaleLowerCase();
  return QUESTIONS.filter(q => {
    if (category !== "all" && q.category !== category) return false;
    if (onlyUnpracticed && practiced[q.id]) return false;
    if (!needle) return true;
    const haystack = [q.question, ...(q.tags || []), ...(q.frameworks || [])].join(" ").toLocaleLowerCase();
    return haystack.includes(needle);
  });
}

export function practiceStats(practiced) {
  const total = QUESTIONS.length;
  const done = Object.keys(practiced || {}).filter(id => practiced[id] && QUESTIONS.some(q => q.id === id)).length;
  return { total, done, percent: total ? Math.round((done / total) * 100) : 0 };
}
