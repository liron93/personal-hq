import { uid } from "@/lib/format";

export const STORE_KEY = "hq:beit-hadash:v1";

export const EXP_CATS_DEFAULT = ["קנייה", "מכירה", "משכנתא", "מעבר"];
export const RENO_CATS_DEFAULT = ["מטבח", "חשמל", "נגרות", "ריצוף", "אינסטלציה", "צביעה", "אחר"];

// פריט הוצאה/שיפוץ: משוער / בפועל / מקדמה / הושלם
export const effP = i => (i.act > 0 ? i.act : i.est) || 0;
export const iPaid = i => (i.done ? effP(i) : (i.advance || 0));
export const iRem = i => (i.done ? 0 : Math.max(0, effP(i) - (i.advance || 0)));

const item = (id, n, cat, est, extra = {}) => ({ id, n, cat, est, act: 0, advance: 0, done: false, note: "", supplier: "", link: "", ...extra });

export const INIT = {
  // הכנסות, החזר משכנתא קיימת, ותאריכים אישיים — נתוני ליבה משותפים, ראה lib/coreFacts.js
  cfg: {
    mortgageBal: 0, newMortgageMonthly: 11600, living: 14000,
    saleMonth: "2025-12", raiseMonth: "2025-09", athensMonth: "2026-01",
    flowStart: "2025-06", flowEnd: "2027-12",
    expCats: [...EXP_CATS_DEFAULT], renoCats: [...RENO_CATS_DEFAULT],
  },
  sale: { price: 2360000, agentFee: 34810, lawyerFee: 8350, penalty: 350, deposit: 300000, depositDone: false },
  buy: {
    p2: 2290000, p2Done: false, p2Due: "2026-07-01",
    p3Label: "תשלום סופי (5%)", p3: 0, p3Done: false, p3Due: "2026-12-01",
    mortgage: 1890900, mortgageOk: false,
  },
  mil: { grant: 11000, grantDone: false, loan: 100000, loanDone: false },
  exp: [
    item(1, "מס רכישה", "קנייה", 50000, { act: 50000, advance: 50000, done: true }),
    item(2, 'עו"ד מוכר', "מכירה", 8350, { act: 8350, advance: 8350, done: true }),
    item(3, 'עו"ד קונה', "קנייה", 10500, { act: 10500, advance: 10500, done: true }),
    item(4, "מתווך", "מכירה", 34810),
    item(5, "יועץ משכנתא", "קנייה", 9000),
    item(6, "הובלה", "מעבר", 2000),
  ],
  reno: [
    item(1, "מטבח", "מטבח", 45000),
    item(2, "שיש", "מטבח", 10000),
    item(3, "מוצרי חשמל", "חשמל", 30000),
    item(4, "מיזוג", "חשמל", 30000),
    item(5, "פרקט", "ריצוף", 20000),
    item(6, "נגרות", "נגרות", 40000),
  ],
  tasks: [
    { id: uid(), text: "לתאם מדידות עם הקבלן", done: false },
    { id: uid(), text: "לבדוק חשבון חשמל בדירה החדשה", done: false },
  ],
  updates: [],
};

// מה תת-החברה מדווחת למנכ"ל — מעט, קבוע, ומספיק כדי לכוון תשומת לב
export function summarize(d) {
  if (!d) return null;
  const openTasks = d.tasks.filter(t => !t.done).length;
  const payments = [];
  if (!d.buy.p2Done) payments.push({ label: "פעימה 2 לקבלן", due: d.buy.p2Due });
  if (!d.buy.p3Done) payments.push({ label: d.buy.p3Label, due: d.buy.p3Due });
  payments.sort((a, b) => new Date(a.due) - new Date(b.due));
  const nextPayment = payments[0] || null;
  const daysToPay = nextPayment ? Math.ceil((new Date(nextPayment.due) - new Date()) / 86400000) : null;
  const flag = daysToPay !== null && daysToPay <= 14 ? "red" : openTasks >= 3 ? "amber" : "green";
  return { openTasks, nextPayment, daysToPay, latestUpdate: d.updates[0] || null, flag };
}
