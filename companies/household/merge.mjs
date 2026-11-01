// מיזוג תלת-כיווני של מצב משק הבית (base = הגרסה האחרונה שסונכרנה, mine = מה שיש אצלי עכשיו,
// theirs = מה ששותף/ה אחר/ת שמר/ה בינתיים). דווח (Liron): כששני אנשים עורכים את הרשימה במקביל
// (אחד בסופר מסמן "נרכש", השנייה מוסיפה פריטים) השמירה של המאוחר נדחתה והשינויים שלו נעלמו.
// כאן לא זורקים אף צד: אוספים עם מזהה (items/history/receipts/vouchers) ממוזגים לפי id, ושדות
// בתוך פריט ממוזגים לפי מי שינה אותם מאז ה-base. קובץ טהור (בלי React/Supabase), נבדק ב-node:test.

const COLLECTIONS = ["items", "history", "receipts", "vouchers"];
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const byId = list => new Map((Array.isArray(list) ? list : []).filter(x => x && x.id != null).map(x => [x.id, x]));
const stamp = x => String(x?.updatedAt || x?.createdAt || "");

// שדה בודד: מי ששינה מול ה-base גובר; אם שניהם שינו - המאוחר לפי updatedAt, ובשוויון שלי (הפעולה שלי עכשיו).
function pickField(b, m, t, newerIsTheirs) {
  if (same(m, b)) return t;
  if (same(t, b)) return m;
  return newerIsTheirs ? t : m;
}

function mergeRecord(base, mine, theirs) {
  const newerIsTheirs = stamp(theirs) > stamp(mine);
  const out = {};
  for (const k of new Set([...Object.keys(base || {}), ...Object.keys(mine), ...Object.keys(theirs)])) {
    const v = pickField(base?.[k], mine[k], theirs[k], newerIsTheirs);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

// מחיקה של אחד הצדדים גוברת: מחיקה היא פעולה מפורשת, ו"נרכש" מוציא את הפריט מ-items (אם נשאיר אותו
// בגלל עריכה של הצד השני נקבל פריט גם ברשימה וגם בהיסטוריה).
function mergeCollection(base, mine, theirs) {
  const b = byId(base), m = byId(mine), t = byId(theirs);
  const out = [];
  const seen = new Set();
  const take = (id, x) => { if (x && !seen.has(id)) { seen.add(id); out.push(x); } };
  for (const [id, tr] of t) {
    if (b.has(id) && !m.has(id)) continue;             // אני מחקתי
    take(id, m.has(id) && b.has(id) ? mergeRecord(b.get(id), m.get(id), tr) : m.has(id) ? m.get(id) : tr);
  }
  for (const [id, mr] of m) {
    if (seen.has(id)) continue;
    if (b.has(id) && !t.has(id)) continue;             // הם מחקו
    take(id, mr);                                      // נוסף אצלי בלבד
  }
  return out;
}

function mergeObject(base, mine, theirs) {
  const bo = base && typeof base === "object" ? base : {}, mo = mine && typeof mine === "object" ? mine : {}, to = theirs && typeof theirs === "object" ? theirs : {};
  const out = {};
  for (const k of new Set([...Object.keys(bo), ...Object.keys(mo), ...Object.keys(to)])) {
    const v = pickField(bo[k], mo[k], to[k], false);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export function mergeHousehold(base, mine, theirs) {
  if (!theirs) return mine;
  if (!mine) return theirs;
  if (same(mine, theirs) || same(theirs, base)) return mine; // אין מה למזג (שומר גם על סדר מפתחות, למניעת כתיבה מיותרת)
  if (same(mine, base)) return theirs;
  const out = {};
  for (const k of new Set([...Object.keys(base || {}), ...Object.keys(mine), ...Object.keys(theirs)])) {
    let v;
    if (COLLECTIONS.includes(k)) v = mergeCollection(base?.[k], mine[k], theirs[k]);
    else if (k === "categoryDict") v = mergeObject(base?.[k], mine[k], theirs[k]);
    else v = pickField(base?.[k], mine[k], theirs[k], false);
    if (v !== undefined) out[k] = v;
  }
  return out;
}
