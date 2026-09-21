import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
export const KEY_COOKIE = 'hq_market_key';
export const KEY_TTL = 30 * 86400;
export function encryptionReady(secret) { return /^[a-f0-9]{64}$/i.test(secret || ''); }
export function sealKey(token, userId, secret, now = Date.now()) {
  if (!encryptionReady(secret)) throw new Error('Encryption not configured');
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', Buffer.from(secret, 'hex'), iv);
  cipher.setAAD(Buffer.from(userId));
  const data = Buffer.concat([cipher.update(JSON.stringify({token, expires:now + KEY_TTL * 1000}), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
}
export function openKey(value, userId, secret, now = Date.now()) {
  try {
    if (!encryptionReady(secret) || !value || value.length > 2048) return null;
    const data = Buffer.from(value, 'base64url'), decipher = createDecipheriv('aes-256-gcm', Buffer.from(secret,'hex'), data.subarray(0,12));
    decipher.setAAD(Buffer.from(userId)); decipher.setAuthTag(data.subarray(12,28));
    const result = JSON.parse(Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString('utf8'));
    return result.expires > now && typeof result.token === 'string' ? result.token : null;
  } catch { return null; }
}
export function keyCookie(value, production = true) {
  return `${KEY_COOKIE}=${value}; Path=/api/market/eodhd; HttpOnly; SameSite=Strict; Max-Age=${value ? KEY_TTL : 0}${production ? '; Secure' : ''}`;
}
