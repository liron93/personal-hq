import assert from "node:assert/strict";
import test from "node:test";

const grocery = await import("../companies/household/grocery-model.js");
const model = await import("../companies/household/model.js");
const {
  can, canAccessStateKey, capabilitiesForTemplate, visibleSharedCompanies, canViewHq,
} = await import("../lib/authz/capabilities.js");

const HOUSEHOLD_KEY = "hq:household:v1";

const {
  CATEGORIES, FALLBACK_CATEGORY, PRIORITIES, DEFAULT_CATEGORY_DICT,
  createGroceryState, ensureGroceryState, detectCategory, isGenuineFallback, addCategoryKeyword,
  quickAddItem, addItem, updateItem, removeItem, markPurchased, updateHistoryEntry,
  sortItems, groupByRoute, filterEntries,
  monthlySpend, budgetVsActual, budgetTrend, pricePerUnit, repeatProducts, repeatCategories,
  missingCategorizationItems, groceryAlerts, INSUFFICIENT_DATA,
} = grocery;

// ---------- זיהוי קטגוריה ----------
test("detectCategory: מזהה קטגוריה ממילת מפתח, נופל ל'אחר' כשאין התאמה", () => {
  assert.equal(detectCategory("עגבניות שרי"), "פירות וירקות");
  assert.equal(detectCategory("חלב 3%"), "קירור");
  assert.equal(detectCategory("אורז בסמטי"), "יבשים ומזווה");
  assert.equal(detectCategory("אקונומיקה"), "ניקיון");
  assert.equal(detectCategory("שמפו לתינוק"), "טיפוח"); // "שמפו" תופס לפני שמזהים "תינוק"
  assert.equal(detectCategory("חיתולים"), "תינוקות וחיות מחמד");
  assert.equal(detectCategory("משהו מוזר לגמרי"), FALLBACK_CATEGORY);
  assert.equal(detectCategory(""), FALLBACK_CATEGORY);
});

test("isGenuineFallback ו-addCategoryKeyword: המילון ניתן לעריכה", () => {
  assert.equal(isGenuineFallback("קינואה", DEFAULT_CATEGORY_DICT), true);
  const dict = addCategoryKeyword(DEFAULT_CATEGORY_DICT, "קינואה", "יבשים ומזווה");
  assert.equal(detectCategory("קינואה אורגנית", dict), "יבשים ומזווה");
  assert.equal(isGenuineFallback("קינואה אורגנית", dict), false);
  assert.deepEqual(addCategoryKeyword(DEFAULT_CATEGORY_DICT, "קינואה", "לא-קיים"), DEFAULT_CATEGORY_DICT);
  assert.deepEqual(addCategoryKeyword(DEFAULT_CATEGORY_DICT, "", "אחר"), DEFAULT_CATEGORY_DICT);
});

// ---------- הוספה מהירה / טופס מלא ----------
test("quickAddItem: שם בלבד, Enter, קטגוריה אוטומטית וברירות מחדל", () => {
  const s0 = createGroceryState();
  const s1 = quickAddItem(s0, "עגבניות");
  assert.equal(s1.items.length, 1);
  const item = s1.items[0];
  assert.equal(item.name, "עגבניות");
  assert.equal(item.category, "פירות וירקות");
  assert.equal(item.categoryAuto, true);
  assert.equal(item.priority, "רגיל");
  assert.equal(item.purchased, false);
  assert.equal(item.qty, null);
});

test("quickAddItem: שם ריק לא משנה כלום", () => {
  const s0 = createGroceryState();
  assert.equal(quickAddItem(s0, "   "), s0);
  assert.equal(quickAddItem(s0, ""), s0);
});

test("addItem: טופס מלא עם קטגוריה ידנית מבטל את הדגל האוטומטי", () => {
  const s0 = createGroceryState();
  const s1 = addItem(s0, { name: "משהו", category: "ניקיון", qty: 2, unit: "יח׳", priority: "דחוף", note: "לבדוק מבצע" });
  const item = s1.items[0];
  assert.equal(item.category, "ניקיון");
  assert.equal(item.categoryAuto, false);
  assert.equal(item.qty, 2);
  assert.equal(item.priority, "דחוף");
  assert.equal(item.note, "לבדוק מבצע");
});

