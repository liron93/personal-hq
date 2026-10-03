import {
  createGroceryState, ensureGroceryState, budgetVsActual, missingCategorizationItems,
} from "./grocery-model.js";

export const STORE_KEY = "hq:household:v1";

// v1 scope = "סופר" + שוברים: רשימת קניות משותפת + היסטוריית רכישות + חיסכון + שוברים
// (vouchers, ראה vouchers-model.js - לא קשור לסופר ספציפית, לכן שדה אחים ל-items/history,
// לא בתוך grocery-model.js עצמו). שדות נוספים (משימות בית אחרות, לוח ניקיון וכד') יצטרפו
// כאן בעתיד, לצד — לא בתוך — companies/kesef.
export const INIT = { ...createGroceryState(), vouchers: [] };

/** תאימות אחורה: מוסיף שדות רשימת-קניות תקינים (ensureGroceryState) ושדה vouchers (לנתונים
    ישנים מלפני הפיצ'ר הזה) לנתונים ישנים/חלקיים, בלי לדרוס שום דבר קיים. */
export function ensureHousehold(d) {
  const g = ensureGroceryState(d);
  return Array.isArray(g.vouchers) ? g : { ...g, vouchers: [] };
}

/*
  ערוץ הקריאה של שבתאי/כספים לנתון המצרפי של הוצאות הסופר (ראה docs/PR): summarize() מחזירה
  groceryMonthlySpend — סך ההוצאה המתועדת (עם מחיר) בחודש הנוכחי, או null כשאין עדיין נתון.
  זה בדיוק אותו ערוץ שדרכו מסך המנכ"ל כבר קורא כל תת-חברה (כלל 2 ב-CLAUDE.md), ולכן לא
  נדרש מפתח אחסון חדש, לא כפילות של מודל הנתונים, ולא גישת כתיבה לכספים. תצוגת התזרים
  בכספים (PR עתידי, לא כאן) תוכל לקרוא summaries.household.summary.groceryMonthlySpend
  בדיוק כפי שמסך המנכ"ל כבר קורא summary של כל חברה אחרת — בלי שהחברה הזו תחזיק UI
  או נתונים בתוך kesef, ובלי שלכספים תהיה גישת כתיבה לנתוני הסופר.
*/
export function summarize(data) {
  const d = ensureGroceryState(data || INIT);
  const need = (d.items || []).length;
  const bva = budgetVsActual(d);
  const missing = missingCategorizationItems(d.items).length;
  const flag = bva.over || missing > 0 ? "amber" : "green";
  return {
    openTasks: need,
    nextPayment: null,
    daysToPay: null,
    latestUpdate: null,
    flag,
    // סיכום ל"סופר" — נקרא על ידי מסך המנכ"ל (app/page.jsx) ובעתיד גם על ידי תצוגת התזרים בכספים.
    groceryMonthlySpend: bva.spend.hasData ? bva.spend.total : null,
    grocery: { needCount: need, monthlyBudget: bva.budget, overBudget: bva.over, missingCategorization: missing },
  };
}
