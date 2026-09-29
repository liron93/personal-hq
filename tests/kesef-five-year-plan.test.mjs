import assert from "node:assert/strict";
import test from "node:test";

const plan = await import("../companies/kesef/five-year-plan-model.js");
const authz = await import("../lib/authz/capabilities.js");

const {
  DEFAULT_HORIZON_MONTHS, DEVIATION_THRESHOLD_PERCENT, GOAL_TOLERANCE_PERCENT, INSUFFICIENT_DATA,
  createPlanState, ensurePlanState, addMonths, monthsOf,
  setStartMonth, setHorizonMonths, setIncome, setAllocationPct,
  addRecurring, updateRecurring, removeRecurring, addOneOff, updateOneOff, removeOneOff,
  addGoal, updateGoal, removeGoal, recordActual, removeActual, actualForMonth,
  plannedIncomeForMonth, plannedExpensesForMonth, projectPlan,
  monthStatus, forecastVsActual, planAlerts, goalStatus, goalsProgress,
  isValidName, isValidPositiveNumber, isValidNonNegativeNumber, isValidMonth, isValidAllocationPct,
} = plan;

// FIXTURES: מספרים עגולים ובדויים לגמרי בכוונה — לעולם לא המספרים האמיתיים מ-lib/coreFacts.js.
const FAKE_MINE = 10000, FAKE_SPOUSE = 8000, FAKE_MORTGAGE = 2000;

// ---------- חודשים ----------
test("addMonths: חשבון חודשים תקין כולל מעבר שנה, בלי תלות ב-Date/אזור זמן", () => {
  assert.equal(addMonths("2026-01", 0), "2026-01");
  assert.equal(addMonths("2026-01", 11), "2026-12");
  assert.equal(addMonths("2026-01", 12), "2027-01");
  assert.equal(addMonths("2026-06", 7), "2027-01");
  assert.equal(addMonths("not-a-month", 1), null);
});

test("monthsOf: מייצר horizonMonths חודשים החל מ-startMonth, ברירת מחדל 60", () => {
  const months = monthsOf("2026-01", DEFAULT_HORIZON_MONTHS);
  assert.equal(months.length, 60);
  assert.equal(months[0], "2026-01");
  assert.equal(months[59], "2030-12");
  assert.deepEqual(monthsOf("bad", 60), []);
  assert.deepEqual(monthsOf("2026-01", 0), []);
});

// ---------- מצב: יצירה / תאימות אחורה ----------
test("createPlanState: ברירות מחדל בטוחות", () => {
  const s = createPlanState();
  assert.equal(s.horizonMonths, 60);
  assert.deepEqual(s.income, { mine: 0, spouse: 0, other: 0 });
  assert.deepEqual(s.recurring, []);
  assert.deepEqual(s.oneOff, []);
  assert.equal(s.allocationPct, 0);
  assert.deepEqual(s.goals, []);
  assert.deepEqual(s.actuals, []);
  assert.ok(isValidMonth(s.startMonth));
});

test("ensurePlanState: תאימות אחורה — state ריק/חלקי/ישן מקבל ברירות מחדל בלי לקרוס", () => {
  const fromUndefined = ensurePlanState(undefined);
  assert.ok(isValidMonth(fromUndefined.startMonth));
  assert.equal(fromUndefined.horizonMonths, 60);
  const fromNull = ensurePlanState(null);
  assert.deepEqual(fromNull.income, { mine: 0, spouse: 0, other: 0 });
  assert.deepEqual(fromNull.recurring, []);
  assert.equal(fromNull.horizonMonths, 60);

  const old = { startMonth: "2026-01", income: { mine: FAKE_MINE } }; // בלי spouse/other/recurring/oneOff/allocationPct/goals/actuals
  const fixed = ensurePlanState(old);
  assert.equal(fixed.startMonth, "2026-01");
  assert.equal(fixed.income.mine, FAKE_MINE);
  assert.equal(fixed.income.spouse, 0);
  assert.equal(fixed.income.other, 0);
  assert.deepEqual(fixed.recurring, []);
  assert.deepEqual(fixed.oneOff, []);
  assert.deepEqual(fixed.goals, []);
  assert.deepEqual(fixed.actuals, []);
  assert.equal(fixed.allocationPct, 0);
  assert.equal(fixed.horizonMonths, 60);
});

test("ensurePlanState: state תקין ושלם מוחזר כמות שהוא (אותו reference)", () => {
  const full = createPlanState();
  assert.equal(ensurePlanState(full), full);
});

