// חוזי Open Banking לקריאה בלבד. אין כאן מימוש ספק, אין רשת, אין credentials.
// ולידטורים מחזירים { ok, value, errors }; כל ערך שיוצא עובר גם בדיקת רגישים (masking).
import { findSensitive, isMasked } from "./masking.js";

export const CONSENT_STATE = Object.freeze({ NONE: "none", PENDING: "pending", ACTIVE: "active", EXPIRED: "expired", REVOKED: "revoked", ERROR: "error" });
export const SYNC_STATE = Object.freeze({ IDLE: "idle", SYNCING: "syncing", OK: "ok", STALE: "stale", ERROR: "error" });
export const ACCOUNT_TYPES = Object.freeze(["checking", "savings", "credit"]);

// מתודות שמותר שיהיו בממשק ספק. כל מתודה אחרת (תשלום/העברה/כתיבה) נפסלת ב-assertReadOnlyAdapter.
export const READ_ONLY_METHODS = Object.freeze(["listConnections", "getConsent", "listAccounts", "listTransactions", "getBalances", "listLoans", "getSyncStatus"]);
const WRITE_HINT = /(pay|transfer|initiate|send|create|delete|remove|update|write|revoke|submit|approve|execute|login|otp|credential)/i;

export function assertReadOnlyAdapter(adapter) {
  const methods = Object.keys(adapter || {}).filter(k => typeof adapter[k] === "function");
  const bad = methods.filter(m => !READ_ONLY_METHODS.includes(m) || WRITE_HINT.test(m));
  if (bad.length) throw new Error(`adapter is not read-only: ${bad.join(", ")}`);
  return adapter;
}

const isNum = v => typeof v === "number" && Number.isFinite(v);
const isIso = v => typeof v === "string" && !Number.isNaN(Date.parse(v));
const isCcy = v => typeof v === "string" && /^[A-Z]{3}$/.test(v);
const isId = v => typeof v === "string" && /^[A-Za-z0-9_\-]{1,64}$/.test(v);
const oneOf = (list, v) => Object.values(list).includes(v);
const finish = (errors, value) => {
  const sensitive = findSensitive(value);
  const all = [...errors, ...sensitive.map(p => `sensitive:${p}`)];
  return all.length ? { ok: false, value: null, errors: all } : { ok: true, value, errors: [] };
};

/** חיבור לבנק/מנפיק + מצב הסכמה. */
export function validateConnection(x) {
  const errors = [];
  if (!isId(x?.id)) errors.push("id");
  if (typeof x?.provider !== "string" || !x.provider) errors.push("provider");
  if (!oneOf(CONSENT_STATE, x?.consentState)) errors.push("consentState");
  if (x?.consentExpiresAt != null && !isIso(x.consentExpiresAt)) errors.push("consentExpiresAt");
  return finish(errors, { id: x?.id, provider: x?.provider, consentState: x?.consentState, consentExpiresAt: x?.consentExpiresAt ?? null });
}

export function validateAccount(x) {
  const errors = [];
  if (!isId(x?.id) || !isId(x?.connectionId)) errors.push("id/connectionId");
  if (typeof x?.name !== "string" || !x.name) errors.push("name");
  if (!ACCOUNT_TYPES.includes(x?.type)) errors.push("type");
  if (!isCcy(x?.currency)) errors.push("currency");
  if (!isMasked(x?.maskedNumber)) errors.push("maskedNumber");
  if (!isNum(x?.balance)) errors.push("balance");
  return finish(errors, { id: x?.id, connectionId: x?.connectionId, name: x?.name, type: x?.type, currency: x?.currency, maskedNumber: x?.maskedNumber, balance: x?.balance });
}

/** amount תמיד חיובי; הכיוון ב-direction (in|out) — תואם לחוזה ב-companies/kesef/adapter.js. */
export function validateTransaction(x) {
  const errors = [];
  if (!isId(x?.id) || !isId(x?.accountId)) errors.push("id/accountId");
  if (!isIso(x?.date)) errors.push("date");
  if (!isNum(x?.amount) || x.amount < 0) errors.push("amount");
  if (!["in", "out"].includes(x?.direction)) errors.push("direction");
  if (!["pending", "booked"].includes(x?.status)) errors.push("status");
  return finish(errors, { id: x?.id, accountId: x?.accountId, date: x?.date, amount: x?.amount, direction: x?.direction, category: typeof x?.category === "string" ? x.category : null, description: typeof x?.description === "string" ? x.description : null, status: x?.status });
}

export function validateBalance(x) {
  const errors = [];
  if (!isId(x?.accountId)) errors.push("accountId");
  if (!isNum(x?.amount)) errors.push("amount");
  if (!isCcy(x?.currency)) errors.push("currency");
  if (!isIso(x?.asOf)) errors.push("asOf");
  return finish(errors, { accountId: x?.accountId, amount: x?.amount, currency: x?.currency, asOf: x?.asOf });
}

export function validateLoan(x) {
  const errors = [];
  if (!isId(x?.id) || !isId(x?.connectionId)) errors.push("id/connectionId");
  if (!isNum(x?.balance) || x.balance < 0) errors.push("balance");
  if (!isNum(x?.monthlyPayment) || x.monthlyPayment < 0) errors.push("monthlyPayment");
  if (!isCcy(x?.currency)) errors.push("currency");
  if (x?.nextPaymentDate != null && !isIso(x.nextPaymentDate)) errors.push("nextPaymentDate");
  return finish(errors, { id: x?.id, connectionId: x?.connectionId, lender: typeof x?.lender === "string" ? x.lender : null, balance: x?.balance, monthlyPayment: x?.monthlyPayment, currency: x?.currency, nextPaymentDate: x?.nextPaymentDate ?? null });
}

export function validateSyncStatus(x) {
  const errors = [];
  if (!isId(x?.connectionId)) errors.push("connectionId");
  if (!oneOf(SYNC_STATE, x?.state)) errors.push("state");
  if (x?.lastSyncAt != null && !isIso(x.lastSyncAt)) errors.push("lastSyncAt");
  if (x?.state === SYNC_STATE.ERROR && typeof x?.error !== "string") errors.push("error");
  return finish(errors, { connectionId: x?.connectionId, state: x?.state, lastSyncAt: x?.lastSyncAt ?? null, error: typeof x?.error === "string" ? x.error : null });
}

/** מעטפת תשובה אחידה: מקור, מצב (mock|live), רעננות ושגיאה. data:null כשאין נתון — לעולם לא ממציאים. */
export function envelope({ mode, status, asOf = null, data = null, error = null }) {
  return { mode, status, asOf, data, error };
}
