// הגנת מפתחות ספק: מפתח נקרא רק בצד שרת ולעולם לא מגיע לדפדפן או ל-Git.
// שימוש (Route Handler בלבד): const key = readProviderKey("FINNHUB_API_KEY");
// אין כאן ערך מפתח, אין לוג של ערכים, ושם שמתחיל ב-NEXT_PUBLIC_ נדחה (Next.js צורב אותו ל-bundle).

const NAME = /^[A-Z][A-Z0-9_]*$/;
const SECRET_HINT = /(KEY|SECRET|TOKEN|PASSWORD)/;

export function assertServerOnly() {
  if (typeof window !== "undefined") throw new Error("provider keys are server-only");
}

export function readProviderKey(name, env = process.env) {
  assertServerOnly();
  if (!NAME.test(name)) throw new Error("invalid key name");
  if (name.startsWith("NEXT_PUBLIC_")) throw new Error("provider keys must not use NEXT_PUBLIC_");
  const value = env[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// משתני סביבה שנראים כמו סוד אבל יישרפו לדפדפן — לשימוש בבדיקה/CI.
export function findExposedSecrets(env = process.env) {
  return Object.keys(env).filter(k => k.startsWith("NEXT_PUBLIC_") && SECRET_HINT.test(k));
}
