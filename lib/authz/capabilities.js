// מטריצת היכולות בצד הקוד. משמשת את ה-UI (מה להציג) ואת ה-API (בדיקה מוקדמת), **אינה מקור האמת**:
// האכיפה האמיתית היא ה-RLS ב-supabase/proposed/rbac/*.sql. tests/authz-capabilities.test.mjs מוודא שהקבצים האלה זהים
// לבלוקי ה-SEED ב-SQL, כך שאי אפשר לשנות אחד בלי השני.
// הקובץ טהור: אין רשת, אין Supabase, אין מזהי משתמשים.

export const CAPABILITIES = Object.freeze([
  "hq.view",
  "company.beit-hadash.read", "company.beit-hadash.write",
  "finance.dashboard_budget.read", "finance.dashboard_budget.write",
  "finance.transactions.read", "finance.transactions.write",
  "core.read", "core.write",
  // "משק בית" (Issue #7): יכולת נפרדת ועצמאית מבית חדש/כספים בכוונה — זו חברה משלה עם
  // מרחב גישה משלה (לירון + ליאור בלבד, ראה partner_household למטה). לא נכללת אוטומטית
  // בשום חבילת כספים/בית חדש קיימת, ולא מוענקת ל-designer_beit_hadash (שקד).
  "company.household.read", "company.household.write",
]);

/** מפתח מצב (company_key) → היכולות הנדרשות. מפתח שלא מופיע כאן = owner בלבד. */
export const COMPANY_STATE_CAPABILITIES = Object.freeze({
  "hq:beit-hadash:v2": { read: "company.beit-hadash.read", write: "company.beit-hadash.write" },
  "hq:kesef:v1": { read: "finance.dashboard_budget.read", write: "finance.dashboard_budget.write" },
  "hq:kesef-transactions:v1": { read: "finance.transactions.read", write: "finance.transactions.write" },
  "hq:core:v1": { read: "core.read", write: "core.write" },
  "hq:household:v1": { read: "company.household.read", write: "company.household.write" },
});

const BUDGET_VIEW = ["hq.view", "company.beit-hadash.read", "company.beit-hadash.write", "finance.dashboard_budget.read", "core.read"];

/**
 * חבילות הענקה. A = partner_budget_view, A+ = partner_budget_edit,
 * B = partner_full_finance (ברירת המחדל לליאור, החלטת לירון 21.9.2026: רואה את כל הכספים, קריאה בלבד),
 * B+ = partner_full_finance_edit (B וגם עריכת תקציב ותנועות).
 */
export const ROLE_TEMPLATES = Object.freeze({
  partner_budget_view: BUDGET_VIEW,
  partner_budget_edit: [...BUDGET_VIEW, "finance.dashboard_budget.write"],
  partner_full_finance: [...BUDGET_VIEW, "finance.transactions.read"],
  partner_full_finance_edit: [...BUDGET_VIEW, "finance.dashboard_budget.write", "finance.transactions.read", "finance.transactions.write"],
  designer_beit_hadash: ["company.beit-hadash.read", "company.beit-hadash.write"],
  // ליאור, "משק בית" (Issue #7, החלטת עמית): מרחב עצמאי, בלי תלות בחבילת הכספים שלה.
  // ניתן להעניק לבד (rbac_approve_member) או בנוסף לחבילת כספים קיימת (rbac_grant לכל יכולת).
  partner_household: ["hq.view", "company.household.read", "company.household.write"],
});

export const DEFAULT_PARTNER_TEMPLATE = "partner_full_finance";

/**
 * חברות שיושבות במרחב המשותף, ומה נדרש כדי לראות אותן.
 * health / nefesh / avoda (בריאות, נפשי, קריירה) לא כאן בכוונה: הן אישיות, נשמרות לפי משתמש, ולעולם לא במרחב משותף.
 */
export const SHARED_COMPANY_READ_CAPABILITY = Object.freeze({
  "beit-hadash": "company.beit-hadash.read",
  kesef: "finance.dashboard_budget.read",
  household: "company.household.read",
});
export const PERSONAL_COMPANIES = Object.freeze(["health", "nefesh", "avoda"]);

export function capabilitiesForTemplate(name) {
  const caps = ROLE_TEMPLATES[name];
  if (!caps) throw new Error(`unknown role template: ${name}`);
  return [...caps];
}

/** grants: מערך/Set של מפתחות יכולת פעילים של המשתמש במרחב. owner מקבל הכול. */
export function can(grants, capability, { isOwner = false } = {}) {
  if (isOwner) return true;
  return new Set(grants || []).has(capability);
}

export function canAccessStateKey(grants, key, { write = false, isOwner = false } = {}) {
  if (isOwner) return true;
  const need = COMPANY_STATE_CAPABILITIES[key];
  return !!need && can(grants, write ? need.write : need.read);
}

/** אילו חברות משותפות להציג. חברות אישיות אינן חלק מזה: הן תמיד של המשתמש עצמו. */
export function visibleSharedCompanies(grants, { isOwner = false } = {}) {
  return Object.entries(SHARED_COMPANY_READ_CAPABILITY).filter(([, cap]) => can(grants, cap, { isOwner })).map(([slug]) => slug);
}

/** האם להציג את מסך ה-HQ. זה שער תצוגה בלבד; הנתונים עצמם מוגנים לפי היכולות של כל חברה. */
export function canViewHq(grants, { isOwner = false } = {}) {
  return can(grants, "hq.view", { isOwner });
}

/** רמת הגישה לכספים, לתצוגה בלבד: none | dashboard_budget | full. */
export function financeLevel(grants, { isOwner = false } = {}) {
  if (can(grants, "finance.transactions.read", { isOwner })) return "full";
  if (can(grants, "finance.dashboard_budget.read", { isOwner })) return "dashboard_budget";
  return "none";
}
