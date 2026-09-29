// לוגיקה טהורה של "תכנון 5 שנים" (60 חודשים) עבור תת-החברה "כספים" — הכנסות/הוצאות/יעדים
// מתוכננים, מזומן פנוי להשקעה, הקצאת השקעות, תחזית מול ביצוע, התראות חריגה והתקדמות ליעדים.
// קובץ טהור בכוונה (בלי React, בלי Supabase, בלי window, ובלי alias imports של "@/") כדי שיהיה
// אפשר לייבא אותו ישירות תחת node:test (`node --test`) בלי טוען מודולים מיוחד — ראה
// tests/kesef-five-year-plan.test.mjs. מבנה ותבנית ברירות-המחדל/תאימות-אחורה מועתקים בכוונה מ-
// companies/household/grocery-model.js (ensureGroceryState) — אותו דפוס בדיוק, תת-חברה אחרת.
//
// state כאן = הנתונים שנשמרים תחת hq:kesef:plan:v1 (מפתח משותף נפרד מ-hq:kesef:v1 של שאר
// "כספים", כדי לא לנפח את ה-blob הקיים — ראה lib/authz/capabilities.js ל-COMPANY_STATE_CAPABILITIES).
//
// שילוב עם נתוני ליבה/נכסים: המודול הטהור הזה **לא** מייבא את lib/coreFacts.js ולא את
// companies/kesef/model.js — שתי הפונקציות היחידות שצריכות "עולם חיצוני" (projectPlan,
// ל-mortgageMonthly ו-seedAssetsTotal) מקבלות אותם כפרמטרים רגילים. הרכיב (FiveYearPlan.jsx)
// הוא זה שקורא ל-lib/coreFacts.js ול-companies/kesef/model.js ומעביר מספרים בלבד לכאן — כך
// אין תלות מעגלית אפשרית (kesef/model.js לא מייבא את הקובץ הזה), וגם נשמר כלל 4 ב-CLAUDE.md
// (הכנסות/משכנתה נקראות ישירות מ-coreFacts ברכיב, לא מועתקות/מסונכרנות לתוך ה-state הזה).
//
// שום מספר בתחזית לא "מומצא": כל תא בטבלה מחושב מהנחות שהמשתמש הקליד (income/recurring/oneOff/
// allocationPct/goals) או מ-actuals שהמשתמש הקליד בדיעבד. אין חיבור בנק, אין מסחר אוטומטי, ואין
// נתוני שוק חיים בתחזית הזו. חודש בלי actuals הוא תכנון בלבד — לעולם לא "מדווח" כביצוע.

const uid = () => Math.random().toString(36).slice(2, 10);
const round2 = n => Math.round((n || 0) * 100) / 100;
const norm = s => String(s || "").trim();
const ils = v => "₪" + Math.round(v || 0).toLocaleString("he-IL");

// אין companies/kesef/plan/model.js נפרד (הפיצ'ר הוא טאב בתוך "כספים", לא תת-חברה עצמאית עם
// registry משלה) — לכן, בשונה מ-companies/household (grocery-model.js הטהור + model.js עם
// STORE_KEY/INIT), שני הקבועים האלה חיים כאן, בקובץ הטהור עצמו. הם מחרוזת/אובייקט קבועים
// בלבד — בלי React/Supabase/window — כך שהטוהר של הקובץ לא נפגע.
export const STORE_KEY = "hq:kesef:plan:v1";

export const DEFAULT_HORIZON_MONTHS = 60;

// סף חריגה לתחזית-מול-ביצוע: 15% זו סטייה שכבר שווה תשומת לב (לא רעש של כמה מאות שקלים),
// אבל לא כזו גבוהה שרק חריגות ענק יתריעו. אותו רעיון כמו trendThresholdPercent=20 בסופר
// (household/grocery-model.js), רק נמוך יותר כי כאן מדובר בתקציב חודשי שלם ולא בקטגוריה בודדת.
export const DEVIATION_THRESHOLD_PERCENT = 15;

