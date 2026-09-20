// Masking + סריקת רגישים. עיקרון: חוזי Open Banking לא נושאים מספר חשבון/כרטיס מלא,
// ולעולם לא credentials / OTP / tokens. כל מה שיוצא מהשרת ללקוח עובר את הבדיקות האלה.

const digitsOnly = v => String(v ?? "").replace(/\D/g, "");

/** "12-345-678901" → "••••8901". פחות מ-4 ספרות → "••••" בלבד (לא חושפים). */
export function maskNumber(value) {
  const d = digitsOnly(value);
  return d.length >= 4 ? `••••${d.slice(-4)}` : "••••";
}

export const isMasked = v => typeof v === "string" && /^••••\d{0,4}$/.test(v);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;
const LONG_NUMBER = /\d[\d\s-]{8,}\d/; // 10+ ספרות רצופות (עם מפרידים) = מספר חשבון/כרטיס אפשרי
const FORBIDDEN_KEYS = ["password", "passwd", "otp", "pin", "cvv", "credentials", "token", "accesstoken", "refreshtoken", "secret", "clientsecret", "usercode"];

/** מחזיר רשימת נתיבים בעייתיים בתוך אובייקט (ריק = נקי). */
export function findSensitive(value, path = "$") {
  const hits = [];
  if (Array.isArray(value)) value.forEach((v, i) => hits.push(...findSensitive(v, `${path}[${i}]`)));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.includes(k.toLowerCase())) hits.push(`${path}.${k}`);
      hits.push(...findSensitive(v, `${path}.${k}`));
    }
  } else if (typeof value === "string" && !ISO_DATE.test(value) && !isMasked(value) && LONG_NUMBER.test(value)) hits.push(path);
  return hits;
}

export function assertNoSensitive(value) {
  const hits = findSensitive(value);
  if (hits.length) throw new Error(`sensitive data in payload: ${hits.join(", ")}`);
  return value;
}