// ---------- ולידציה ----------
test("ולידציה: דוחה מספרים שליליים/לא-מספריים, אחוז הקצאה מחוץ לטווח, חודש לא בפורמט YYYY-MM", () => {
  assert.equal(isValidPositiveNumber(-1), false);
  assert.equal(isValidPositiveNumber("100"), false);
  assert.equal(isValidPositiveNumber(NaN), false);
  assert.equal(isValidPositiveNumber(100), true);
  assert.equal(isValidNonNegativeNumber(0), true);
  assert.equal(isValidNonNegativeNumber(-0.01), false);
  assert.equal(isValidAllocationPct(-1), false);
  assert.equal(isValidAllocationPct(101), false);
  assert.equal(isValidAllocationPct(0), true);
  assert.equal(isValidAllocationPct(100), true);
  assert.equal(isValidMonth("2026-13"), false);
  assert.equal(isValidMonth("2026-00"), false);
  assert.equal(isValidMonth("2026-1"), false);
  assert.equal(isValidMonth("26-01"), false);
  assert.equal(isValidMonth("2026-01"), true);
  assert.equal(isValidName(""), false);
  assert.equal(isValidName("   "), false);
});

test("setIncome/setAllocationPct/setStartMonth/setHorizonMonths: קלט לא תקין לא משנה כלום", () => {
  const s0 = createPlanState();
  assert.equal(setIncome(s0, "mine", -5), s0);
  assert.equal(setIncome(s0, "unknownField", 100), s0);
  assert.equal(setAllocationPct(s0, 150), s0);
  assert.equal(setAllocationPct(s0, -1), s0);
  assert.equal(setStartMonth(s0, "bad-month"), s0);
  assert.equal(setHorizonMonths(s0, 0), s0);
  assert.equal(setHorizonMonths(s0, 1.5), s0);

  const s1 = setIncome(s0, "mine", FAKE_MINE);
  assert.equal(s1.income.mine, FAKE_MINE);
  const s2 = setAllocationPct(s1, 40);
  assert.equal(s2.allocationPct, 40);
});

test("addRecurring/addOneOff/addGoal: דוחים שם ריק/סכום שלילי/kind לא תקין/חודש לא תקין", () => {
  const s0 = createPlanState();
  assert.equal(addRecurring(s0, { label: "", amount: 100, kind: "income", startMonth: "2026-01" }), s0);
  assert.equal(addRecurring(s0, { label: "שכירות", amount: -100, kind: "expense", startMonth: "2026-01" }), s0);
  assert.equal(addRecurring(s0, { label: "שכירות", amount: 100, kind: "not-a-kind", startMonth: "2026-01" }), s0);
  assert.equal(addRecurring(s0, { label: "שכירות", amount: 100, kind: "expense", startMonth: "bad" }), s0);
  assert.equal(addRecurring(s0, { label: "שכירות", amount: 100, kind: "expense", startMonth: "2026-06", endMonth: "2026-01" }), s0); // endMonth < startMonth

  assert.equal(addOneOff(s0, { label: "", amount: 100, month: "2026-01", kind: "income" }), s0);
  assert.equal(addOneOff(s0, { label: "בונוס", amount: 100, month: "bad", kind: "income" }), s0);

  assert.equal(addGoal(s0, { label: "", targetAmount: 1000, targetMonth: "2026-01" }), s0);
  assert.equal(addGoal(s0, { label: "יעד", targetAmount: -1, targetMonth: "2026-01" }), s0);
  assert.equal(addGoal(s0, { label: "יעד", targetAmount: 1000, targetMonth: "bad" }), s0);

  assert.equal(recordActual(s0, { month: "2026-01", income: -1, expenses: 0, invested: 0 }), s0);
});

test("addRecurring/updateRecurring/removeRecurring: מחזור חיים מלא", () => {
  let s = createPlanState();
  s = addRecurring(s, { label: "שכר דירה מהשקעה", amount: 1500, kind: "income", startMonth: "2026-01", endMonth: "2026-12" });
  assert.equal(s.recurring.length, 1);
  const id = s.recurring[0].id;
  s = updateRecurring(s, id, { amount: 1800 });
  assert.equal(s.recurring[0].amount, 1800);
  assert.equal(updateRecurring(s, id, { amount: -1 }), s); // ולידציה גם בעדכון
  assert.equal(updateRecurring(s, "no-such-id", { amount: 1 }), s);
  s = removeRecurring(s, id);
  assert.deepEqual(s.recurring, []);
});