test("addItem: כמות לא תקינה (שלילית/לא מספר) נשמרת כ-null ולא מומצאת", () => {
  const s0 = createGroceryState();
  const s1 = addItem(s0, { name: "משהו", qty: -5 });
  assert.equal(s1.items[0].qty, null);
});

// ---------- עדכון / מחיקה ----------
test("updateItem: שינוי ידני של קטגוריה מכבה את categoryAuto", () => {
  const s1 = quickAddItem(createGroceryState(), "עגבניות");
  const id = s1.items[0].id;
  const s2 = updateItem(s1, id, { category: "אחר" });
  assert.equal(s2.items[0].category, "אחר");
  assert.equal(s2.items[0].categoryAuto, false);
});

test("removeItem: מוחק לצמיתות פריט פעיל, לא נוגע בהיסטוריה", () => {
  const s1 = quickAddItem(createGroceryState(), "עגבניות");
  const id = s1.items[0].id;
  const s2 = removeItem(s1, id);
  assert.equal(s2.items.length, 0);
  assert.equal(removeItem(s1, "לא-קיים"), s1);
});

// ---------- מעבר להיסטוריה ----------
test("markPurchased: מעביר פריט מ-items להיסטוריה, אף פעם לא נמחק", () => {
  const s1 = quickAddItem(createGroceryState(), "חלב");
  const id = s1.items[0].id;
  const s2 = markPurchased(s1, id, { price: 6.9, purchasedAt: "2026-09-15T10:00:00.000Z" });
  assert.equal(s2.items.length, 0);
  assert.equal(s2.history.length, 1);
  assert.equal(s2.history[0].name, "חלב");
  assert.equal(s2.history[0].price, 6.9);
  assert.equal(s2.history[0].purchasedAt, "2026-09-15T10:00:00.000Z");
});

test("markPurchased: בלי מחיר — price נשאר null, לא 0 מומצא", () => {
  const s1 = quickAddItem(createGroceryState(), "חלב");
  const s2 = markPurchased(s1, s1.items[0].id);
  assert.equal(s2.history[0].price, null);
});

test("updateHistoryEntry: אפשר לתקן מחיר בדיעבד, ההיסטוריה לא נמחקת", () => {
  const s1 = quickAddItem(createGroceryState(), "חלב");
  const s2 = markPurchased(s1, s1.items[0].id);
  const s3 = updateHistoryEntry(s2, s2.history[0].id, { price: 7.5 });
  assert.equal(s3.history[0].price, 7.5);
  assert.equal(s3.history.length, 1);
});

// ---------- מיון / קיבוץ לפי מסלול ----------
test("groupByRoute: סדר הקבוצות תואם את מסלול הקנייה, קטגוריות ריקות לא מוצגות", () => {
  let s = createGroceryState();
  s = addItem(s, { name: "אקונומיקה", category: "ניקיון" });
  s = addItem(s, { name: "עגבניות", category: "פירות וירקות" });
  s = addItem(s, { name: "אורז", category: "יבשים ומזווה" });
  const groups = groupByRoute(s.items);
  assert.deepEqual(groups.map(g => g.category), ["פירות וירקות", "יבשים ומזווה", "ניקיון"]);
  assert.deepEqual(CATEGORIES, ["פירות וירקות", "יבשים ומזווה", "קירור", "ניקיון", "טיפוח", "תינוקות וחיות מחמד", "אחר"]);
});

test("sortItems: עדיפות דחוף > חשוב > רגיל, ואז אלפביתי", () => {
  let s = createGroceryState();
  s = addItem(s, { name: "ב", priority: "רגיל" });
  s = addItem(s, { name: "א", priority: "דחוף" });
  s = addItem(s, { name: "ג", priority: "חשוב" });
  const sorted = sortItems(s.items);
  assert.deepEqual(sorted.map(i => i.name), ["א", "ג", "ב"]);
});