// סובלנות התקדמות ליעד: יעד נחשב "בקצב" אם התחזית בטווח ±10% מהיעד בחודש המטרה. פחות
// מזה = "מאחור", יותר = "לפני הקצב". 10% ולא 15% (כמו סף הסטייה) כי כאן זו נקודת השוואה
// בודדת (לא נתון רועש מדי חודש), אז אפשר להיות קצת יותר מחמירים.
export const GOAL_TOLERANCE_PERCENT = 10;

// בדיוק כמו INSUFFICIENT_DATA במסך החיסכון של הסופר — חודש בלי רשומת actuals לא מקבל שום
// ציון תחזית-מול-ביצוע, רק את המשפט הזה. לעולם לא בודים ביצוע שלא הוזן.
export const INSUFFICIENT_DATA = "אין עדיין נתוני ביצוע";

export const RECURRING_KINDS = Object.freeze(["income", "expense"]);
const FIELD_LABELS = Object.freeze({ income: "הכנסה", expenses: "הוצאות", invested: "השקעה בפועל" });

// ---------- ולידציה (אותם שמות/סגנון כמו companies/household/grocery-model.js) ----------
export const isValidName = name => norm(name).length > 0;
export const isValidPositiveNumber = v => typeof v === "number" && Number.isFinite(v) && v > 0;
export const isValidNonNegativeNumber = v => typeof v === "number" && Number.isFinite(v) && v >= 0;
export const isValidMonth = v => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
export const isValidAllocationPct = v => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;

// ---------- מצב: יצירה / תאימות אחורה ----------
export function createPlanState() {
  const startMonth = new Date().toISOString().slice(0, 7);
  return {
    startMonth,
    horizonMonths: DEFAULT_HORIZON_MONTHS,
    income: { mine: 0, spouse: 0, other: 0 },
    recurring: [], // {id, label, amount, kind:"income"|"expense", startMonth, endMonth|null}
    oneOff: [],     // {id, label, amount, month, kind:"income"|"expense"}
    allocationPct: 0,
    goals: [],      // {id, label, targetAmount, targetMonth}
    actuals: [],    // {month, income, expenses, invested}
  };
}

// ברירת מחדל ל-useStore(STORE_KEY, INIT) — לא נקרא/נכתב יותר מפעם אחת ב-import (cp() ב-lib/store.js
// עושה עותק עמוק בכל שימוש, כמו INIT של כל תת-חברה אחרת).
export const INIT = createPlanState();

/** מבטיח שדות תקינים גם אם חסרים/ישנים בנתונים (תאימות אחורה) — מראה ensureGroceryState. */
export function ensurePlanState(d) {
  const base = d && typeof d === "object" ? d : {};
  const hasAll = isValidMonth(base.startMonth)
    && typeof base.horizonMonths === "number" && base.horizonMonths > 0
    && base.income && typeof base.income === "object"
    && isValidNonNegativeNumber(base.income.mine) && isValidNonNegativeNumber(base.income.spouse) && isValidNonNegativeNumber(base.income.other)
    && Array.isArray(base.recurring) && Array.isArray(base.oneOff)
    && isValidAllocationPct(base.allocationPct)
    && Array.isArray(base.goals) && Array.isArray(base.actuals);
  if (hasAll) return base;
  const fresh = createPlanState();
  const incomeBase = base.income && typeof base.income === "object" ? base.income : {};
  return {
    ...fresh,
    ...base,
    startMonth: isValidMonth(base.startMonth) ? base.startMonth : fresh.startMonth,
    horizonMonths: typeof base.horizonMonths === "number" && base.horizonMonths > 0 ? base.horizonMonths : fresh.horizonMonths,
    income: {
      mine: isValidNonNegativeNumber(incomeBase.mine) ? incomeBase.mine : fresh.income.mine,
      spouse: isValidNonNegativeNumber(incomeBase.spouse) ? incomeBase.spouse : fresh.income.spouse,
      other: isValidNonNegativeNumber(incomeBase.other) ? incomeBase.other : fresh.income.other,
    },
    recurring: Array.isArray(base.recurring) ? base.recurring : fresh.recurring,
    oneOff: Array.isArray(base.oneOff) ? base.oneOff : fresh.oneOff,
    allocationPct: isValidAllocationPct(base.allocationPct) ? base.allocationPct : fresh.allocationPct,
    goals: Array.isArray(base.goals) ? base.goals : fresh.goals,
    actuals: Array.isArray(base.actuals) ? base.actuals : fresh.actuals,
  };
}