test("addOneOff/updateOneOff/removeOneOff ו-addGoal/updateGoal/removeGoal: מחזור חיים מלא", () => {
  let s = createPlanState();
  s = addOneOff(s, { label: "מענק חד פעמי", amount: 5000, month: "2026-03", kind: "income" });
  const oid = s.oneOff[0].id;
  s = updateOneOff(s, oid, { amount: 6000 });
  assert.equal(s.oneOff[0].amount, 6000);
  s = removeOneOff(s, oid);
  assert.deepEqual(s.oneOff, []);

  s = addGoal(s, { label: "קרן חירום", targetAmount: 50000, targetMonth: "2027-01" });
  const gid = s.goals[0].id;
  s = updateGoal(s, gid, { targetAmount: 60000 });
  assert.equal(s.goals[0].targetAmount, 60000);
  assert.equal(updateGoal(s, gid, { targetAmount: -1 }), s);
  s = removeGoal(s, gid);
  assert.deepEqual(s.goals, []);
});

test("recordActual: upsert לפי חודש, removeActual, actualForMonth", () => {
  let s = createPlanState();
  s = recordActual(s, { month: "2026-01", income: FAKE_MINE, expenses: 5000, invested: 1000 });
  assert.equal(s.actuals.length, 1);
  s = recordActual(s, { month: "2026-01", income: FAKE_MINE, expenses: 5500, invested: 1000 }); // עדכון אותו חודש
  assert.equal(s.actuals.length, 1);
  assert.equal(s.actuals[0].expenses, 5500);
  assert.deepEqual(actualForMonth(s, "2026-01"), s.actuals[0]);
  assert.equal(actualForMonth(s, "2026-02"), null);
  s = removeActual(s, "2026-01");
  assert.deepEqual(s.actuals, []);
});

// ---------- תחזית מתוכננת ----------
test("plannedIncomeForMonth/plannedExpensesForMonth: בסיס + חוזרות + חד-פעמיות פעילות בחודש בלבד", () => {
  let s = createPlanState();
  s = setIncome(s, "mine", FAKE_MINE);
  s = setIncome(s, "spouse", FAKE_SPOUSE);
  s = addRecurring(s, { label: "שכ״ד נכס", amount: 1500, kind: "income", startMonth: "2026-03", endMonth: "2026-05" });
  s = addOneOff(s, { label: "בונוס", amount: 3000, month: "2026-03", kind: "income" });
  s = addRecurring(s, { label: "ביטוח", amount: 500, kind: "expense", startMonth: "2026-01" });

  assert.equal(plannedIncomeForMonth(s, "2026-01"), FAKE_MINE + FAKE_SPOUSE); // אין עדיין recurring/oneOff פעילים
  assert.equal(plannedIncomeForMonth(s, "2026-03"), FAKE_MINE + FAKE_SPOUSE + 1500 + 3000); // recurring + oneOff באותו חודש
  assert.equal(plannedIncomeForMonth(s, "2026-04"), FAKE_MINE + FAKE_SPOUSE + 1500); // recurring ממשיך, oneOff לא
  assert.equal(plannedIncomeForMonth(s, "2026-06"), FAKE_MINE + FAKE_SPOUSE); // recurring הסתיים ב-05

  assert.equal(plannedExpensesForMonth(s, "2026-01"), 500);
  assert.equal(plannedExpensesForMonth(s, "2026-01", { mortgageMonthly: FAKE_MORTGAGE }), 500 + FAKE_MORTGAGE);
  assert.equal(plannedExpensesForMonth(s, "2026-01", { mortgageMonthly: -100 }), 500); // משכנתה לא תקינה מתעלמת
});

test("projectPlan: הכנסה-הוצאה-מזומן-פנוי-השקעה, כולל חודש עם מזומן פנוי שלילי שמשקיע 0", () => {
  let s = createPlanState();
  s = setStartMonth(s, "2026-01");
  s = setHorizonMonths(s, 3);
  s = setIncome(s, "mine", FAKE_MINE); // 10,000
  s = setAllocationPct(s, 50);
  s = addRecurring(s, { label: "הוצאות קבועות", amount: 7000, kind: "expense", startMonth: "2026-01" });
  s = addOneOff(s, { label: "תיקון גדול", amount: 20000, month: "2026-02", kind: "expense" }); // הופך את פברואר להפסד

  const rows = projectPlan(s, { mortgageMonthly: FAKE_MORTGAGE, seedAssetsTotal: 100000 });
  assert.equal(rows.length, 3);

  const jan = rows[0];
  assert.equal(jan.month, "2026-01");
  assert.equal(jan.income, FAKE_MINE);
  assert.equal(jan.expenses, 7000 + FAKE_MORTGAGE); // 9000
  assert.equal(jan.freeCash, FAKE_MINE - (7000 + FAKE_MORTGAGE)); // 1000
  assert.equal(jan.investedThisMonth, 500); // 50% מ-1000
  assert.equal(jan.cumulativeInvested, 500);
  assert.equal(jan.projectedAssets, 100500);

  const feb = rows[1];
  assert.equal(feb.income, FAKE_MINE);
  assert.equal(feb.expenses, 7000 + 20000 + FAKE_MORTGAGE); // 29000
  assert.equal(feb.freeCash, FAKE_MINE - (7000 + 20000 + FAKE_MORTGAGE)); // שלילי: -19000
  assert.equal(feb.investedThisMonth, 0); // לעולם לא משקיעים שלילי
  assert.equal(feb.cumulativeInvested, 500); // לא זז מינואר
  assert.equal(feb.projectedAssets, 100500); // לא זז

  const mar = rows[2];
  assert.equal(mar.investedThisMonth, 500);
  assert.equal(mar.cumulativeInvested, 1000);
  assert.equal(mar.projectedAssets, 101000);
});

