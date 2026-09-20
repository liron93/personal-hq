// רעננות, מקור נתון, מצב שגיאה ו-fallback. הכלל: אף פעם לא ממציאים נתון.
// כשאין נתון טרי — מחזירים את הנתון האחרון שנשמר עם asOf המקורי שלו וסטטוס "stale",
// ואם גם אין כזה — data:null עם סטטוס "error"/"empty". asOf לעולם לא מתעדכן ל"עכשיו" בנתון ישן.
import { DATA_STATUS, VALIDATORS } from "./contracts.js";

/** @typedef {{status:string, source:string, asOf:string|null, data:any, error:string|null}} Envelope */

export function envelope({ status, source, asOf = null, data = null, error = null }) {
  return { status, source, asOf, data, error };
}

export function classify({ data, asOf, now = Date.now(), maxAgeMs }) {
  if (data == null || (Array.isArray(data) && !data.length)) return DATA_STATUS.EMPTY;
  const time = Date.parse(asOf);
  if (Number.isNaN(time)) return DATA_STATUS.STALE; // בלי חותמת זמן אמינה אי אפשר להוכיח רעננות
  return now - time > maxAgeMs ? DATA_STATUS.STALE : DATA_STATUS.OK;
}

/**
 * @param {{kind:keyof typeof VALIDATORS, source:string, fetch:()=>Promise<{data:any, asOf:string}>, cached?:Envelope|null, maxAgeMs:number, now?:number}} opts
 * @returns {Promise<Envelope>}
 */
export async function resolveWithFallback({ kind, source, fetch, cached = null, maxAgeMs, now = Date.now() }) {
  const validate = VALIDATORS[kind];
  if (!validate) throw new Error(`unknown kind: ${kind}`);
  let failure;
  try {
    const raw = await fetch();
    const parsed = validate(raw?.data);
    if (parsed.ok) {
      return envelope({ status: classify({ data: parsed.value, asOf: raw.asOf, now, maxAgeMs }), source, asOf: raw.asOf ?? null, data: parsed.value });
    }
    failure = `invalid ${kind}: ${parsed.errors.join(",")}`;
  } catch (e) {
    failure = `provider failed: ${e?.message || "unknown"}`;
  }
  if (cached?.data != null) return envelope({ status: DATA_STATUS.STALE, source: cached.source, asOf: cached.asOf, data: cached.data, error: failure });
  return envelope({ status: DATA_STATUS.ERROR, source, error: failure });
}
