// לוגיקת כל ה-routes של חיבור Hevy, מופרדת מה-route עצמו לבדיקה בלי רשת/DB אמיתיים - אותו
// דפוס בדיוק כמו lib/riseup-handler.mjs/lib/receipt-scan-handler.mjs.
// סדר קבוע בכל handler: guard (אימות+קצב, user_id תמיד מה-session בלבד) -> secret/DB מוגדרים? ->
// הרשאה (כל שאילתה מסוננת ל-user_id של ה-session בלבד) -> service/store -> תשובה שלעולם לא
// כוללת ciphertext/מפתח/פרטי Hevy מיותרים.
import { fail, reply, readJsonBody, logCode } from "./api-utils.mjs";
import { HevyError } from "./hevy-service.mjs";
import { hevyEncryptionReady, sealHevyKey, openHevyKey } from "./hevy-key.mjs";
import { getHevyConnection, saveHevyConnection, recordHevyCheck, removeHevyConnection } from "./hevy-store.mjs";

const MAX_BODY_BYTES = 4 * 1024;
const MAX_KEY_LEN = 500;

const STATUS_BY_CODE = { invalid_key: 400, rate_limited: 429, network_error: 502, unavailable: 502, not_connected: 400, decrypt_failed: 502, db_error: 502 };

function hevyErrorReply(error) {
  if (error instanceof HevyError) return reply({ error: error.message, code: error.code, configured: true }, STATUS_BY_CODE[error.code] || 502);
  throw error;
}

/** secret ו-admin client מוגדרים? משותף לכל ה-handlers - "לא מוגדר" הוא מצב שקוף (503), לא קריסה. */
async function requireHevyInfra({ getEncryptionSecret, getAdmin }) {
  const secret = getEncryptionSecret();
  if (!hevyEncryptionReady(secret)) return { ok: false, response: reply({ error: "חיבור Hevy עדיין לא מוגדר בשרת.", code: "not_configured", configured: false }, 503) };
  const admin = await getAdmin();
  if (!admin) return { ok: false, response: reply({ error: "חיבור Hevy עדיין לא מוגדר בשרת.", code: "not_configured", configured: false }, 503) };
  return { ok: true, secret, admin };
}

export function createHevyConnectHandler({ guard, getEncryptionSecret, getAdmin, service, scope = "hevy-connect" }) {
  return async function POST(request) {
    try {
      const gate = await guard(request, { scope, limit: 5, windowMs: 60000, allowDemo: false });
      if (!gate.ok) return gate.response;
      const infra = await requireHevyInfra({ getEncryptionSecret, getAdmin });
      if (!infra.ok) return infra.response;

      const parsed = await readJsonBody(request, MAX_BODY_BYTES);
      if (!parsed.ok) return parsed.response;
      const apiKey = parsed.value && typeof parsed.value === "object" ? parsed.value.apiKey : null;
      if (typeof apiKey !== "string" || !apiKey.trim() || apiKey.length > MAX_KEY_LEN) return fail("bad_request", 400);

      // דרישת עמית: בדיקה מול Hevy באותה בקשה, לפני שמירה - מפתח לא תקין לא נשמר, אפילו לא מוצפן.
      try {
        await service.testConnection(apiKey.trim());
      } catch (error) {
        return hevyErrorReply(error);
      }
      const sealed = sealHevyKey(apiKey.trim(), gate.user.id, infra.secret);
      const saved = await saveHevyConnection(infra.admin, gate.user.id, sealed);
      if (!saved) { logCode(scope, "db_error"); return fail("unavailable", 502); }
      return reply({ connected: true });
    } catch {
      logCode(scope, "internal");
      return fail("unavailable", 500);
    }
  };
}

