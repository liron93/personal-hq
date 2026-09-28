import test from "node:test";
import assert from "node:assert/strict";
import { DISLIKE, LIKE, normalizeReactions, reactionSummary, toggleReaction } from "../companies/beit-hadash/reactions.js";

test("לייק ראשון נוסף עם תווית לפי אימייל", () => {
  const r = toggleReaction([], { userId: "u1", email: "liron@example.com", type: LIKE, now: 1000 });
  assert.deepEqual(r, [{ userId: "u1", label: "liron", type: LIKE, at: new Date(1000).toISOString() }]);
});

test("לחיצה חוזרת על אותה תגובה מבטלת אותה", () => {
  let r = toggleReaction([], { userId: "u1", email: "liron@x.com", type: LIKE, now: 1 });
  r = toggleReaction(r, { userId: "u1", email: "liron@x.com", type: LIKE, now: 2 });
  assert.deepEqual(r, []);
});

test("לחיצה על הכיוון ההפוך מחליפה, לא מכפילה", () => {
  let r = toggleReaction([], { userId: "u1", email: "liron@x.com", type: LIKE, now: 1 });
  r = toggleReaction(r, { userId: "u1", email: "liron@x.com", type: DISLIKE, now: 2 });
  assert.equal(r.length, 1);
  assert.equal(r[0].type, DISLIKE);
});

test("כל משתמש מקבל תגובה אחת בלבד, ושני משתמשים לא דורסים אחד את השני", () => {
  let r = toggleReaction([], { userId: "u1", email: "liron@x.com", type: LIKE, now: 1 });
  r = toggleReaction(r, { userId: "u2", email: "lior@x.com", type: DISLIKE, now: 2 });
  const s = reactionSummary(r, "u1");
  assert.equal(s.likes, 1); assert.equal(s.dislikes, 1);
  assert.equal(s.mine, LIKE);
  assert.deepEqual(s.likeLabels, ["liron"]);
  assert.deepEqual(s.dislikeLabels, ["lior"]);
});

test("בלי משתמש נוכחי (מציג בלי להתחבר) mine הוא null", () => {
  const r = toggleReaction([], { userId: "u1", email: "liron@x.com", type: LIKE, now: 1 });
  assert.equal(reactionSummary(r, undefined).mine, null);
});

test("קריאה לא מבוצעת בלי userId או type תקין", () => {
  assert.deepEqual(toggleReaction([], { userId: "", email: "x@x.com", type: LIKE, now: 1 }), []);
  assert.deepEqual(toggleReaction([], { userId: "u1", email: "x@x.com", type: "love", now: 1 }), []);
});

test("נתון שמור פגום מנוקה ולא שובר: כפילויות משתמש, סוג לא תקין, שדות חסרים", () => {
  const dirty = [null, { userId: "u1", type: LIKE, at: "2026-01-01T00:00:00.000Z" }, { userId: "u1", type: DISLIKE, at: "2026-01-02T00:00:00.000Z" }, { userId: "u2", type: "meh" }, { type: LIKE }];
  const clean = normalizeReactions(dirty);
  assert.equal(clean.length, 1);
  assert.equal(clean[0].userId, "u1");
  assert.equal(clean[0].type, DISLIKE); // האחרון בשמור מנצח
});

test("השראה בלי שדה reactions כלל מתפקדת כרשימה ריקה", () => {
  assert.deepEqual(reactionSummary(undefined, "u1"), { likes: 0, dislikes: 0, likeLabels: [], dislikeLabels: [], mine: null });
});
