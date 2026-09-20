import assert from "node:assert/strict";
import test from "node:test";
import { readdir, readFile } from "node:fs/promises";

const contracts = await import("../lib/openbanking/contracts.js");
const masking = await import("../lib/openbanking/masking.js");
const mock = await import("../lib/openbanking/mock-adapter.js");
const guard = await import("../lib/openbanking/server-guard.js");

const NOW = Date.parse("2026-09-20T12:00:00Z");

test("masking keeps only the last 4 digits and flags long numbers / credentials", () => {
  assert.equal(masking.maskNumber("12-345-678901"), "••••8901");
  assert.equal(masking.maskNumber("12"), "••••");
  assert.equal(masking.isMasked("••••8901"), true);
  assert.equal(masking.isMasked("12-345-678901"), false);
  assert.deepEqual(masking.findSensitive({ a: "2026-09-20T10:00:00Z", b: "••••1234" }), []);
  assert.deepEqual(masking.findSensitive({ card: "4580 1234 5678 9012" }), ["$.card"]);
  assert.deepEqual(masking.findSensitive({ nested: { password: "x", otp: "1" } }).sort(), ["$.nested.otp", "$.nested.password"]);
  assert.throws(() => masking.assertNoSensitive({ token: "abc" }));
});

test("account contract rejects an unmasked account number and any credential field", () => {
  const ok = { id: "a1", connectionId: "c1", name: "עו״ש", type: "checking", currency: "ILS", maskedNumber: "••••1234", balance: 10 };
  assert.equal(contracts.validateAccount(ok).ok, true);
  assert.equal(contracts.validateAccount({ ...ok, maskedNumber: "12-345-678901" }).ok, false);
  assert.equal(contracts.validateAccount({ ...ok, name: "12-345-678901234" }).ok, false);
  assert.equal(contracts.validateConnection({ id: "c1", provider: "p", consentState: "active" }).ok, true);
  assert.equal(contracts.validateConnection({ id: "c1", provider: "p", consentState: "maybe" }).ok, false);
});

test("transactions, balances, loans and sync status validate their shape", () => {
  assert.equal(contracts.validateTransaction({ id: "t1", accountId: "a1", date: "2026-09-01", amount: 10, direction: "out", status: "booked" }).ok, true);
  assert.equal(contracts.validateTransaction({ id: "t1", accountId: "a1", date: "2026-09-01", amount: -10, direction: "out", status: "booked" }).ok, false);
  assert.equal(contracts.validateTransaction({ id: "t1", accountId: "a1", date: "2026-09-01", amount: 10, direction: "sideways", status: "booked" }).ok, false);
  assert.equal(contracts.validateBalance({ accountId: "a1", amount: 5, currency: "ILS", asOf: "2026-09-20T00:00:00Z" }).ok, true);
  assert.equal(contracts.validateLoan({ id: "l1", connectionId: "c1", balance: 1, monthlyPayment: 1, currency: "ILS" }).ok, true);
  assert.equal(contracts.validateSyncStatus({ connectionId: "c1", state: "error" }).ok, false); // שגיאה בלי הודעה
  assert.equal(contracts.validateSyncStatus({ connectionId: "c1", state: "error", error: "timeout" }).ok, true);
});

test("adapters must be read-only: no pay/transfer/login/credential methods", () => {
  const readOnly = Object.fromEntries(contracts.READ_ONLY_METHODS.map(m => [m, () => null]));
  assert.doesNotThrow(() => contracts.assertReadOnlyAdapter(readOnly));
  for (const bad of ["initiatePayment", "transfer", "login", "submitOtp", "revokeConsent", "createStandingOrder"]) {
    assert.throws(() => contracts.assertReadOnlyAdapter({ ...readOnly, [bad]: () => null }), /not read-only/);
  }
});

test("mock adapter returns only contract-valid, masked, clearly-mock data", async () => {
  const adapter = mock.createMockOpenBankingAdapter({ now: NOW });
  const conns = await adapter.listConnections();
  assert.equal(conns.mode, "mock");
  const conn = conns.data[0];
  const accounts = await adapter.listAccounts(conn.id);
  assert.equal(accounts.data.length, 2);
  for (const a of accounts.data) { assert.equal(contracts.validateAccount(a).ok, true); assert.match(a.maskedNumber, /^••••\d{4}$/); }
  const txs = await adapter.listTransactions("acc-mock-checking");
  assert.ok(txs.data.length >= 8);
  for (const x of txs.data) assert.equal(contracts.validateTransaction(x).ok, true);
  const recent = await adapter.listTransactions("acc-mock-checking", { from: "2026-09-15" });
  assert.ok(recent.data.length < txs.data.length && recent.data.every(x => x.date >= "2026-09-15"));
  assert.equal((await adapter.getBalances(conn.id)).data.every(b => contracts.validateBalance(b).ok), true);
  assert.equal((await adapter.listLoans(conn.id)).data.every(l => contracts.validateLoan(l).ok), true);
  assert.equal(contracts.validateSyncStatus((await adapter.getSyncStatus(conn.id)).data).ok, true);
  const unknown = await adapter.listAccounts("nope");
  assert.equal(unknown.status, "empty");
  assert.deepEqual(unknown.data, []); // חיבור לא מוכר: אין נתונים, לא נתוני דמו
  assert.deepEqual(masking.findSensitive([conns, accounts, txs]), []);
});

test("kesef feed shape matches the future contract in companies/kesef/adapter.js", async () => {
  const feed = await mock.toKesefFeed(mock.createMockOpenBankingAdapter({ now: NOW }));
  assert.equal(feed.mode, "mock");
  assert.ok(feed.refreshedAt);
  assert.deepEqual(Object.keys(feed.transactions[0]).sort(), ["amount", "category", "date", "direction", "id", "status"]);
  assert.deepEqual(Object.keys(feed.loans[0]).sort(), ["balance", "id", "monthlyPayment"]);
  const income = feed.transactions.filter(x => x.direction === "in").reduce((s, x) => s + x.amount, 0);
  assert.equal(income, 33000);
});

test("secrets are server-only (OPENBANKING_ prefix) and none are hardcoded", async () => {
  assert.equal(guard.readOpenBankingSecret("OPENBANKING_CLIENT_ID", { OPENBANKING_CLIENT_ID: " x " }), "x");
  assert.equal(guard.readOpenBankingSecret("OPENBANKING_CLIENT_ID", {}), null);
  assert.throws(() => guard.readOpenBankingSecret("NEXT_PUBLIC_OPENBANKING_TOKEN", { NEXT_PUBLIC_OPENBANKING_TOKEN: "x" }));
  assert.throws(() => guard.readOpenBankingSecret("FINNHUB_API_KEY", {}));
  globalThis.window = {};
  try { assert.throws(() => guard.readOpenBankingSecret("OPENBANKING_CLIENT_ID", { OPENBANKING_CLIENT_ID: "x" })); } finally { delete globalThis.window; }
  const patterns = [/AIza[0-9A-Za-z_\-]{20,}/, /\bsk-[A-Za-z0-9]{20,}/, /Bearer\s+[A-Za-z0-9._\-]{20,}/];
  for (const file of await readdir(new URL("../lib/openbanking/", import.meta.url))) {
    const src = await readFile(new URL(`../lib/openbanking/${file}`, import.meta.url), "utf8");
    for (const p of patterns) assert.doesNotMatch(src, p, `${file} looks like it contains a secret`);
  }
});