test("projectPlan: allocationPct=0/state לא תקין לא קורס, seedAssetsTotal ברירת מחדל 0", () => {
  const rows = projectPlan(createPlanState());
  assert.equal(rows.length, 60);
  assert.equal(rows[0].investedThisMonth, 0);
  assert.equal(rows[0].projectedAssets, 0);
});

// ---------- תחזית מול ביצוע ----------
test("forecastVsActual: חודש בלי actuals הוא 'אין עדיין נתוני ביצוע' בלבד, בלי אף סטייה", () => {
  let s = createPlanState();
  s = setStartMonth(s, "2026-01"); s = setHorizonMonths(s, 2); s = setIncome(s, "mine", FAKE_MINE);
  const rows = projectPlan(s);
  const statuses = forecastVsActual(s, rows);
  assert.equal(statuses.length, 2);
  assert.equal(statuses[0].hasActuals, false);
  assert.equal(statuses[0].message, INSUFFICIENT_DATA);
  assert.deepEqual(statuses[0].deviations, []);
  assert.equal(planAlerts(s, rows).length, 0);
});

test("forecastVsActual/planAlerts: סטייה מעל הסף מסומנת עם הודעה בעברית, מתחת לסף לא", () => {
  let s = createPlanState();
  s = setStartMonth(s, "2026-01"); s = setHorizonMonths(s, 1);
  s = setIncome(s, "mine", 10000); // הכנסה מתוכננת = 10,000
  s = addRecurring(s, { label: "קבועות", amount: 4000, kind: "expense", startMonth: "2026-01" }); // הוצאה מתוכננת = 4,000
  s = setAllocationPct(s, 50); // מזומן פנוי 6,000 -> משקיע 3,000
  // ביצוע בפועל: הכנסה 8,000 (סטייה -20%, מעל סף 15%), הוצאות 4,100 (סטייה 2.5%, מתחת לסף), השקעה 3,000 (0%)
  s = recordActual(s, { month: "2026-01", income: 8000, expenses: 4100, invested: 3000 });

  const rows = projectPlan(s);
  const statuses = forecastVsActual(s, rows);
  const jan = statuses[0];
  assert.equal(jan.hasActuals, true);
  assert.equal(jan.deviations.length, 1);
  assert.equal(jan.deviations[0].field, "income");
  assert.equal(jan.deviations[0].deviationPercent, -20);
  assert.match(jan.deviations[0].message, /הכנסה/);
  assert.match(jan.deviations[0].message, /%/);

  const alerts = planAlerts(s, rows);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].field, "income");
  assert.equal(alerts[0].level, "warning"); // |−20| < 2*15
  assert.match(alerts[0].message, /2026-01/);
});

test("planAlerts: סטייה גדולה מאוד (מעל פי 2 מהסף) מסומנת critical, ו-noBaseline (מתוכנן 0, בפועל לא 0) תמיד מסומן", () => {
  let s = createPlanState();
  s = setStartMonth(s, "2026-01"); s = setHorizonMonths(s, 1);
  s = setIncome(s, "mine", 10000); // מתוכנן: הכנסה 10,000, השקעה 0 (allocationPct=0)
  s = recordActual(s, { month: "2026-01", income: 2000, expenses: 0, invested: 500 }); // הכנסה: סטייה -80% (critical), השקעה: 0 מתוכנן, 500 בפועל -> noBaseline

  const rows = projectPlan(s);
  const alerts = planAlerts(s, rows);
  const income = alerts.find(a => a.field === "income");
  const invested = alerts.find(a => a.field === "invested");
  assert.equal(income.level, "critical");
  assert.equal(invested.deviationPercent, null);
  assert.match(invested.message, /בלי שום תכנון מקביל/);
});

