// סיווג לקטגוריות התקציב הקיימות. כללים פשוטים וגלויים; מה שלא מזוהה נשאר null ("לא מסווג") ולא מנוחש.
// סיווג הוא הצעה בלבד: ה-preview מציג מה מקור כל סיווג, והמשתמש מאשר לפני שמירה.
// הכללים ניתנים להחלפה (מעבירים rules משלך).

/** @type {{id:string, category:string, keywords:string[]}[]} */
export const DEFAULT_RULES = Object.freeze([
  { id: "food", category: "מזון", keywords: ["שופרסל", "רמי לוי", "יוחננוף", "מגה", "סופר", "מכולת", "מאפיה", "ירקות"] },
  { id: "insurance", category: "ביטוחים", keywords: ["ביטוח", "הראל", "מגדל", "הפניקס", "כלל ביטוח", "מנורה"] },
  { id: "subscriptions", category: "מנויים", keywords: ["netflix", "spotify", "apple.com/bill", "google *", "youtube", "disney"] },
  { id: "leisure", category: "פנאי", keywords: ["מסעדה", "קפה", "סינמה", "קולנוע", "פאב", "בר "] },
]);

const norm = s => String(s).toLocaleLowerCase("he");

/**
 * @param {object[]} rows שורות מנורמלות
 * @param {{rules?:typeof DEFAULT_RULES, categories:readonly string[]}} opts
 */
export function classifyRows(rows, { rules = DEFAULT_RULES, categories }) {
  const allowed = new Set(categories);
  const active = rules.filter(r => allowed.has(r.category));
  return rows.map(row => {
    if (row.category && allowed.has(row.category)) return { ...row, categorySource: "file" };
    if (row.direction !== "out") return { ...row, category: null, categorySource: null };
    const text = norm(row.description);
    const hit = active.find(rule => rule.keywords.some(k => text.includes(norm(k))));
    return hit ? { ...row, category: hit.category, categorySource: `rule:${hit.id}` } : { ...row, category: null, categorySource: null };
  });
}
