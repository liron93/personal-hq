// חוזה research signal. זה כלי תיעוד/מחקר, לא מנוע המלצות:
// - התנאים מוגדרים על ידי המשתמש (מדד + אופרטור + סף), לא נבחרים על ידי המערכת.
// - ה-thesis / risks / invalidation הם טקסט שהמשתמש כותב, לא מיוצר על ידי מודל.
// - אין בחוזה שום שדה פעולה (buy/sell/action) ואין ביצוע מסחר; ולידציה דוחה שדות כאלה.
// - מדד שחסר בנתונים נרשם כ"לא ידוע", לא כמתקיים ולא כלא-מתקיים, ולא מומצא.

export const OPERATORS = Object.freeze({
  gt: (a, b) => a > b, gte: (a, b) => a >= b, lt: (a, b) => a < b, lte: (a, b) => a <= b, eq: (a, b) => a === b,
});

const FORBIDDEN_KEYS = ["action", "buy", "sell", "recommendation", "recommend", "order", "trade", "rating", "score", "target"];
const hasForbidden = obj => obj && typeof obj === "object" && Object.keys(obj).some(k => FORBIDDEN_KEYS.includes(k.toLowerCase()));

export function createCondition({ id, label, metric, operator, threshold }) {
  if (typeof id !== "string" || !id) throw new Error("condition.id");
  if (typeof metric !== "string" || !metric) throw new Error("condition.metric");
  if (!(operator in OPERATORS)) throw new Error("condition.operator");
  if (typeof threshold !== "number" || !Number.isFinite(threshold)) throw new Error("condition.threshold");
  return { id, label: typeof label === "string" && label ? label : id, metric, operator, threshold, definedBy: "user" };
}

const text = v => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * @param {{symbol:string, conditions:ReturnType<typeof createCondition>[], metrics:Record<string,number|null|undefined>, thesis?:string, risks?:string, invalidation?:string, now?:number}} input
 */
export function evaluateSignal({ symbol, conditions, metrics = {}, thesis, risks, invalidation, now = Date.now() }) {
  if (hasForbidden({ thesis, risks, invalidation }) || (conditions || []).some(hasForbidden)) throw new Error("signal must not contain trading actions");
  const met = [], notMet = [], unknown = [];
  for (const c of conditions || []) {
    const value = metrics[c.metric];
    if (typeof value !== "number" || !Number.isFinite(value)) { unknown.push({ ...c, value: null }); continue; }
    (OPERATORS[c.operator](value, c.threshold) ? met : notMet).push({ ...c, value });
  }
  return {
    symbol,
    evaluatedAt: new Date(now).toISOString(),
    conditionsMet: met,
    conditionsNotMet: notMet,
    conditionsUnknown: unknown,
    thesis: text(thesis),
    risks: text(risks),
    invalidation: text(invalidation),
    authoredBy: "user",
  };
}

export function validateSignal(signal) {
  const errors = [];
  if (!signal || typeof signal !== "object") return { ok: false, errors: ["signal"] };
  if (hasForbidden(signal)) errors.push("forbidden-field");
  for (const key of ["conditionsMet", "conditionsNotMet", "conditionsUnknown"]) if (!Array.isArray(signal[key])) errors.push(key);
  for (const key of ["thesis", "risks", "invalidation"]) if (signal[key] != null && typeof signal[key] !== "string") errors.push(key);
  return { ok: !errors.length, errors };
}
