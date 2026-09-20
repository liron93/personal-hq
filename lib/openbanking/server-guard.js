// כל token/secret של Open Banking נשאר בשרת בלבד. אין כאן ערכים; אין credentials/OTP בשום שלב.
const NAME = /^OPENBANKING_[A-Z0-9_]+$/;

export function assertServerOnly() {
  if (typeof window !== "undefined") throw new Error("open banking secrets are server-only");
}

export function readOpenBankingSecret(name, env = process.env) {
  assertServerOnly();
  if (!NAME.test(name)) throw new Error("open banking secret names must start with OPENBANKING_ (never NEXT_PUBLIC_)");
  const value = env[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
