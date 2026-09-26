import {
  createGroceryState, ensureGroceryState, budgetVsActual, missingCategorizationItems,
} from "./grocery-model.js";

export const STORE_KEY = "hq:household:v1";

// v1 scope = "סופר" בלבד: רשימת קניות משותפת + היסטוריית רכישות + חיסכון. שדות נוספים
// (משימות בית אחרות, לוח ניקיון וכד') יצטרפו כאן בעתיד, לצד — לא בתוך — companies/kesef.
export const INIT = createGroceryState();

// תאימות אחורה: מוסיף שדות רשימת-קניות תקינים לנתונים ישנים בלי הפיצ'ר הזה (למשל אחרי migration עתידי).
export const ensureHousehold = ensureGroceryState;

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
