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
  quickAddItem, addItem, updateItem, removeItem, markPurchased, updateHistoryEntry, findActiveDuplicate, findReceiptMatch, lastPromoForProduct,
  sortItems, groupByRoute, filterEntries,
  monthlySpend, budgetVsActual, budgetTrend, pricePerUnit, repeatProducts, repeatCategories,
  missingCategorizationItems, groceryAlerts, INSUFFICIENT_DATA,
  knownStores, logReceipt, updateReceiptImages, storeTotals, mostPurchasedProducts, mostPurchasedCategories, cheapestStoreSeen,
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

test("findActiveDuplicate: מתעלם מרישיות/רווחים, לא מוצא כלום כשאין התאמה או שם ריק", () => {
  const s0 = quickAddItem(createGroceryState(), "עגבניות");
  assert.equal(findActiveDuplicate(s0.items, "עגבניות").name, "עגבניות");
  assert.equal(findActiveDuplicate(s0.items, "  עגבניות  ").name, "עגבניות");
  assert.equal(findActiveDuplicate(s0.items, "מלפפון"), null);
  assert.equal(findActiveDuplicate(s0.items, ""), null);
  assert.equal(findActiveDuplicate([], "עגבניות"), null);
  assert.equal(findActiveDuplicate(null, "עגבניות"), null);
});

test("findReceiptMatch: מתאים שם מהרשימה לשם מפורט יותר מהקבלה (מותג) ולהפך, לא רגיש לכיוון ההכלה", () => {
  const s0 = quickAddItem(createGroceryState(), "רוטב סויה");
  // שם הקבלה מפורט יותר (כולל מותג) - כל המילים של "רוטב סויה" מופיעות אצלו.
  assert.equal(findReceiptMatch(s0.items, "רוטב סויה יאמסה").name, "רוטב סויה");
  // גם ההפך: הרשימה מפורטת יותר מהקבלה.
  const s1 = quickAddItem(createGroceryState(), "חלב 3% תנובה");
  assert.equal(findReceiptMatch(s1.items, "חלב 3%").name, "חלב 3% תנובה");
  // התאמה מדויקת עדיין עובדת (לא רק פאזי).
  assert.equal(findReceiptMatch(s0.items, "  רוטב סויה  ").name, "רוטב סויה");
});

