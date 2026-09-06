import { uid } from "@/lib/format";

export const STORE_KEY = "hq:kesef:v1";

// ששת האפיקים שמרכיבים את השווי הנקי — מפתח + תווית בעברית, בשימוש ב-Dash וב-Assets
export const ASSET_KEYS = [
  { k: "cash", l: "עו״ש / מזומן" },
  { k: "stocks", l: "מניות" },
  { k: "funds", l: "קרנות (נאמנות / סל)" },
  { k: "crypto", l: "קריפטו" },
  { k: "pension", l: "פנסיה" },
  { k: "kerenHishtalmut", l: "קרן השתלמות" },
];

export const BUDGET_CATS_DEFAULT = ["מזון", "ביטוחים", "מנויים", "פנאי", "חיסכון", "אחר"];

// קטגוריית תקציב — אותו דפוס כמו פריט exp/reno בבית חדש: est=מתוכנן, act=בפועל החודש
export const bEff = b => ((b.act || 0) > 0 ? b.act : b.est) || 0;
export const bOver = b => (b.act || 0) > 0 && (b.act || 0) > (b.est || 0);
export const assetsTotal = a => ASSET_KEYS.reduce((s, { k }) => s + (a?.[k] || 0), 0);

const cat = (id, n, est) => ({ id, n, cat: n, est, act: 0, done: false });

export const INIT = {
  // הכנסות + החזר משכנתא נקראים מ-lib/coreFacts.js — לא משוכפלים כאן
  assets: { cash: 0, stocks: 0, funds: 0, crypto: 0, pension: 0, kerenHishtalmut: 0 },
  budget: [
    cat(1, "מזון", 0),
    cat(2, "ביטוחים", 0),
    cat(3, "מנויים", 0),
    cat(4, "פנאי", 0),
    cat(5, "חיסכון", 0),
    cat(6, "אחר", 0),
  ],
  tasks: [],
  updates: [],
};

// מה תת-החברה מדווחת למנכ"ל — מעט, קבוע, ומספיק כדי לכוון תשומת לב
export function summarize(d) {
  if (!d) return null;
  const openTasks = d.tasks.filter(t => !t.done).length;
  const netWorth = assetsTotal(d.assets);
  const overBudget = d.budget.filter(bOver).length;
  const flag = overBudget >= 3 ? "amber" : openTasks >= 3 ? "amber" : "green";
  return { openTasks, latestUpdate: d.updates[0] || null, flag, netWorth, overBudget };
}
