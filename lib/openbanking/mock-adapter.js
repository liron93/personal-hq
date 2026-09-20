// Mock בלבד — כדי ששבתאי יוכל לבדוק UI בלי בנק אמיתי. כל תשובה מסומנת mode:"mock",
// הנתונים מומצאים בבירור (שמות/מספרים לא אמיתיים) ומספרי החשבון ממוסכים.
// הממשק קריאה-בלבד (READ_ONLY_METHODS); אין credentials/OTP/scraping/תשלומים/העברות.
import { READ_ONLY_METHODS, assertReadOnlyAdapter, envelope, validateAccount, validateBalance, validateConnection, validateLoan, validateSyncStatus, validateTransaction, SYNC_STATE, CONSENT_STATE } from "./contracts.js";
import { maskNumber } from "./masking.js";

const day = (now, back) => new Date(now - back * 86_400_000).toISOString().slice(0, 10);

function build(now) {
  const asOf = new Date(now).toISOString();
  const connection = { id: "conn-mock-1", provider: "בנק לדוגמה (mock)", consentState: CONSENT_STATE.ACTIVE, consentExpiresAt: new Date(now + 60 * 86_400_000).toISOString() };
  const accounts = [
    { id: "acc-mock-checking", connectionId: connection.id, name: "עו״ש (דמו)", type: "checking", currency: "ILS", maskedNumber: maskNumber("00-000-000001234"), balance: 12480.5 },
    { id: "acc-mock-credit", connectionId: connection.id, name: "אשראי (דמו)", type: "credit", currency: "ILS", maskedNumber: maskNumber("0000 0000 0000 5678"), balance: -3120 },
  ];
  const t = (id, back, amount, direction, category, description, status = "booked") => ({ id, accountId: "acc-mock-checking", date: day(now, back), amount, direction, category, description, status });
  const transactions = [
    t("tx-m-01", 20, 17500, "in", "משכורת", "משכורת (דמו)"),
    t("tx-m-02", 19, 15500, "in", "משכורת", "משכורת בת זוג (דמו)"),
    t("tx-m-03", 18, 8500, "out", "משכנתא", "החזר משכנתא (דמו)"),
    t("tx-m-04", 15, 640, "out", "מזון", "סופרמרקט (דמו)"),
    t("tx-m-05", 13, 210, "out", "מנויים", "מנוי סטרימינג (דמו)"),
    t("tx-m-06", 11, 520, "out", "ביטוחים", "ביטוח רכב (דמו)"),
    t("tx-m-07", 9, 380, "out", "פנאי", "מסעדה (דמו)"),
    t("tx-m-08", 6, 710, "out", "מזון", "סופרמרקט (דמו)"),
    t("tx-m-09", 3, 1500, "out", "חיסכון", "הפקדה לחיסכון (דמו)"),
    t("tx-m-10", 1, 95, "out", "אחר", "חניה (דמו)", "pending"),
  ];
  const balances = accounts.map(a => ({ accountId: a.id, amount: a.balance, currency: a.currency, asOf }));
  const loans = [{ id: "loan-mock-1", connectionId: connection.id, lender: "בנק לדוגמה (mock)", balance: 610000, monthlyPayment: 8500, currency: "ILS", nextPaymentDate: day(now, -10) }];
  const sync = { connectionId: connection.id, state: SYNC_STATE.OK, lastSyncAt: asOf, error: null };
  return { asOf, connection, accounts, transactions, balances, loans, sync };
}

const wrap = (asOf, data) => envelope({ mode: "mock", status: data == null || (Array.isArray(data) && !data.length) ? "empty" : "ok", asOf, data });

export function createMockOpenBankingAdapter({ now = Date.now() } = {}) {
  const s = build(now);
  const adapter = {
    async listConnections() { return wrap(s.asOf, [validateConnection(s.connection).value]); },
    async getConsent(connectionId) { return wrap(s.asOf, connectionId === s.connection.id ? validateConnection(s.connection).value : null); },
    async listAccounts(connectionId) { return wrap(s.asOf, connectionId === s.connection.id ? s.accounts.map(a => validateAccount(a).value) : []); },
    async listTransactions(accountId, { from, to } = {}) {
      const rows = s.transactions.filter(x => x.accountId === accountId && (!from || x.date >= from) && (!to || x.date <= to));
      return wrap(s.asOf, rows.map(x => validateTransaction(x).value));
    },
    async getBalances(connectionId) { return wrap(s.asOf, connectionId === s.connection.id ? s.balances.map(b => validateBalance(b).value) : []); },
    async listLoans(connectionId) { return wrap(s.asOf, connectionId === s.connection.id ? s.loans.map(l => validateLoan(l).value) : []); },
    async getSyncStatus(connectionId) { return wrap(s.asOf, connectionId === s.connection.id ? validateSyncStatus(s.sync).value : null); },
  };
  return assertReadOnlyAdapter(adapter);
}

// צורת ה-feed שממשק kesef (companies/kesef/adapter.js) מצפה לה מחיבור עתידי, כדי לבדוק UI על mock.
export async function toKesefFeed(adapter) {
  const [{ data: connections }] = await Promise.all([adapter.listConnections()]);
  const conn = connections?.[0];
  if (!conn) return { mode: "mock", refreshedAt: null, accounts: [], transactions: [], loans: [] };
  const [accounts, loans, sync] = await Promise.all([adapter.listAccounts(conn.id), adapter.listLoans(conn.id), adapter.getSyncStatus(conn.id)]);
  const txs = (await Promise.all((accounts.data || []).map(a => adapter.listTransactions(a.id)))).flatMap(r => r.data || []);
  return {
    mode: "mock",
    refreshedAt: sync.data?.lastSyncAt ?? null,
    accounts: (accounts.data || []).map(a => ({ id: a.id, name: a.name, balance: a.balance, currency: a.currency, maskedNumber: a.maskedNumber })),
    transactions: txs.map(x => ({ id: x.id, date: x.date, amount: x.amount, direction: x.direction, category: x.category, status: x.status })),
    loans: (loans.data || []).map(l => ({ id: l.id, balance: l.balance, monthlyPayment: l.monthlyPayment })),
  };
}

export { READ_ONLY_METHODS };