// ---------- חודשים ----------
/** "YYYY-MM" + n חודשים (יכול להיות שלילי). לא תלוי ב-Date/אזור זמן — חשבון שלם טהור. */
export function addMonths(ym, n) {
  if (!isValidMonth(ym)) return null;
  const [y, m] = ym.split("-").map(Number);
  const total = y * 12 + (m - 1) + Math.trunc(n || 0);
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

/** רשימת "YYYY-MM" מ-startMonth ועד horizonMonths חודשים (כולל startMonth). */
export function monthsOf(startMonth, horizonMonths = DEFAULT_HORIZON_MONTHS) {
  if (!isValidMonth(startMonth) || !(horizonMonths > 0)) return [];
  return Array.from({ length: Math.trunc(horizonMonths) }, (_, i) => addMonths(startMonth, i));
}

// ---------- עדכוני מצב (setup) ----------
export function setStartMonth(state, month) {
  if (!isValidMonth(month)) return state;
  return { ...state, startMonth: month };
}
export function setHorizonMonths(state, n) {
  if (!(typeof n === "number" && Number.isInteger(n) && n > 0)) return state;
  return { ...state, horizonMonths: n };
}
export function setIncome(state, field, value) {
  if (!["mine", "spouse", "other"].includes(field) || !isValidNonNegativeNumber(value)) return state;
  return { ...state, income: { ...state.income, [field]: value } };
}
export function setAllocationPct(state, pct) {
  if (!isValidAllocationPct(pct)) return state;
  return { ...state, allocationPct: pct };
}

// ---------- הכנסות/הוצאות חוזרות וחד-פעמיות ----------
export function addRecurring(state, { label, amount, kind, startMonth, endMonth = null } = {}) {
  if (!isValidName(label) || !isValidPositiveNumber(amount) || !RECURRING_KINDS.includes(kind) || !isValidMonth(startMonth)) return state;
  if (endMonth != null && (!isValidMonth(endMonth) || endMonth < startMonth)) return state;
  const item = { id: uid(), label: norm(label), amount, kind, startMonth, endMonth: endMonth || null };
  return { ...state, recurring: [...(state.recurring || []), item] };
}
export function updateRecurring(state, id, patch) {
  const idx = (state.recurring || []).findIndex(r => r.id === id);
  if (idx === -1) return state;
  const cur = state.recurring[idx];
  const next = { ...cur, ...patch };
  if (!isValidName(next.label) || !isValidPositiveNumber(next.amount) || !RECURRING_KINDS.includes(next.kind) || !isValidMonth(next.startMonth)) return state;
  if (next.endMonth != null && (!isValidMonth(next.endMonth) || next.endMonth < next.startMonth)) return state;
  const recurring = state.recurring.slice();
  recurring[idx] = { ...next, label: norm(next.label), endMonth: next.endMonth || null };
  return { ...state, recurring };
}
export function removeRecurring(state, id) {
  if (!(state.recurring || []).some(r => r.id === id)) return state;
  return { ...state, recurring: state.recurring.filter(r => r.id !== id) };
}

export function addOneOff(state, { label, amount, month, kind } = {}) {
  if (!isValidName(label) || !isValidPositiveNumber(amount) || !isValidMonth(month) || !RECURRING_KINDS.includes(kind)) return state;
  const item = { id: uid(), label: norm(label), amount, month, kind };
  return { ...state, oneOff: [...(state.oneOff || []), item] };
}
export function updateOneOff(state, id, patch) {
  const idx = (state.oneOff || []).findIndex(o => o.id === id);
  if (idx === -1) return state;
  const next = { ...state.oneOff[idx], ...patch };
  if (!isValidName(next.label) || !isValidPositiveNumber(next.amount) || !isValidMonth(next.month) || !RECURRING_KINDS.includes(next.kind)) return state;
  const oneOff = state.oneOff.slice();
  oneOff[idx] = { ...next, label: norm(next.label) };
  return { ...state, oneOff };
}
export function removeOneOff(state, id) {
  if (!(state.oneOff || []).some(o => o.id === id)) return state;
  return { ...state, oneOff: state.oneOff.filter(o => o.id !== id) };
}

// ---------- יעדים ----------
export function addGoal(state, { label, targetAmount, targetMonth } = {}) {
  if (!isValidName(label) || !isValidPositiveNumber(targetAmount) || !isValidMonth(targetMonth)) return state;
  const goal = { id: uid(), label: norm(label), targetAmount, targetMonth };
  return { ...state, goals: [...(state.goals || []), goal] };
}
export function updateGoal(state, id, patch) {
  const idx = (state.goals || []).findIndex(g => g.id === id);
  if (idx === -1) return state;
  const next = { ...state.goals[idx], ...patch };
  if (!isValidName(next.label) || !isValidPositiveNumber(next.targetAmount) || !isValidMonth(next.targetMonth)) return state;
  const goals = state.goals.slice();
  goals[idx] = { ...next, label: norm(next.label) };
  return { ...state, goals };
}
export function removeGoal(state, id) {
  if (!(state.goals || []).some(g => g.id === id)) return state;
  return { ...state, goals: state.goals.filter(g => g.id !== id) };
}

// ---------- ביצוע בפועל (actuals) ----------
/** רישום/עדכון ביצוע בפועל לחודש נתון (upsert לפי month). מספרים שליליים/לא תקינים לא נשמרים. */
export function recordActual(state, { month, income, expenses, invested } = {}) {
  if (!isValidMonth(month) || !isValidNonNegativeNumber(income) || !isValidNonNegativeNumber(expenses) || !isValidNonNegativeNumber(invested)) return state;
  const actuals = state.actuals || [];
  const idx = actuals.findIndex(a => a.month === month);
  const entry = { month, income, expenses, invested };
  if (idx === -1) return { ...state, actuals: [...actuals, entry] };
  const next = actuals.slice();
  next[idx] = entry;
  return { ...state, actuals: next };
}
export function removeActual(state, month) {
  if (!(state.actuals || []).some(a => a.month === month)) return state;
  return { ...state, actuals: state.actuals.filter(a => a.month !== month) };
}
export const actualForMonth = (state, month) => (state.actuals || []).find(a => a.month === month) || null;

// ---------- תחזית מתוכננת (planned projection) ----------
const isActiveRecurring = (item, month) => item.startMonth <= month && (!item.endMonth || month <= item.endMonth);
const sumRecurring = (list, month, kind) => (list || []).filter(i => i.kind === kind && isActiveRecurring(i, month)).reduce((s, i) => s + (i.amount || 0), 0);
const sumOneOff = (list, month, kind) => (list || []).filter(i => i.kind === kind && i.month === month).reduce((s, i) => s + (i.amount || 0), 0);

/** הכנסה מתוכננת לחודש: בסיס (income.mine+spouse+other) + חוזרות + חד-פעמיות, מסוג income. */
export function plannedIncomeForMonth(state, month) {
  const base = (state.income?.mine || 0) + (state.income?.spouse || 0) + (state.income?.other || 0);
  return round2(base + sumRecurring(state.recurring, month, "income") + sumOneOff(state.oneOff, month, "income"));
}

/**
 * הוצאה מתוכננת לחודש: חוזרות + חד-פעמיות מסוג expense, ובנוסף (אופציונלי) החזר משכנתא
 * מ-lib/coreFacts.js — מועבר כפרמטר mortgageMonthly על ידי הרכיב, לא נקרא מכאן ישירות
 * (ראה הסבר בראש הקובץ). frozen (הקפאת משכנתא במילואים) הוא שיקול של הרכיב: אם רוצים
 * "בלי משכנתא" באותו חודש, פשוט מעבירים mortgageMonthly=0.
 */
export function plannedExpensesForMonth(state, month, { mortgageMonthly = 0 } = {}) {
  const mortgage = isValidNonNegativeNumber(mortgageMonthly) ? mortgageMonthly : 0;
  return round2(sumRecurring(state.recurring, month, "expense") + sumOneOff(state.oneOff, month, "expense") + mortgage);
}

/**
 * תחזית מלאה ל-horizonMonths חודשים: לכל חודש — הכנסה, הוצאה, מזומן פנוי, כמה הושקע החודש
 * (לעולם לא שלילי — חודש עם מזומן פנוי שלילי משקיע 0, לא "לווה" מההשקעה), השקעה מצטברת,
 * ושווי נכסים מתוכנן מצטבר (מתחיל מ-seedAssetsTotal, אם סופק — למשל assetsTotal(kesef) הנוכחי).
 */
export function projectPlan(state, { mortgageMonthly = 0, seedAssetsTotal = 0 } = {}) {
  const months = monthsOf(state.startMonth, state.horizonMonths);
  const allocationPct = isValidAllocationPct(state.allocationPct) ? state.allocationPct : 0;
  let cumulativeInvested = 0;
  let projectedAssets = isValidNonNegativeNumber(seedAssetsTotal) ? seedAssetsTotal : 0;
  return months.map(month => {
    const income = plannedIncomeForMonth(state, month);
    const expenses = plannedExpensesForMonth(state, month, { mortgageMonthly });
    const freeCash = round2(income - expenses);
    const investedThisMonth = round2(Math.max(0, freeCash) * (allocationPct / 100));
    cumulativeInvested = round2(cumulativeInvested + investedThisMonth);
    projectedAssets = round2(projectedAssets + investedThisMonth);
    return { month, income, expenses, freeCash, investedThisMonth, cumulativeInvested, projectedAssets };
  });
}

// ---------- תחזית מול ביצוע ----------
/**
 * סטיית שדה בודד (income/expenses/invested) בחודש עם actuals. planned=0 ו-actual!=0 הוא מקרה
 * מיוחד (אין בסיס לאחוז) — עדיין מסומן כחריגה (noBaseline), בלי "לבדות" אחוז. אחרת: חריגה רק
 * אם |deviationPercent| >= thresholdPercent. מתחת לסף — לא מוחזר כלום (אין התראה).
 */
function fieldDeviation(field, planned, actual, thresholdPercent) {
  const p = planned || 0, a = actual || 0;
  const diff = round2(a - p);
  if (diff === 0) return null;
  const noBaseline = p === 0 && a !== 0;
  const deviationPercent = p !== 0 ? Math.round((diff / p) * 100) : null;
  const isDeviation = noBaseline || (deviationPercent != null && Math.abs(deviationPercent) >= thresholdPercent);
  if (!isDeviation) return null;
  const label = FIELD_LABELS[field];
  const dir = diff >= 0 ? "יותר" : "פחות";
  const message = noBaseline
    ? `${label} בפועל בחודש הזה: ${ils(a)}, בלי שום תכנון מקביל (0 מתוכנן).`
    : `${label} בפועל (${ils(a)}) שונה ב-${Math.abs(deviationPercent)}% ${dir} מהמתוכנן (${ils(p)}).`;
  return { field, plannedValue: p, actualValue: a, deviationPercent, message };
}

/**
 * מצב חודש בודד: תכנון מול ביצוע. חודש בלי רשומת actuals: hasActuals=false, בלי אף חישוב סטייה
 * (message=INSUFFICIENT_DATA) — תכנון בלבד, לעולם לא "מדווח" כביצוע.
 */
export function monthStatus(plannedRow, actualEntry, { thresholdPercent = DEVIATION_THRESHOLD_PERCENT } = {}) {
  const planned = { income: plannedRow.income, expenses: plannedRow.expenses, invested: plannedRow.investedThisMonth };
  if (!actualEntry) return { month: plannedRow.month, hasActuals: false, planned, actual: null, deviations: [], message: INSUFFICIENT_DATA };
  const actual = { income: actualEntry.income || 0, expenses: actualEntry.expenses || 0, invested: actualEntry.invested || 0 };
  const deviations = ["income", "expenses", "invested"]
    .map(f => fieldDeviation(f, planned[f], actual[f], thresholdPercent))
    .filter(Boolean);
  return { month: plannedRow.month, hasActuals: true, planned, actual, deviations, message: null };
}

/** תחזית מול ביצוע לכל חודשי התכנון (plannedRows מ-projectPlan). */
export function forecastVsActual(state, plannedRows, opts = {}) {
  const byMonth = new Map((state.actuals || []).map(a => [a.month, a]));
  return (plannedRows || []).map(row => monthStatus(row, byMonth.get(row.month) || null, opts));
}

/** התראות חריגה — רק חודשים עם actuals וסטייה מעל הסף. כל התראה כוללת הסבר בעברית. */
export function planAlerts(state, plannedRows, opts = {}) {
  const thresholdPercent = opts.thresholdPercent ?? DEVIATION_THRESHOLD_PERCENT;
  const statuses = forecastVsActual(state, plannedRows, { thresholdPercent });
  return statuses.flatMap(s => s.deviations.map(d => ({
    id: `deviation-${s.month}-${d.field}`,
    month: s.month,
    field: d.field,
    deviationPercent: d.deviationPercent,
    plannedValue: d.plannedValue,
    actualValue: d.actualValue,
    level: (d.deviationPercent == null || Math.abs(d.deviationPercent) >= thresholdPercent * 2) ? "critical" : "warning",
    message: `${s.month}: ${d.message}`,
  })));
}

// ---------- התקדמות ליעדים ----------
/**
 * מצב יעד בודד מול מסלול ה-projectedAssets המתוכנן (ולא רק cumulativeInvested — projectedAssets
 * כולל גם seed, כך שהוא מייצג "כמה כסף בסה"כ" ולא רק "כמה הושקע מהתכנון הזה"). יעד עם targetMonth
 * שאין לו שורה בתחזית (מעבר ל-horizon, או לפני startMonth) מסומן out_of_range במפורש, ולא "מוארך".
 */
export function goalStatus(goal, plannedRows, { tolerancePercent = GOAL_TOLERANCE_PERCENT } = {}) {
  const row = (plannedRows || []).find(r => r.month === goal.targetMonth);
  if (!row) {
    return { id: goal.id, label: goal.label, targetAmount: goal.targetAmount, targetMonth: goal.targetMonth, status: "out_of_range", projected: null, percent: null, message: "מחוץ לטווח התכנון" };
  }
  const projected = row.projectedAssets;
  const ratio = goal.targetAmount > 0 ? projected / goal.targetAmount : 0;
  const percent = Math.round(ratio * 100);
  let status;
  if (ratio >= 1 + tolerancePercent / 100) status = "ahead";
  else if (ratio >= 1 - tolerancePercent / 100) status = "on_track";
  else status = "behind";
  const message = status === "ahead"
    ? `לפני הקצב ליעד "${goal.label}": צפויים ${ils(projected)} מול יעד ${ils(goal.targetAmount)} (${percent}%).`
    : status === "on_track"
      ? `בקצב ליעד "${goal.label}": צפויים ${ils(projected)} מול יעד ${ils(goal.targetAmount)} (${percent}%).`
      : `מאחורי היעד "${goal.label}": צפויים ${ils(projected)} מול יעד ${ils(goal.targetAmount)} (${percent}%).`;
  return { id: goal.id, label: goal.label, targetAmount: goal.targetAmount, targetMonth: goal.targetMonth, status, projected, percent, message };
}

export function goalsProgress(state, plannedRows, opts = {}) {
  return (state.goals || []).map(g => goalStatus(g, plannedRows, opts));
}
