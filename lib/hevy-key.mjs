// הצפנה/פענוח של מפתח Hevy האישי של המשתמש לפני שמירה ב-Supabase (health_hevy_connection).
// אותו דפוס קריפטוגרפי בדיוק כמו lib/market-key.mjs (AES-256-GCM, AAD קשור ל-userId כדי
// שאי אפשר להשתמש בציפר-טקסט של משתמש אחד בשביל משתמש אחר) - עם שם secret נפרד
// (HEVY_KEY_ENCRYPTION_SECRET) כדי שסיבוב/דליפה של מפתח אחד לא ישפיעו על השני.
// בניגוד ל-market-key.mjs: אין כאן תפוגה (TTL) - מפתח Hevy שהמשתמש שמר לא "פג" מעצמו,
// רק אם המשתמש/ת מנתקים בפירוש.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** 64 תווי הקס = 32 בייט - בדיוק הגודל הדרוש ל-AES-256. "fail closed": secret חסר/בפורמט לא
    תקין => false, לא זריקה - הקריאה ל-sealHevyKey/openHevyKey תיכשל בבירור אחרי זה. */
export function hevyEncryptionReady(secret) {
  return /^[a-f0-9]{64}$/i.test(secret || "");
}

export function sealHevyKey(apiKey, userId, secret) {
  if (!hevyEncryptionReady(secret)) throw new Error("Hevy key encryption not configured");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(secret, "hex"), iv);
  cipher.setAAD(Buffer.from(userId));
  const data = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}

/** null בכל כשל (secret לא תקין/userId לא תואם/ציפר-טקסט פגום) - לעולם לא זורק וחושף פרטים. */
export function openHevyKey(sealed, userId, secret) {
  try {
    if (!hevyEncryptionReady(secret) || !sealed || sealed.length > 4096) return null;
    const data = Buffer.from(sealed, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", Buffer.from(secret, "hex"), data.subarray(0, 12));
    decipher.setAAD(Buffer.from(userId));
    decipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8") || null;
  } catch {
    return null;
  }
}
