import { test } from "node:test";
import assert from "node:assert/strict";
import { hevyEncryptionReady, sealHevyKey, openHevyKey } from "../lib/hevy-key.mjs";

const SECRET = "a".repeat(64); // 64 תווי הקס תקינים - מפתח בדיוני בלבד לבדיקות
const OTHER_SECRET = "b".repeat(64);
const USER = "11111111-1111-1111-1111-111111111111";
const OTHER_USER = "22222222-2222-2222-2222-222222222222";

test("hevyEncryptionReady: רק 64 תווי הקס (32 בייט) נחשב תקין", () => {
  assert.equal(hevyEncryptionReady(SECRET), true);
  assert.equal(hevyEncryptionReady(SECRET.toUpperCase()), true);
  assert.equal(hevyEncryptionReady(""), false);
  assert.equal(hevyEncryptionReady(undefined), false);
  assert.equal(hevyEncryptionReady("not-hex-at-all"), false);
  assert.equal(hevyEncryptionReady(SECRET.slice(0, 62)), false); // קצר מדי
  assert.equal(hevyEncryptionReady(SECRET + "ab"), false); // ארוך מדי
});

test("sealHevyKey/openHevyKey: round-trip תקין, ולעולם לא מחזיר את הטקסט הגלוי בתוך הציפר-טקסט עצמו", () => {
  const sealed = sealHevyKey("hevy-secret-token-12345", USER, SECRET);
  assert.notEqual(sealed, "hevy-secret-token-12345");
  assert.ok(!sealed.includes("hevy-secret-token-12345"));
  assert.equal(openHevyKey(sealed, USER, SECRET), "hevy-secret-token-12345");
});

test("openHevyKey: userId אחר לא יכול לפענח (AAD קשור ל-userId) - מחזיר null, לא זורק", () => {
  const sealed = sealHevyKey("hevy-secret-token", USER, SECRET);
  assert.equal(openHevyKey(sealed, OTHER_USER, SECRET), null);
});

test("openHevyKey: secret שגוי, ציפר-טקסט מזויף, או secret לא תקין - null בטוח, לא זריקה", () => {
  const sealed = sealHevyKey("hevy-secret-token", USER, SECRET);
  assert.equal(openHevyKey(sealed, USER, OTHER_SECRET), null);
  assert.equal(openHevyKey("not-valid-base64url-ciphertext", USER, SECRET), null);
  assert.equal(openHevyKey(sealed, USER, "too-short"), null);
  assert.equal(openHevyKey(null, USER, SECRET), null);
  assert.equal(openHevyKey("", USER, SECRET), null);
});

test("sealHevyKey: זורק במפורש (fail closed) אם secret לא תקין - לא שומר בשקט עם מפתח חלש", () => {
  assert.throws(() => sealHevyKey("token", USER, "bad-secret"));
  assert.throws(() => sealHevyKey("token", USER, ""));
});