test("filterEntries: need/purchased/all", () => {
  let s = quickAddItem(createGroceryState(), "חלב");
  s = quickAddItem(s, "עגבניות");
  s = markPurchased(s, s.items.find(i => i.name === "חלב").id, { price: 5 });
  assert.equal(filterEntries(s, "need").length, 1);
  assert.equal(filterEntries(s, "need")[0].purchased, false);
  assert.equal(filterEntries(s, "purchased").length, 1);
  assert.equal(filterEntries(s, "purchased")[0].purchased, true);
  assert.equal(filterEntries(s, "all").length, 2);
});

// ---------- תקציב / חיסכון ----------
test("monthlySpend: מחושב רק מרשומות עם מחיר תקין, hasData=false כשאין נתון לחודש", () => {
  const history = [
    { name: "חלב", price: 6, qty: 1, purchasedAt: "2026-08-01T00:00:00.000Z" },
    { name: "עגבניות", price: null, qty: 2, purchasedAt: "2026-08-05T00:00:00.000Z" },
  ];
  const aug = monthlySpend(history, "2026-08");
  assert.equal(aug.hasData, true);
  assert.equal(aug.total, 6);
  assert.equal(aug.itemCount, 2);
  assert.equal(aug.pricedCount, 1);
  const empty = monthlySpend(history, "2026-07");
  assert.equal(empty.hasData, false);
  assert.equal(empty.total, 0);
});

test("pricePerUnit: רק כששניהם (מחיר וכמות) מספרים תקינים", () => {
  assert.equal(pricePerUnit({ price: 10, qty: 2 }), 5);
  assert.equal(pricePerUnit({ price: 10, qty: null }), null);
  assert.equal(pricePerUnit({ price: null, qty: 2 }), null);
  assert.equal(pricePerUnit({ price: 10, qty: 0 }), null);
  assert.equal(pricePerUnit({ price: 10, qty: -1 }), null);
  assert.equal(pricePerUnit({ price: "10", qty: 2 }), null);
});

test("budgetVsActual: אין תקציב מוגדר => over=false, לא בודה מספר", () => {
  const s = { ...createGroceryState(), monthlyBudget: null, history: [{ name: "חלב", price: 500, qty: 1, purchasedAt: "2026-09-01T00:00:00.000Z" }] };
  const r = budgetVsActual(s, { referenceMonth: "2026-09" });
  assert.equal(r.budget, null);
  assert.equal(r.over, false);
  assert.equal(r.spend.total, 500);
});

test("budgetVsActual: חריגה מזוהה רק כשיש גם תקציב וגם נתון בפועל", () => {
  const s = { ...createGroceryState(), monthlyBudget: 300, history: [{ name: "חלב", price: 500, qty: 1, purchasedAt: "2026-09-01T00:00:00.000Z" }] };
  const over = budgetVsActual(s, { referenceMonth: "2026-09" });
  assert.equal(over.over, true);
  const noData = budgetVsActual({ ...s, history: [] }, { referenceMonth: "2026-09" });
  assert.equal(noData.over, false);
});

test("budgetTrend: זמין רק אחרי לפחות 2 חודשים מלאים של נתונים", () => {
  const noHistory = budgetTrend([], { referenceMonth: "2026-09" });
  assert.equal(noHistory.available, false);
  assert.equal(noHistory.reason, "not_enough_months");

  const oneMonth = [{ name: "חלב", price: 100, qty: 1, purchasedAt: "2026-08-01T00:00:00.000Z" }];
  assert.equal(budgetTrend(oneMonth, { referenceMonth: "2026-09" }).available, false);

  const twoMonths = [
    { name: "חלב", price: 100, qty: 1, purchasedAt: "2026-07-01T00:00:00.000Z" },
    { name: "חלב", price: 120, qty: 1, purchasedAt: "2026-08-01T00:00:00.000Z" },
    { name: "חלב", price: 200, qty: 1, purchasedAt: "2026-09-01T00:00:00.000Z" },
  ];
  const trend = budgetTrend(twoMonths, { referenceMonth: "2026-09" });
  assert.equal(trend.available, true);
  assert.equal(trend.baselineAvg, 110);
  assert.equal(trend.current, 200);
  assert.equal(trend.deltaPercent, Math.round(((200 - 110) / 110) * 100));
});

