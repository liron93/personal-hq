export const STORE_KEY = "hq:wellbeing:v2";

export const uid = () => Math.random().toString(36).slice(2, 10);
export const localISO = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export const INIT = {
  today: { date: "", step: "", status: "open", feeling: "" },
  history: [],
  supports: [],
  shareStatus: "private",
};

export function normalize(data) {
  const next = { ...INIT, ...(data || {}) };
  next.today = { ...INIT.today, ...(data?.today || {}) };
  next.history = Array.isArray(data?.history) ? data.history : [];
  next.supports = Array.isArray(data?.supports) ? data.supports : [];
  return next;
}

export function summarize(data) {
  const d = normalize(data);
  const status = d.shareStatus;
  const flag = status === "need-help" ? "amber" : status === "steady" ? "green" : null;
  return { openTasks: 0, nextPayment: null, daysToPay: null, latestUpdate: null, flag };
}