test("findReceiptMatch: מוצרים שונים לגמרי לא מתאימים, שם ריק/רשימה ריקה לא קורסים", () => {
  const s0 = quickAddItem(createGroceryState(), "עגבניות");
  assert.equal(findReceiptMatch(s0.items, "מלפפון"), null);
  assert.equal(findReceiptMatch(s0.items, ""), null);
  assert.equal(findReceiptMatch([], "עגבניות"), null);
  assert.equal(findReceiptMatch(null, "עגבניות"), null);
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

test("markPurchased: שדה promo אופציונלי, מנורמל (טרים), ריק/לא מצוין => null", () => {
  const s1 = quickAddItem(createGroceryState(), "חלב");
  const s2 = markPurchased(s1, s1.items[0].id, { price: 6, promo: "  2 ב-20  " });
  assert.equal(s2.history[0].promo, "2 ב-20");
  const s3 = quickAddItem(createGroceryState(), "לחם");
  const s4 = markPurchased(s3, s3.items[0].id); // בלי promo בכלל
  assert.equal(s4.history[0].promo, null);
});

test("updateHistoryEntry: אפשר לעדכן/לתקן מבצע בדיעבד, מנורמל בדיוק כמו ב-markPurchased", () => {
  const s1 = quickAddItem(createGroceryState(), "חלב");
  const s2 = markPurchased(s1, s1.items[0].id, { price: 6 });
  assert.equal(s2.history[0].promo, null);
  const s3 = updateHistoryEntry(s2, s2.history[0].id, { promo: "  מועדון -10%  " });
  assert.equal(s3.history[0].promo, "מועדון -10%");
  const s4 = updateHistoryEntry(s3, s3.history[0].id, { promo: "" });
  assert.equal(s4.history[0].promo, null);
});

test("lastPromoForProduct: המבצע האחרון (לפי תאריך) לאותו שם מוצר בדיוק, null כשאין בכלל", () => {
  let s = createGroceryState();
  s = quickAddItem(s, "קוטג");
  const id = s.items[0].id;
  s = markPurchased(s, id, { price: 8, purchasedAt: "2026-08-01T10:00:00.000Z", promo: "מבצע ישן" });
  s = quickAddItem(s, "קוטג");
  s = markPurchased(s, s.items[0].id, { price: 7, purchasedAt: "2026-09-01T10:00:00.000Z", promo: "2 ב-14" });
  const last = lastPromoForProduct(s.history, "קוטג");
  assert.equal(last.promo, "2 ב-14");
  assert.equal(last.purchasedAt, "2026-09-01T10:00:00.000Z");
  assert.equal(lastPromoForProduct(s.history, "מוצר שלא קיים"), null);
  assert.equal(lastPromoForProduct([], "קוטג"), null);
  assert.equal(lastPromoForProduct(s.history, ""), null);
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
  assert.ok(Array.isArray(fixed.receipts));
  const already = createGroceryState();
  assert.equal(ensureGroceryState(already), already);
});

test("ensureGroceryState: נתונים ישנים בלי receipts (מלפני פיצ'ר הקבלות) מקבלים מערך ריק, שאר השדות נשארים", () => {
  const legacy = { items: [{ id: "1", name: "חלב" }], history: [{ id: "2", name: "לחם", price: 10 }], categoryDict: { "חלב": "קירור" }, monthlyBudget: 500 };
  const fixed = ensureGroceryState(legacy);
  assert.deepEqual(fixed.receipts, []);
  assert.equal(fixed.items.length, 1);
  assert.equal(fixed.history[0].price, 10); // רשומת היסטוריה ישנה בלי store — לא נשברת
  assert.equal(fixed.monthlyBudget, 500);
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
// #79 מוזג ל-main (b37a65c) ותוסף tests/company-visibility-matrix.test.mjs שם כבר כולל "household"
// ברמת lib/workspace.js (visibleCompanySlugs/canViewCompany/isHqVisible/isCompanyReadOnly) —
// הבדיקות כאן משלימות אותו ברמת שכבת היכולות הגולמית (lib/authz/capabilities.js) בלבד.
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

// ================= קבלות: שדה חנות, רישום קבלה, ניתוח לפי חנות =================

// ---------- שדה store: תאימות אחורה ----------
test("markPurchased: שדה store אופציונלי, נשמר null כברירת מחדל (תאימות אחורה עם היסטוריה ישנה)", () => {
  const s1 = quickAddItem(createGroceryState(), "חלב");
  const s2 = markPurchased(s1, s1.items[0].id, { price: 6.9 });
  assert.equal(s2.history[0].store, null);
  assert.equal(s2.history[0].receiptId, null);
});

test("markPurchased: אפשר להעביר שם חנות, מנורמל (טרים), ריק => null", () => {
  const s1 = quickAddItem(createGroceryState(), "חלב");
  const s2 = markPurchased(s1, s1.items[0].id, { price: 6.9, store: "  שופרסל  " });
  assert.equal(s2.history[0].store, "שופרסל");
  const s3 = markPurchased(s1, s1.items[0].id, { price: 6.9, store: "   " });
  assert.equal(s3.history[0].store, null);
});

test("updateHistoryEntry: אפשר לעדכן/לתקן חנות בדיעבד, מנורמל בדיוק כמו ב-markPurchased", () => {
  const s1 = quickAddItem(createGroceryState(), "חלב");
  const s2 = markPurchased(s1, s1.items[0].id);
  const s3 = updateHistoryEntry(s2, s2.history[0].id, { store: " רמי לוי " });
  assert.equal(s3.history[0].store, "רמי לוי");
});

test("knownStores: רשימת שמות חנויות ייחודיים, ממוינים, מהיסטוריה ומקבלות, בלי כפילויות", () => {
  let s = createGroceryState();
  s = { ...s, history: [{ name: "א", store: "שופרסל" }, { name: "ב", store: "רמי לוי" }, { name: "ג", store: "שופרסל" }, { name: "ד", store: null }] };
  assert.deepEqual(knownStores(s), ["רמי לוי", "שופרסל"]);
});

// ---------- רישום קבלה (receipt) ----------
test("logReceipt: מתוך פריטי הרשימה — עוברים ל-history עם store/receiptId/date משותפים, יורדים מ-items", () => {
  let s = quickAddItem(createGroceryState(), "חלב");
  s = quickAddItem(s, "לחם");
  const [milk, bread] = s.items;
  const { state: next, receiptId } = logReceipt(s, {
    store: "שופרסל", date: "2026-09-20",
    listItems: [{ id: milk.id, price: 7 }, { id: bread.id, price: 12 }],
  });
  assert.ok(receiptId);
  assert.equal(next.items.length, 0);
  assert.equal(next.history.length, 2);
  assert.ok(next.history.every(h => h.store === "שופרסל" && h.receiptId === receiptId));
  assert.equal(next.receipts.length, 1);
  assert.equal(next.receipts[0].store, "שופרסל");
  assert.equal(next.receipts[0].date, "2026-09-20");
  assert.deepEqual(next.receipts[0].images, []);
});

test("logReceipt: שורות אד-הוק (לא מהרשימה בכלל) — קטגוריה מזוהה אוטומטית, מחיר/כמות אופציונליים", () => {
  const s = createGroceryState();
  const { state: next, receiptId } = logReceipt(s, {
    store: "רמי לוי", date: "2026-09-21",
    adHocItems: [{ name: "שוקולד", price: 8.5, qty: 2 }, { name: "דבר בלי מחיר" }],
  });
  assert.equal(next.history.length, 2);
  const choc = next.history.find(h => h.name === "שוקולד");
  assert.equal(choc.price, 8.5);
  assert.equal(choc.qty, 2);
  assert.equal(choc.store, "רמי לוי");
  assert.equal(choc.receiptId, receiptId);
  assert.equal(choc.category, FALLBACK_CATEGORY); // "שוקולד" לא במילון ברירת המחדל
  const noPrice = next.history.find(h => h.name === "דבר בלי מחיר");
  assert.equal(noPrice.price, null); // לא מומצא
});

test("logReceipt: promo עובר (ומנורמל) גם משורות רשימה וגם משורות אד-הוק, null כשלא צוין", () => {
  let s = quickAddItem(createGroceryState(), "קוטג");
  const item = s.items[0];
  const { state: next } = logReceipt(s, {
    store: "שופרסל",
    listItems: [{ id: item.id, price: 7, promo: "  2 ב-14  " }],
    adHocItems: [{ name: "שוקולד", price: 8.5, promo: "מועדון" }, { name: "במבה", price: 6 }],
  });
  assert.equal(next.history.find(h => h.name === "קוטג").promo, "2 ב-14");
  assert.equal(next.history.find(h => h.name === "שוקולד").promo, "מועדון");
  assert.equal(next.history.find(h => h.name === "במבה").promo, null);
});

test("logReceipt: משלב פריטי רשימה ואד-הוק תחת אותה קבלה (receiptId משותף)", () => {
  let s = quickAddItem(createGroceryState(), "ביצים");
  const egg = s.items[0];
  const { state: next, receiptId } = logReceipt(s, {
    store: "יינות ביתן",
    listItems: [{ id: egg.id, price: 15 }],
    adHocItems: [{ name: "מגבונים", price: 20 }],
  });
  assert.equal(next.history.length, 2);
  assert.ok(next.history.every(h => h.receiptId === receiptId));
  assert.equal(next.receipts[0].store, "יינות ביתן");
});

test("logReceipt: בלי שם חנות תקין — לא עושה כלום ולא זורק", () => {
  let s = quickAddItem(createGroceryState(), "חלב");
  const { state: next, receiptId } = logReceipt(s, { store: "   ", listItems: [{ id: s.items[0].id, price: 5 }] });
  assert.equal(receiptId, null);
  assert.equal(next, s);
});

test("logReceipt: חנות תקינה אבל שתי הרשימות ריקות — לא עושה כלום", () => {
  const s = createGroceryState();
  const { state: next, receiptId } = logReceipt(s, { store: "שופרסל", listItems: [], adHocItems: [] });
  assert.equal(receiptId, null);
  assert.equal(next, s);
});

test("logReceipt: מזהה פריט רשימה שלא קיים (id זר) מתעלם ממנו בשקט, לא קורס", () => {
  const s = quickAddItem(createGroceryState(), "חלב");
  const { state: next } = logReceipt(s, { store: "שופרסל", listItems: [{ id: "לא-קיים", price: 5 }], adHocItems: [{ name: "לחם", price: 10 }] });
  assert.equal(next.history.length, 1); // רק האד-הוק נקלט
  assert.equal(next.items.length, 1); // הפריט המקורי לא נגע בו
});

test("updateReceiptImages: מעדכן את מערך התמונות של קבלה קיימת בלבד", () => {
  let s = createGroceryState();
  const { state: withReceipt, receiptId } = logReceipt(s, { store: "שופרסל", adHocItems: [{ name: "לחם", price: 10 }] });
  const img = { id: "i1", path: "p/1.jpg", name: "1.jpg", mime: "image/jpeg", size: 100, createdAt: new Date().toISOString() };
  const next = updateReceiptImages(withReceipt, receiptId, [img]);
  assert.deepEqual(next.receipts[0].images, [img]);
  const unchanged = updateReceiptImages(withReceipt, "לא-קיים", [img]);
  assert.deepEqual(unchanged.receipts, withReceipt.receipts); // receiptId זר: לא עושה כלום, לא זורק
});

// ---------- ניתוח לפי חנות ----------
test("storeTotals: סך הוצאה וממוצע להזמנה, רק מרשומות עם מחיר תקין וחנות ידועה", () => {
  const history = [
    { name: "א", price: 100, store: "שופרסל", purchasedAt: "2026-08-01T00:00:00.000Z" },
    { name: "ב", price: 50, store: "שופרסל", purchasedAt: "2026-08-05T00:00:00.000Z" },
    { name: "ג", price: 30, store: "רמי לוי", purchasedAt: "2026-08-06T00:00:00.000Z" },
    { name: "ד", price: null, store: "שופרסל", purchasedAt: "2026-08-07T00:00:00.000Z" }, // בלי מחיר - לא נספר
    { name: "ה", price: 40, store: null, purchasedAt: "2026-08-08T00:00:00.000Z" }, // בלי חנות - לא נספר
  ];
  const totals = storeTotals(history);
  assert.deepEqual(totals.map(t => t.store), ["שופרסל", "רמי לוי"]);
  const shufersal = totals.find(t => t.store === "שופרסל");
  assert.equal(shufersal.total, 150);
  assert.equal(shufersal.count, 2);
  assert.equal(shufersal.avgItemPrice, 75);
});

test("storeTotals: אין נתוני מחיר/חנות בכלל => רשימה ריקה (UI מציג 'אין מספיק נתונים')", () => {
  assert.deepEqual(storeTotals([]), []);
  assert.deepEqual(storeTotals([{ name: "א", price: null, store: "שופרסל" }]), []);
});

test("mostPurchasedProducts: byFrequency לפי מספר רכישות, bySpend רק מרשומות עם מחיר תקין", () => {
  const history = [
    { name: "חלב", price: 6, category: "קירור" }, { name: "חלב", price: 7, category: "קירור" }, { name: "חלב", price: null, category: "קירור" },
    { name: "לחם", price: 100, category: "יבשים ומזווה" },
  ];
  const { byFrequency, bySpend } = mostPurchasedProducts(history);
  assert.equal(byFrequency[0].key, "חלב");
  assert.equal(byFrequency[0].count, 3);
  assert.equal(bySpend[0].key, "לחם"); // 100 > 13 (סך החלב עם מחיר תקין)
  assert.equal(bySpend[0].total, 100);
  const milkSpend = bySpend.find(b => b.key === "חלב");
  assert.equal(milkSpend.total, 13);
});

test("mostPurchasedCategories: אותו עיקרון, לפי קטגוריה", () => {
  const history = [
    { name: "א", category: "קירור", price: 10 }, { name: "ב", category: "קירור", price: 20 }, { name: "ג", category: "ניקיון", price: 5 },
  ];
  const { byFrequency, bySpend } = mostPurchasedCategories(history);
  assert.equal(byFrequency[0].key, "קירור");
  assert.equal(byFrequency[0].count, 2);
  assert.equal(bySpend[0].key, "קירור");
  assert.equal(bySpend[0].total, 30);
});

test("cheapestStoreSeen: 'החנות הזולה ביותר שראינו' — רק למוצר עם מחיר מ-2+ חנויות שונות", () => {
  const history = [
    { name: "חלב", price: 6.9, store: "שופרסל" },
    { name: "חלב", price: 5.5, store: "רמי לוי" },
    { name: "חלב", price: 6.2, store: "יינות ביתן" },
    { name: "לחם", price: 10, store: "שופרסל" }, // חנות יחידה — לא מספיק נתונים
  ];
  const facts = cheapestStoreSeen(history);
  assert.equal(facts.length, 1); // רק "חלב", לא "לחם"
  const milk = facts[0];
  assert.equal(milk.name, "חלב");
  assert.equal(milk.cheapestStore, "רמי לוי");
  assert.equal(milk.cheapestPrice, 5.5);
  assert.equal(milk.stores.length, 3);
});

test("cheapestStoreSeen: אין שום מוצר עם 2+ חנויות => רשימה ריקה, בלי מספר מומצא", () => {
  assert.deepEqual(cheapestStoreSeen([]), []);
  assert.deepEqual(cheapestStoreSeen([{ name: "חלב", price: 6, store: "שופרסל" }]), []);
});

test("שחזור: פריט שסומן בטעות כנרכש חוזר לרשימה ולא נשאר בהיסטוריה", () => {
  let state = grocery.createGroceryState();
  ({ state } = { state: grocery.quickAddItem(state, "מלפפון") });
  const id = state.items[0].id;
  state = grocery.markPurchased(state, id, { price: 5, store: "שופרסל" });
  assert.equal(state.items.length, 0);
  assert.equal(state.history.length, 1);
  const historyId = state.history[0].id;
  state = grocery.restoreToList(state, historyId);
  assert.equal(state.history.length, 0);
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].name, "מלפפון");
  assert.equal(state.items[0].purchased, false);
  assert.notEqual(state.items[0].id, id); // מזהה חדש, לא מתנגש עם השורה הישנה
});

test("שחזור מקבלה: הפריט חוזר לרשימה, ושאר שורות אותה קבלה לא נפגעות", () => {
  let state = grocery.createGroceryState();
  ({ state } = { state: grocery.quickAddItem(state, "עגבניות") });
  const { state: afterReceipt, receiptId } = grocery.logReceipt(state, {
    store: "רמי לוי", listItems: [{ id: state.items[0].id, price: 8 }], adHocItems: [{ name: "לחם", price: 12 }],
  });
  state = afterReceipt;
  assert.equal(state.history.length, 2);
  const tomatoEntry = state.history.find(h => h.name === "עגבניות");
  state = grocery.restoreToList(state, tomatoEntry.id);
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].name, "לחם");
  assert.equal(state.receipts.length, 1); // הקבלה עדיין רלוונטית לשורה שנשארה
  assert.equal(state.items.some(i => i.name === "עגבניות"), true);
});

test("שחזור מקבלה עם שורה יחידה: מוחק גם את רשומת הקבלה הריקה", () => {
  let state = grocery.createGroceryState();
  const { state: afterReceipt } = grocery.logReceipt(state, { store: "ויקטורי", adHocItems: [{ name: "חלב", price: 6 }] });
  state = afterReceipt;
  assert.equal(state.receipts.length, 1);
  state = grocery.restoreToList(state, state.history[0].id);
  assert.equal(state.receipts.length, 0);
  assert.equal(state.history.length, 0);
});

test("שחזור עם מזהה לא קיים לא משנה כלום", () => {
  const state = grocery.createGroceryState();
  assert.equal(grocery.restoreToList(state, "no-such-id"), state);
});
