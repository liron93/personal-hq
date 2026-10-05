import { test } from "node:test";
import assert from "node:assert/strict";
import { queueReason, isQueueActionable, buildActionQueue } from "../companies/avoda/job-queue.mjs";

const TODAY = "2026-10-05";
const job = (over) => ({ id: "j1", company_name: "חברה", role_title: "תפקיד", status: "applied", next_action: "", next_action_at: "", ...over });

test("queueReason: ראיון/הצעה תמיד יש סיבה, גם בלי שום תאריך", () => {
  assert.equal(queueReason(job({ status: "interview" }), TODAY), "ראיון מתוכנן");
  assert.equal(queueReason(job({ status: "offer" }), TODAY), "ממתין להחלטה על הצעה");
});

test("queueReason: פולו-אפ - באיחור/היום/מתקרב, רק כשיש גם next_action וגם תאריך", () => {
  assert.equal(queueReason(job({ next_action: "לשלוח מייל", next_action_at: "2026-09-21" }), TODAY), "פולו-אפ באיחור");
  assert.equal(queueReason(job({ next_action: "לשלוח מייל", next_action_at: TODAY }), TODAY), "פולו-אפ להיום");
  assert.equal(queueReason(job({ next_action: "לשלוח מייל", next_action_at: "2026-10-09" }), TODAY), "פולו-אפ מתקרב");
  assert.equal(queueReason(job({ next_action: "", next_action_at: "" }), TODAY), null);
  assert.equal(queueReason(job({ next_action: "יש טקסט", next_action_at: "" }), TODAY), null); // תאריך חסר - אין סיבה בתור
});

test("isQueueActionable: סגורה/לא רלוונטית - אף פעם לא בתור", () => {
  const flags = { j1: true };
  assert.equal(isQueueActionable(job({ status: "rejected" }), {}, TODAY), false);
  assert.equal(isQueueActionable(job({ status: "withdrawn" }), {}, TODAY), false);
  assert.equal(isQueueActionable(job({ status: "applied" }), flags, TODAY), false); // מסומנת לא-רלוונטית
});

test("isQueueActionable: ראיון/הצעה - תמיד בתור, גם בלי תאריך", () => {
  assert.equal(isQueueActionable(job({ status: "interview" }), {}, TODAY), true);
  assert.equal(isQueueActionable(job({ status: "offer" }), {}, TODAY), true);
});

test("isQueueActionable: פולו-אפ עד שבוע קדימה (כולל כל איחור) - כן; מעבר לשבוע - לא; בלי next_action/תאריך בכלל - לא", () => {
  assert.equal(isQueueActionable(job({ next_action: "x", next_action_at: "2026-09-21" }), {}, TODAY), true); // באיחור משמעותי - עדיין "עכשיו"
  assert.equal(isQueueActionable(job({ next_action: "x", next_action_at: TODAY }), {}, TODAY), true);
  assert.equal(isQueueActionable(job({ next_action: "x", next_action_at: "2026-10-12" }), {}, TODAY), true); // +7 ימים בדיוק
  assert.equal(isQueueActionable(job({ next_action: "x", next_action_at: "2026-10-20" }), {}, TODAY), false); // רחוק מדי
  assert.equal(isQueueActionable(job({ next_action: "", next_action_at: "" }), {}, TODAY), false); // "ללא צעד הבא" - לא בתור
  assert.equal(isQueueActionable(job({ next_action: "x", next_action_at: "" }), {}, TODAY), false);
});

test("buildActionQueue: 102 מועמדויות פעילות בלי פעולה אמיתית => queue ריק, activeCount עדיין אמיתי", () => {
  const jobs = Array.from({ length: 102 }, (_, i) => job({ id: `old${i}`, next_action: "", next_action_at: "" }));
  const result = buildActionQueue(jobs, {}, TODAY);
  assert.equal(result.activeCount, 102);
  assert.equal(result.queue.length, 0);
  assert.equal(result.dueToday.length, 0);
  assert.equal(result.awaitingReplyCount, 0); // בלי next_action/תאריך - גם לא "ממתין לתשובה", פשוט חסר מידע
});

test("buildActionQueue: ממיין הכי דחוף קודם, מפצל dueToday/dueThisWeek נכון", () => {
  const jobs = [
    job({ id: "a", company_name: "Gett", next_action: "פולו-אפ", next_action_at: "2026-09-21" }), // באיחור משמעותי
    job({ id: "b", company_name: "Stigg", status: "interview" }), // בלי תאריך - נכנס ל-dueToday
    job({ id: "c", company_name: "Global-e", next_action: "פולו-אפ", next_action_at: "2026-10-10" }), // בעוד כמה ימים
    job({ id: "d", company_name: "Trigo", status: "rejected" }), // סגורה - לא בתור בכלל
  ];
  const result = buildActionQueue(jobs, {}, TODAY);
  assert.equal(result.queue.length, 3);
  assert.deepEqual(result.queue.map(j => j.id), ["a", "b", "c"]); // a (2026-09-21) < b (fallback=today) < c (2026-10-10)
  assert.equal(result.dueToday.length, 2); // a (עבר), b (בלי תאריך)
  assert.equal(result.dueThisWeek.length, 1); // c
  assert.equal(result.archiveCount, 1); // d
});

test("buildActionQueue: awaitingReplyCount סופר פעילות עם פולו-אפ מתוכנן מעבר לשבוע הקרוב, בלי להסתיר אותן", () => {
  const jobs = [job({ id: "far", next_action: "להמתין", next_action_at: "2026-11-01" })];
  const result = buildActionQueue(jobs, {}, TODAY);
  assert.equal(result.queue.length, 0);
  assert.equal(result.awaitingReplyCount, 1);
  assert.equal(result.activeCount, 1); // לא נעלמת מהספירה הכוללת
});

test("buildActionQueue: archiveCount כולל גם 'לא רלוונטי' (נשמר כ-withdrawn במסד, ראה job-status.js)", () => {
  const jobs = [job({ id: "irr", status: "withdrawn" })];
  const result = buildActionQueue(jobs, { irr: true }, TODAY);
  assert.equal(result.archiveCount, 1);
  assert.equal(result.activeCount, 0);
});

test("buildActionQueue: קלט ריק/חסר לא קורס", () => {
  const result = buildActionQueue([], {}, TODAY);
  assert.equal(result.queue.length, 0);
  assert.equal(result.activeCount, 0);
  const result2 = buildActionQueue(null, null, TODAY);
  assert.equal(result2.activeCount, 0);
});
