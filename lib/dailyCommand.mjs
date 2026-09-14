/**
 * Shared daily-command model.
 * Companies keep ownership of their records; this layer only projects the
 * next 72 hours into one calm, deduplicated command view.
 */
export const dateKey = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export const horizon = (now = new Date()) => {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  return [0, 1, 2].map(offset => {
    const date = new Date(start); date.setDate(date.getDate() + offset);
    return dateKey(date);
  });
};

export function action(input = {}) {
  return {
    id: input.id || input.sourceId || crypto.randomUUID(),
    title: input.title || "פעולה ללא שם",
    source: input.source || "כללי",
    owner: input.owner || "לירון",
    href: input.href || "/",
    due: input.due || "",
    state: input.state || "open",
    urgency: input.urgency || "normal",
    waiting: Boolean(input.waiting),
    relief: input.relief || null,
  };
}

const rank = item => item.urgency === "critical" ? 0 : item.urgency === "high" ? 1 : 2;

export function buildDailyCommand(inputs = [], now = new Date()) {
  const days = horizon(now);
  const unique = new Map();
  inputs.map(action).filter(item => item.state !== "done").forEach(item => {
    const key = `${item.source}:${item.id}`;
    if (!unique.has(key)) unique.set(key, item);
  });
  const all = [...unique.values()].sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title, "he"));
  const dated = (day) => all.filter(item => item.due === day && !item.waiting);
  const today = dated(days[0]);
  const urgent = all.filter(item => item.urgency === "critical" || item.urgency === "high").filter(item => !item.waiting);
  const nowItem = urgent.find(item => item.due === days[0]) || today[0] || urgent[0] || null;
  const waiting = all.filter(item => item.waiting);
  const overload = today.length > 3;
  return {
    now: nowItem,
    today: today.slice(0, 3),
    tomorrow: dated(days[1]),
    dayAfterTomorrow: dated(days[2]),
    waiting,
    overload: overload ? {
      count: today.length,
      message: `יש ${today.length} פעולות להיום. בחר פעולה אחת להעביר למחר או לשחרר.`,
      candidates: today.slice(3),
    } : null,
    all,
  };
}
