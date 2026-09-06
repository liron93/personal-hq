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

// "YYYY-MM" של חודש קלנדרי (ברירת מחדל: עכשיו)
export const ym = (dt = new Date()) => dt.toISOString().slice(0, 7);

// צילום מצב: העתק נקי של כל שדות assets + הסכום הכולל, מתויג בחודש
const makeSnapshot = (assets, month) => ({
  id: uid(),
  month,
  assets: ASSET_KEYS.reduce((o, { k }) => ({ ...o, [k]: assets?.[k] || 0 }), {}),
  total: assetsTotal(assets),
});

// אם אין ב-history רשומה לחודש הנוכחי — מוסיף אחת עם ה-assets הנוכחיים; אחרת מחזיר d כמות שהוא
export function ensureCurrentMonthSnapshot(d) {
  if (!d) return d;
  const month = ym();
  const history = d.history || [];
  if (history.some(h => h.month === month)) return d;
  return { ...d, history: [...history, makeSnapshot(d.assets, month)] };
}

// upsert: יוצר או מעדכן את צילום החודש הנוכחי עם ה-assets העדכניים (כפתור ידני)
export function snapshotNow(d) {
  if (!d) return d;
  const month = ym();
  const history = d.history || [];
  const snap = makeSnapshot(d.assets, month);
  const idx = history.findIndex(h => h.month === month);
  if (idx === -1) return { ...d, history: [...history, snap] };
  const next = history.slice();
  next[idx] = { ...next[idx], assets: snap.assets, total: snap.total };
  return { ...d, history: next };
}

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
  history: [], // צילומי שווי נקי חודשיים: { id, month:"YYYY-MM", assets:{...}, total }
};

// מה תת-החברה מדווחת למנכ"ל — מעט, קבוע, ומספיק כדי לכוון תשומת לב
export function summarize(d) {
  if (!d) return null;
  const openTasks = d.tasks.filter(t => !t.done).length;
  const netWorth = assetsTotal(d.assets);
  const overBudget = d.budget.filter(bOver).length;
  const flag = overBudget >= 3 ? "amber" : openTasks >= 3 ? "amber" : "green";
  const hist = (d.history || []).slice().sort((a, b) => (a.month < b.month ? -1 : 1));
  const netWorthChange = hist.length >= 2 ? hist[hist.length - 1].total - hist[hist.length - 2].total : null;
  return { openTasks, latestUpdate: d.updates[0] || null, flag, netWorth, overBudget, netWorthChange };
}
