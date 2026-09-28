// לייק/דיסלייק להשראות: תגובה אחת למשתמש/ת לכל השראה, עם מי הגיב/ה (לפי אימייל). לוגיקה טהורה לבדיקה.
export const LIKE = "like";
export const DISLIKE = "dislike";

const label = email => String(email || "").split("@")[0] || "משתמש/ת";

/** מנקה מערך תגובות שמור: רק צורות תקינות, תגובה אחת אחרונה למשתמש. */
export function normalizeReactions(raw) {
  if (!Array.isArray(raw)) return [];
  const byUser = new Map();
  for (const r of raw) {
    if (!r || typeof r.userId !== "string" || !r.userId) continue;
    if (r.type !== LIKE && r.type !== DISLIKE) continue;
    byUser.set(r.userId, { userId: r.userId, label: String(r.label || label(r.email) || r.userId).slice(0, 60), type: r.type, at: typeof r.at === "string" ? r.at : new Date(0).toISOString() });
  }
  return [...byUser.values()];
}

/** מצב הלחיצה: מי אני, מה ניסיתי לעשות (LIKE/DISLIKE), ומחזיר את הרשימה החדשה.
 * לחיצה על מה שכבר בחרתי מבטלת אותה; לחיצה על ההפך מחליפה. */
export function toggleReaction(reactions, { userId, email, type, now }) {
  if (!userId || (type !== LIKE && type !== DISLIKE)) return normalizeReactions(reactions);
  const clean = normalizeReactions(reactions);
  const mine = clean.find(r => r.userId === userId);
  const withoutMine = clean.filter(r => r.userId !== userId);
  if (mine && mine.type === type) return withoutMine; // ביטול
  return [...withoutMine, { userId, label: label(email), type, at: new Date(now).toISOString() }];
}

export function reactionSummary(reactions, userId) {
  const clean = normalizeReactions(reactions);
  const likes = clean.filter(r => r.type === LIKE);
  const dislikes = clean.filter(r => r.type === DISLIKE);
  return {
    likes: likes.length, dislikes: dislikes.length,
    likeLabels: likes.map(r => r.label), dislikeLabels: dislikes.map(r => r.label),
    mine: clean.find(r => r.userId === userId)?.type || null,
  };
}