test("budgetTrend: יש 2 חודשים מלאים אבל אין נתון לחודש הנוכחי — עדיין לא זמין", () => {
  const history = [
    { name: "חלב", price: 100, qty: 1, purchasedAt: "2026-07-01T00:00:00.000Z" },
    { name: "חלב", price: 120, qty: 1, purchasedAt: "2026-08-01T00:00:00.000Z" },
  ];
  const trend = budgetTrend(history, { referenceMonth: "2026-09" });
  assert.equal(trend.available, false);
  assert.equal(trend.reason, "no_current_data");
});

test("repeatProducts/repeatCategories: רק פריטים/קטגוריות שחוזרים על פני 2+ חודשים שונים", () => {
  const history = [
    { name: "חלב", category: "קירור", price: 6, qty: 1, purchasedAt: "2026-07-01T00:00:00.000Z" },
    { name: "חלב", category: "קירור", price: 6, qty: 1, purchasedAt: "2026-08-01T00:00:00.000Z" },
    { name: "בננות", category: "פירות וירקות", price: 8, qty: 1, purchasedAt: "2026-08-01T00:00:00.000Z" },
  ];
  const products = repeatProducts(history);
  assert.deepEqual(products.map(p => p.name), ["חלב"]);
  assert.equal(products[0].count, 2);
  const cats = repeatCategories(history);
  assert.deepEqual(cats.map(c => c.category), ["קירור"]);
});

test("missingCategorizationItems: רק פריטים שנפלו ל'אחר' אוטומטית, לא כאלה שנבחרו ידנית", () => {
  let s = createGroceryState();
  s = quickAddItem(s, "דבר מוזר לגמרי");
  s = addItem(s, { name: "עוד דבר", category: "אחר" });
  const missing = missingCategorizationItems(s.items);
  assert.equal(missing.length, 1);
  assert.equal(missing[0].name, "דבר מוזר לגמרי");
});

test("groceryAlerts: אך ורק שלוש התראות מוגדרות, כל אחת עם הסבר בעברית", () => {
  let s = createGroceryState();
  s.monthlyBudget = 100;
  s.history = [
    { name: "חלב", category: "קירור", price: 60, qty: 1, purchasedAt: "2026-07-01T00:00:00.000Z" },
    { name: "חלב", category: "קירור", price: 60, qty: 1, purchasedAt: "2026-08-01T00:00:00.000Z" },
    { name: "חלב", category: "קירור", price: 500, qty: 1, purchasedAt: "2026-09-01T00:00:00.000Z" },
  ];
  s = quickAddItem(s, "דבר לא מזוהה");
  const alerts = groceryAlerts(s, { referenceMonth: "2026-09" });
  const ids = alerts.map(a => a.id).sort();
  assert.deepEqual(ids, ["increase_vs_baseline", "missing_categorization", "over_budget"]);
  for (const a of alerts) {
    assert.ok(a.message.length > 10);
    assert.ok(/[א-ת]/.test(a.message));
  }
});

test("groceryAlerts: בלי מספיק נתונים — פשוט אין התראה (לא מספר מומצא)", () => {
  const s = createGroceryState();
  s.monthlyBudget = 500;
  assert.deepEqual(groceryAlerts(s), []);
});

test("ensureGroceryState: תאימות אחורה לנתונים ישנים/חלקיים, בלי שינוי מיותר כשכבר תקין", () => {
  const legacy = { someOtherField: 1 };
  const fixed = ensureGroceryState(legacy);
  assert.ok(Array.isArray(fixed.items));
  assert.ok(Array.isArray(fixed.history));
  assert.ok(fixed.categoryDict);
  const already = createGroceryState();
  assert.equal(ensureGroceryState(already), already);
});

// ---------- model.js: summarize() ----------
test("summarize: צורת הפלט עקבית עם שאר תתי-החברות (openTasks/flag/latestUpdate/nextPayment/daysToPay)", () => {
  const s = model.summarize(model.INIT);
  assert.equal(s.openTasks, 0);
  assert.equal(s.nextPayment, null);
  assert.equal(s.daysToPay, null);
  assert.equal(s.latestUpdate, null);
  assert.equal(s.flag, "green");
  assert.equal(s.groceryMonthlySpend, null); // אין עדיין שום רכישה מתועדת
});