test("threshold מותאם אישית (thresholdPercent) משפיע על מה שמסומן כחריגה", () => {
  let s = createPlanState();
  s = setStartMonth(s, "2026-01"); s = setHorizonMonths(s, 1);
  s = setIncome(s, "mine", 10000);
  s = recordActual(s, { month: "2026-01", income: 9000, expenses: 0, invested: 0 }); // סטייה -10%
  const rows = projectPlan(s);
  assert.equal(planAlerts(s, rows, { thresholdPercent: 15 }).length, 0); // מתחת לסף הרגיל
  assert.equal(planAlerts(s, rows, { thresholdPercent: 5 }).length, 1); // מעל סף מחמיר יותר
});

// ---------- התקדמות ליעדים ----------
test("goalStatus: ahead / on_track / behind / out_of_range", () => {
  let s = createPlanState();
  s = setStartMonth(s, "2026-01"); s = setHorizonMonths(s, 12);
  s = setIncome(s, "mine", 10000);
  s = setAllocationPct(s, 100); // כל המזומן הפנוי מושקע, כדי שיהיה קל לחשב
  const rows = projectPlan(s, { seedAssetsTotal: 0 }); // 10,000/חודש מושקע, בלי הוצאות: אחרי 12 חודש = 120,000

  const ahead = goalStatus({ id: "1", label: "יעד קל", targetAmount: 50000, targetMonth: "2026-12" }, rows);
  assert.equal(ahead.status, "ahead");
  assert.match(ahead.message, /לפני הקצב/);

  const onTrack = goalStatus({ id: "2", label: "יעד מדויק", targetAmount: 120000, targetMonth: "2026-12" }, rows);
  assert.equal(onTrack.status, "on_track");

  const behind = goalStatus({ id: "3", label: "יעד גבוה", targetAmount: 500000, targetMonth: "2026-12" }, rows);
  assert.equal(behind.status, "behind");
  assert.match(behind.message, /מאחורי היעד/);

  const outOfRange = goalStatus({ id: "4", label: "יעד רחוק", targetAmount: 100000, targetMonth: "2031-01" }, rows);
  assert.equal(outOfRange.status, "out_of_range");
  assert.equal(outOfRange.projected, null);
  assert.equal(outOfRange.message, "מחוץ לטווח התכנון");
});

test("goalsProgress: מרכז את כל היעדים של ה-state יחד", () => {
  let s = createPlanState();
  s = setStartMonth(s, "2026-01"); s = setHorizonMonths(s, 6);
  s = setIncome(s, "mine", 10000); s = setAllocationPct(s, 100);
  s = addGoal(s, { label: "א", targetAmount: 1000, targetMonth: "2026-03" });
  s = addGoal(s, { label: "ב", targetAmount: 1000, targetMonth: "2099-01" }); // מחוץ לטווח
  const rows = projectPlan(s);
  const progress = goalsProgress(s, rows);
  assert.equal(progress.length, 2);
  assert.equal(progress[1].status, "out_of_range");
});

// ---------- חיווט RBAC ----------
test("hq:kesef:plan:v1 ממופה בדיוק לאותן יכולות כמו hq:kesef:v1 (finance.dashboard_budget), בלי יכולת חדשה", () => {
  const key = "hq:kesef:plan:v1";
  assert.deepEqual(authz.COMPANY_STATE_CAPABILITIES[key], authz.COMPANY_STATE_CAPABILITIES["hq:kesef:v1"]);
  assert.deepEqual(authz.COMPANY_STATE_CAPABILITIES[key], { read: "finance.dashboard_budget.read", write: "finance.dashboard_budget.write" });

  const liorEdit = authz.capabilitiesForTemplate("partner_full_finance_edit");
  assert.equal(authz.canAccessStateKey(liorEdit, key), true);
  assert.equal(authz.canAccessStateKey(liorEdit, key, { write: true }), true);

  const liorReadOnly = authz.capabilitiesForTemplate("partner_full_finance");
  assert.equal(authz.canAccessStateKey(liorReadOnly, key), true);
  assert.equal(authz.canAccessStateKey(liorReadOnly, key, { write: true }), false);

  const shaked = authz.capabilitiesForTemplate("designer_beit_hadash");
  assert.equal(authz.canAccessStateKey(shaked, key), false);
  assert.equal(authz.canAccessStateKey(shaked, key, { write: true }), false);
});