export function createHevyStatusHandler({ guard, getEncryptionSecret, getAdmin, scope = "hevy-status" }) {
  return async function GET(request) {
    try {
      const gate = await guard(request, { scope, limit: 30, windowMs: 60000, allowDemo: false });
      if (!gate.ok) return gate.response;
      const secret = getEncryptionSecret();
      const admin = hevyEncryptionReady(secret) ? await getAdmin() : null;
      if (!admin) return reply({ configured: false, connected: false });
      const conn = await getHevyConnection(admin, gate.user.id);
      return reply({ configured: true, connected: !!conn, lastCheckedAt: conn?.lastCheckedAt ?? null, lastCheckOk: conn?.lastCheckOk ?? null });
    } catch {
      logCode(scope, "internal");
      return fail("unavailable", 500);
    }
  };
}

export function createHevyTestHandler({ guard, getEncryptionSecret, getAdmin, service, scope = "hevy-test" }) {
  return async function POST(request) {
    try {
      const gate = await guard(request, { scope, limit: 10, windowMs: 60000, allowDemo: false });
      if (!gate.ok) return gate.response;
      const infra = await requireHevyInfra({ getEncryptionSecret, getAdmin });
      if (!infra.ok) return infra.response;

      const conn = await getHevyConnection(infra.admin, gate.user.id);
      if (!conn) return reply({ error: "אין חיבור Hevy שמור.", code: "not_connected", configured: true }, 400);
      const apiKey = openHevyKey(conn.encryptedApiKey, gate.user.id, infra.secret);
      if (!apiKey) { await recordHevyCheck(infra.admin, gate.user.id, false); return reply({ error: "לא ניתן לפענח את המפתח השמור.", code: "decrypt_failed", configured: true }, 502); }

      try {
        const result = await service.testConnection(apiKey);
        await recordHevyCheck(infra.admin, gate.user.id, true);
        return reply({ ok: true, username: result.username });
      } catch (error) {
        await recordHevyCheck(infra.admin, gate.user.id, false);
        return hevyErrorReply(error);
      }
    } catch {
      logCode(scope, "internal");
      return fail("unavailable", 500);
    }
  };
}

export function createHevyDisconnectHandler({ guard, getAdmin, scope = "hevy-disconnect" }) {
  return async function POST(request) {
    try {
      const gate = await guard(request, { scope, limit: 10, windowMs: 60000, allowDemo: false });
      if (!gate.ok) return gate.response;
      const admin = await getAdmin();
      if (!admin) return reply({ error: "חיבור Hevy עדיין לא מוגדר בשרת.", code: "not_configured", configured: false }, 503);
      await removeHevyConnection(admin, gate.user.id);
      return reply({ connected: false });
    } catch {
      logCode(scope, "internal");
      return fail("unavailable", 500);
    }
  };
}

export function createHevyImportHandler({ guard, getEncryptionSecret, getAdmin, service, scope = "hevy-import" }) {
  return async function POST(request) {
    try {
      const gate = await guard(request, { scope, limit: 5, windowMs: 60000, allowDemo: false });
      if (!gate.ok) return gate.response;
      const infra = await requireHevyInfra({ getEncryptionSecret, getAdmin });
      if (!infra.ok) return infra.response;

      const conn = await getHevyConnection(infra.admin, gate.user.id);
      if (!conn) return reply({ error: "אין חיבור Hevy שמור.", code: "not_connected", configured: true }, 400);
      const apiKey = openHevyKey(conn.encryptedApiKey, gate.user.id, infra.secret);
      if (!apiKey) { await recordHevyCheck(infra.admin, gate.user.id, false); return reply({ error: "לא ניתן לפענח את המפתח השמור.", code: "decrypt_failed", configured: true }, 502); }

      try {
        const workouts = await service.fetchWorkouts(apiKey);
        await recordHevyCheck(infra.admin, gate.user.id, true);
        return reply({ workouts });
      } catch (error) {
        await recordHevyCheck(infra.admin, gate.user.id, false);
        return hevyErrorReply(error);
      }
    } catch {
      logCode(scope, "internal");
      return fail("unavailable", 500);
    }
  };
}