test("summarize: openTasks סופר פריטים ברשימה, flag=amber בחריגת תקציב", () => {
  let s = quickAddItem(model.INIT, "חלב");
  s = quickAddItem(s, "עגבניות");
  const sum1 = model.summarize(s);
  assert.equal(sum1.openTasks, 2);
  assert.equal(sum1.flag, "green");

  const over = { ...s, monthlyBudget: 10, history: [{ name: "בשר", price: 500, qty: 1, purchasedAt: new Date().toISOString().slice(0, 7) + "-01T00:00:00.000Z" }] };
  const sum2 = model.summarize(over);
  assert.equal(sum2.flag, "amber");
  assert.equal(sum2.groceryMonthlySpend, 500); // ערוץ הקריאה של שבתאי/כספים לסך ההוצאה החודשית
});

test("summarize: חוסר סיווג גם הוא מרים דגל amber", () => {
  const s = quickAddItem(model.INIT, "דבר מוזר שלא מזוהה");
  const sum = model.summarize(s);
  assert.equal(sum.grocery.missingCategorization, 1);
  assert.equal(sum.flag, "amber");
});

test("summarize: קלט חסר/undefined לא קורס — נופל ל-INIT", () => {
  assert.doesNotThrow(() => model.summarize(undefined));
  assert.doesNotThrow(() => model.summarize(null));
});

// ---------- הרשאות/נראות: household עצמאית מ-beit-hadash/כספים, שקד מוחרגת ----------
// מקביל ברוחו ל-tests/company-visibility-matrix.test.mjs (שאינו קיים עדיין ב-main, כי #79 לא
// מוזג נכון לרגע כתיבת ה-PR הזה) — כאן ברמת שכבת היכולות (lib/authz/capabilities.js) בלבד,
// כי זו השכבה שכבר קיימת ב-main ושה-PR הזה מרחיב.
test("owner: גישה מלאה לחברת משק בית תמיד, גם בלי שום grant מפורש", () => {
  assert.equal(canAccessStateKey([], HOUSEHOLD_KEY, { isOwner: true }), true);
  assert.equal(canAccessStateKey([], HOUSEHOLD_KEY, { isOwner: true, write: true }), true);
});

test("ליאור (partner_household): רואה וכותבת למשק בית, גם בלי חבילת כספים כלשהי", () => {
  const grants = capabilitiesForTemplate("partner_household");
  assert.equal(canAccessStateKey(grants, HOUSEHOLD_KEY), true);
  assert.equal(canAccessStateKey(grants, HOUSEHOLD_KEY, { write: true }), true);
  assert.equal(canViewHq(grants), true);
  assert.deepEqual(visibleSharedCompanies(grants), ["household"]);
  // ואין לה בכך גישה לכספים או לבית חדש — התוסף עצמאי לגמרי
  assert.equal(can(grants, "finance.dashboard_budget.read"), false);
  assert.equal(can(grants, "company.beit-hadash.read"), false);
});

test("ליאור: חבילת כספים (B) לבדה לא נותנת גישה למשק בית — היכולות נפרדות בכוונה", () => {
  const financeOnly = capabilitiesForTemplate("partner_full_finance");
  assert.equal(canAccessStateKey(financeOnly, HOUSEHOLD_KEY), false);
  assert.deepEqual(visibleSharedCompanies(financeOnly).sort(), ["beit-hadash", "kesef"]);
});

test("שקד (designer_beit_hadash): אין לה שום גישה למשק בית, ולא רואה אותו ברשימת החברות המשותפות", () => {
  const shaked = capabilitiesForTemplate("designer_beit_hadash");
  assert.equal(canAccessStateKey(shaked, HOUSEHOLD_KEY), false);
  assert.equal(canAccessStateKey(shaked, HOUSEHOLD_KEY, { write: true }), false);
  assert.equal(can(shaked, "company.household.read"), false);
  assert.equal(can(shaked, "company.household.write"), false);
  assert.deepEqual(visibleSharedCompanies(shaked), ["beit-hadash"]);
  assert.equal(canViewHq(shaked), false);
});

test("זר (בלי שום grant): אין גישה למשק בית", () => {
  assert.equal(canAccessStateKey([], HOUSEHOLD_KEY), false);
  assert.deepEqual(visibleSharedCompanies([]), []);
});
