export const STORE_KEY = "hq:wellbeing:v3";

export const uid = () => Math.random().toString(36).slice(2, 10);
export const localISO = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
export const weekKey = () => {
  const date = new Date();
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export const INIT = {
  today: { date: "", step: "", status: "open", load: "", reliefPlan: "", reliefNote: "" },
  history: [], supports: [], tasks: [],
  weekly: { weekOf: "", focus: "", defer: "", ask: "", reviewNote: "" },
  decisions: [], conversations: [], weekReview: "", shareStatus: "private",
};

export function normalize(data) {
  const next = { ...INIT, ...(data || {}) };
  next.today = { ...INIT.today, ...(data?.today || {}) };
  next.history = Array.isArray(data?.history) ? data.history : [];
  next.supports = Array.isArray(data?.supports) ? data.supports : [];
  next.tasks = Array.isArray(data?.tasks) ? data.tasks : [];
  next.weekly = { ...INIT.weekly, ...(data?.weekly || {}) };
  next.decisions = Array.isArray(data?.decisions) ? data.decisions : [];
  next.conversations = Array.isArray(data?.conversations) ? data.conversations : [];
  return next;
}

export function summarize(data) {
  const d = normalize(data);
  const flag = d.shareStatus === "need-help" ? "amber" : d.shareStatus === "steady" ? "green" : null;
  return { openTasks: d.decisions.filter(item => item.status === "open").length, nextPayment: null, daysToPay: null, latestUpdate: null, flag };
}