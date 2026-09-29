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
  // תכנון 60 חודשים (Issue #7, P1): מפתח משותף נפרד מ-hq:kesef:v1 (כדי לא לנפח את ה-blob הקיים),
  // אבל אותן בדיוק היכולות כמו שאר "כספים" — אין יכולת RBAC חדשה ואין חבילת role חדשה.
  "hq:kesef:plan:v1": { read: "finance.dashboard_budget.read", write: "finance.dashboard_budget.write" },
  "hq:core:v1": { read: "core.read", write: "core.write" },
  "hq:household:v1": { read: "company.household.read", write: "company.household.write" },
});

const BUDGET_VIEW = ["hq.view", "company.beit-hadash.read", "company.beit-hadash.write", "finance.dashboard_budget.read", "core.read"];

/**
 * חבילות הענקה. A = partner_budget_view, A+ = partner_budget_edit,
 * B = partner_full_finance (רואה את כל הכספים כולל תנועות, קריאה בלבד),
 * B+ = partner_full_finance_edit (B וגם עריכת תקציב ותנועות; ברירת המחדל לליאור, החלטת לירון 21.9.2026).
 */
export const ROLE_TEMPLATES = Object.freeze({
  partner_budget_view: BUDGET_VIEW,
  partner_budget_edit: [...BUDGET_VIEW, "finance.dashboard_budget.write"],
  partner_full_finance: [...BUDGET_VIEW, "finance.transactions.read"],
  partner_full_finance_edit: [...BUDGET_VIEW, "finance.dashboard_budget.write", "finance.transactions.read", "finance.transactions.write"],
  designer_beit_hadash: ["company.beit-hadash.read", "company.beit-hadash.write"],
  // ליאור, "משק בית" (Issue #7, החלטת עמית): מרחב עצמאי, בלי תלות בחבילת הכספים שלה.
  // ניתן להעניק לבד (rbac_approve_member) או בנוסף לחבילת כספים קיימת (rbac_grant לכל יכולת).
  // עדיין שימושית בפני עצמה: חברה עתידית שצריכה רק "משק בית" בלי כספים מקבלת את זה, לא partner_lior.
  partner_household: ["hq.view", "company.household.read", "company.household.write"],
  // partner_lior (Issue #7, בקשת עמית, אישור לירון): חבילה מפורשת אחת = האיחוד (union, בלי כפילויות)
  // של partner_full_finance_edit + partner_household, כדי שאפשר יהיה לאשר את ליאור בקריאה אחת ל-
  // rbac_approve_member במקום שתיים. לא חבילה "אמיתית" חדשה מבחינת יכולות — אותן יכולות בדיוק,
  // רק ממוזגות לשם אחד. שקד (designer_beit_hadash) אף פעם לא מקבלת אף אחת מהיכולות האלה.
  partner_lior: [
    "hq.view",
    "company.beit-hadash.read", "company.beit-hadash.write",
    "finance.dashboard_budget.read", "finance.dashboard_budget.write",
    "finance.transactions.read", "finance.transactions.write",
    "core.read",
    "company.household.read", "company.household.write",
  ],
});

// עדכון החלטה (לירון, 21.9.2026): ליאור חייבת להיות מסוגלת לערוך, לכן ברירת המחדל היא B+ (כספים כולל תנועות, עם עריכה).
// B (partner_full_finance, קריאה בלבד) נשארת חבילה זמינה למי שרק צריך לראות.
export const DEFAULT_PARTNER_TEMPLATE = "partner_full_finance_edit";

/**
 * חברות שיושבות במרחב המשותף, ומה נדרש כדי לראות אותן.
 * health / nefesh / avoda (בריאות, נפשי, קריירה) לא כאן בכוונה: הן אישיות, נשמרות לפי משתמש, ולעולם לא במרחב משותף.
 */
export const SHARED_COMPANY_READ_CAPABILITY = Object.freeze({
  "beit-hadash": "company.beit-hadash.read",
  kesef: "finance.dashboard_budget.read",
  household: "company.household.read",
});
// חברות אישיות (בריאות, נפשי, קריירה): owner בלבד. עדכון החלטה (Issue #7, P0, בקשת עמית, אישור לירון,
// 29.9.2026): בעבר (PR #79/#108) חבר עם hq.view (בפועל: שותפה) ראה אותן כ"מרחב אישי משלו" ריק — פרס
// ניחומים על hq.view, בנפרד מהיכולות/ההרשאות בפועל שלו. זו כבר לא ההחלטה בפועל: ליאור (partner_lior)
// אמורה לראות אך ורק בית חדש, כספים, משק בית ומסך ה-HQ — לא "מרחב ריק" לבריאות/קריירה, ולא בשום צורה
// אחרת. ההצגה נגזרת עכשיו אך ורק מהיכולות/ההרשאות בפועל (ראה visiblePersonalCompanies למטה): חברה
// אישית לא מוצגת לאף חבר במרחב המשותף, כולל שותפה עם hq.view. אם בעתיד תתווסף יכולת ייעודית לחברה
// אישית מסוימת, ההצגה תיגזר ממנה — לא מ-hq.view.
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

/**
 * אילו חברות אישיות מוצגות: owner בלבד (כל PERSONAL_COMPANIES, הנתונים האמיתיים שלו). חבר במרחב
 * המשותף — אף פעם, גם עם hq.view: אין יותר "מרחב ריק" כפרס ניחומים (ראה ההערה מעל PERSONAL_COMPANIES).
 * `grants` נשאר בחתימה לעקביות מול שאר הפונקציות כאן, גם שאינו בשימוש בפועל.
 */
export function visiblePersonalCompanies(grants, { isOwner = false } = {}) { // eslint-disable-line no-unused-vars
  return isOwner ? [...PERSONAL_COMPANIES] : [];
}
