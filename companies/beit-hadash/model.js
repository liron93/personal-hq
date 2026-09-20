export const STORE_KEY = "hq:beit-hadash:v2";

export const CHECKLIST_GROUPS = ["בקבלת המפתח", "לפני הכניסה", "אחרי הכניסה"];

// רשימת התחלה כללית למעבר לדירה חדשה — מזהים קבועים (לא אקראיים), כדי שלא ישתנו בין רינדורים לפני השמירה הראשונה. אפשר למחוק ולהוסיף חופשי.
export const DEFAULT_CHECKLIST = [
  ["בדק בית מקצועי ורישום ליקויים", 0], ["קריאת מונים (מים, חשמל, גז) וצילום", 0], ["קבלת כל המפתחות, השלטים והשלט־רחוק", 0],
  ["העברת חשבונות (חשמל, מים, גז, ארנונה) על שמי", 1], ["ביטוח דירה (מבנה ותכולה)", 1], ["התקנת אינטרנט וטלוויזיה", 1], ["ניקיון אחרי שיפוץ", 1], ["הזמנת הובלה", 1],
  ["עדכון כתובת (משרד הפנים, בנק, ביטוח, עבודה)", 2], ["הכרות עם ועד הבית וקבלת פרטי קשר", 2],
].map(([text, g], i) => ({ id: `cl-${i + 1}`, text, group: CHECKLIST_GROUPS[g], done: false }));

export const INIT = {
  renovationV2: true,
  items: [
    { id: "appliances", name: "מוצרי חשמל", room: "מטבח", category: "מוצרי חשמל", supplierId: "", estimate: 30000, finalCost: 0, status: "בהצעת מחיר", dueDate: "", link: "", note: "חלק מהעלות כבר שולם — יש להזין תשלום ואסמכתה", payments: [], files: [], beforeMove: true, updatedAt: "" },
    { id: "aircon", name: "מיזוג אוויר", room: "מערכות", category: "מיזוג", supplierId: "", estimate: 30000, finalCost: 0, status: "לבחירה", dueDate: "", link: "", note: "", payments: [], files: [], beforeMove: true, updatedAt: "" },
    { id: "flooring", name: "פרקט", room: "סלון", category: "פרקט וריצוף", supplierId: "", estimate: 20000, finalCost: 0, status: "לבחירה", dueDate: "", link: "", note: "", payments: [], files: [], beforeMove: false, updatedAt: "" },
    { id: "carpentry", name: "נגרות", room: "מטבח", category: "נגרות", supplierId: "", estimate: 40000, finalCost: 0, status: "לבחירה", dueDate: "", link: "", note: "", payments: [], files: [], beforeMove: true, updatedAt: "" },
  ],
  suppliers: [],
  milestones: [
    { id: "handover", name: "קבלת מפתח", date: "", status: "דורש אימות", blocker: "יש לאמת שנה ומועד" },
    { id: "move", name: "כניסה לדירה", date: "", status: "דורש אימות", blocker: "יש לאמת שנה ומועד" },
  ],
  documents: [],
  checklist: DEFAULT_CHECKLIST,
};

export function summarize(data) {
  const d = data?.renovationV2 ? data : INIT;
  const urgent = d.items.filter(item => item.beforeMove && item.status !== "הושלם");
  const planned = d.items.reduce((sum, item) => sum + Number(item.finalCost || item.estimate || 0), 0);
  const paid = d.items.reduce((sum, item) => sum + item.payments.reduce((subtotal, payment) => subtotal + Number(payment.amount || 0), 0), 0);
  return {
    openTasks: urgent.length,
    nextPayment: null,
    daysToPay: null,
    latestUpdate: null,
    flag: urgent.length ? "amber" : "green",
    renovation: { planned, paid, urgent: urgent.length },
  };
}
