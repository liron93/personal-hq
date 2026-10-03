import assert from "node:assert/strict";
import test from "node:test";

const {
  createVoucher, addVoucher, updateVoucher, removeVoucher, remainingAmount, sortVouchers, totalRemaining,
} = await import("../companies/household/vouchers-model.js");

const emptyState = () => ({ vouchers: [] });

test("createVoucher: שם וסכום מקורי חובה, אחרת null - לא בודה שובר", () => {
  const v = createVoucher({ name: "שובר BUYME", originalAmount: 200 });
  assert.equal(v.name, "שובר BUYME");
  assert.equal(v.originalAmount, 200);
  assert.equal(v.usedAmount, 0);
  assert.equal(v.fullyUsed, false);
  assert.equal(v.expiry, null);
  assert.equal(v.cvv, null);
  assert.equal(createVoucher({ name: "", originalAmount: 200 }), null);
  assert.equal(createVoucher({ name: "שובר", originalAmount: 0 }), null);
  assert.equal(createVoucher({ name: "שובר", originalAmount: -5 }), null);
  assert.equal(createVoucher({ name: "שובר" }), null);
  assert.equal(createVoucher(), null);
});

test("createVoucher: תוקף/CVV אופציונליים - טקסט חופשי מנורמל (טרים), ריק => null", () => {
  const v = createVoucher({ name: "שובר", originalAmount: 100, expiry: "  12/27  ", cvv: "  0472  " });
  assert.equal(v.expiry, "12/27");
  assert.equal(v.cvv, "0472"); // לא מאבד אפס מוביל - זו מחרוזת, לא מספר
  const v2 = createVoucher({ name: "שובר", originalAmount: 100, expiry: "", cvv: "" });
  assert.equal(v2.expiry, null);
  assert.equal(v2.cvv, null);
});

test("addVoucher: מוסיף שובר תקין, לא משנה כלום כשהקלט לא תקין", () => {
  const s1 = addVoucher(emptyState(), { name: "שובר A", originalAmount: 100 });
  assert.equal(s1.vouchers.length, 1);
  const s2 = addVoucher(s1, { name: "", originalAmount: 50 });
  assert.equal(s2, s1); // לא השתנה כלום
});

test("updateVoucher: usedAmount/originalAmount מנורמלים - ערך לא חוקי לא דורס את מה שהיה", () => {
  const s0 = addVoucher(emptyState(), { name: "שובר A", originalAmount: 100 });
  const id = s0.vouchers[0].id;
  const s1 = updateVoucher(s0, id, { usedAmount: 30 });
  assert.equal(s1.vouchers[0].usedAmount, 30);
  const s2 = updateVoucher(s1, id, { usedAmount: -5 }); // לא חוקי - נשאר כמו שהיה
  assert.equal(s2.vouchers[0].usedAmount, 30);
  const s3 = updateVoucher(s2, id, { fullyUsed: true });
  assert.equal(s3.vouchers[0].fullyUsed, true);
  const s4 = updateVoucher(s3, id, { name: "" }); // שם ריק - נשאר כמו שהיה
  assert.equal(s4.vouchers[0].name, "שובר A");
  assert.equal(updateVoucher(s0, "לא קיים", { usedAmount: 5 }), s0);
});

test("updateVoucher: אפשר להוסיף/לעדכן/לנקות תוקף ו-CVV בדיעבד", () => {
  const s0 = addVoucher(emptyState(), { name: "שובר A", originalAmount: 100 });
  const id = s0.vouchers[0].id;
  const s1 = updateVoucher(s0, id, { expiry: "12/27", cvv: "123" });
  assert.equal(s1.vouchers[0].expiry, "12/27");
  assert.equal(s1.vouchers[0].cvv, "123");
  const s2 = updateVoucher(s1, id, { expiry: "", cvv: "" }); // ניקוי מפורש - מותר, לא "נדרס בטעות"
  assert.equal(s2.vouchers[0].expiry, null);
  assert.equal(s2.vouchers[0].cvv, null);
});

test("removeVoucher: מוחק לצמיתות, לא משנה כלום אם ה-id לא קיים", () => {
  const s0 = addVoucher(emptyState(), { name: "שובר A", originalAmount: 100 });
  const id = s0.vouchers[0].id;
  const s1 = removeVoucher(s0, id);
  assert.equal(s1.vouchers.length, 0);
  assert.equal(removeVoucher(s0, "לא קיים"), s0);
});

test("remainingAmount: originalAmount-usedAmount; fullyUsed מציג 0 תמיד בלי לשנות את usedAmount; שלילי נשאר גלוי", () => {
  assert.equal(remainingAmount({ originalAmount: 200, usedAmount: 80, fullyUsed: false }), 120);
  assert.equal(remainingAmount({ originalAmount: 200, usedAmount: 200, fullyUsed: true }), 0);
  assert.equal(remainingAmount({ originalAmount: 100, usedAmount: 95, fullyUsed: true }), 0); // נשאר 5 אבל נוצל במלואו
  assert.equal(remainingAmount({ originalAmount: 100, usedAmount: 130, fullyUsed: false }), -30); // טעות הזנה - גלויה, לא מוסתרת
  assert.equal(remainingAmount(null), 0);
});

test("sortVouchers: פעילים (לא נוצלו במלואם) קודם, מהישן לחדש (חדש מתווסף לתחתית); נוצלו במלואם בסוף", () => {
  const vouchers = [
    { id: "a", name: "ישן פעיל", fullyUsed: false, createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "b", name: "נוצל", fullyUsed: true, createdAt: "2026-03-01T00:00:00.000Z" },
    { id: "c", name: "חדש פעיל", fullyUsed: false, createdAt: "2026-02-01T00:00:00.000Z" },
  ];
  const sorted = sortVouchers(vouchers);
  assert.deepEqual(sorted.map(v => v.id), ["a", "c", "b"]);
});

test("totalRemaining: סוכם רק על שוברים פעילים (לא נוצלו במלואם)", () => {
  const vouchers = [
    { originalAmount: 100, usedAmount: 40, fullyUsed: false }, // יתרה 60
    { originalAmount: 50, usedAmount: 10, fullyUsed: true }, // נוצל במלואו - 0, לא נספר
    { originalAmount: 200, usedAmount: 150, fullyUsed: false }, // יתרה 50
  ];
  assert.equal(totalRemaining(vouchers), 110);
  assert.equal(totalRemaining([]), 0);
  assert.equal(totalRemaining(null), 0);
});
