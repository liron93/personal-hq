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
  history: [], supports: [], tasks: [], waiting: [], decisionLog: [],
  weekly: { weekOf: "", focus: "", defer: "", ask: "", reviewNote: "" },
  decisions: [], conversations: [], weekReview: "", shareStatus: "private",
};

const records = (value) => Array.isArray(value)
  ? value.filter(item => item && typeof item === "object")
  : [];

export function normalize(data) {
  const next = { ...INIT, ...(data && typeof data === "object" ? data : {}) };
  next.today = { ...INIT.today, ...(data?.today && typeof data.today === "object" ? data.today : {}) };
  next.history = records(data?.history);
  next.supports = records(data?.supports);
  next.waiting = records(data?.waiting);
  next.decisionLog = records(data?.decisionLog);
  next.tasks = records(data?.tasks).map(task => ({
    ...task,
    id: typeof task.id === "string" && task.id ? task.id : uid(),
    title: typeof task.title === "string" ? task.title : "",
    bucket: task.bucket || task.priority || "inbox",
    done: Boolean(task.done),
    due: typeof task.due === "string" ? task.due : "",
    source: typeof task.source === "string" ? task.source : "",
    owner: typeof task.owner === "string" ? task.owner : "",
    link: typeof task.link === "string" ? task.link : "",
    priority: ["urgent", "high", "normal", "low"].includes(task.priority) ? task.priority : "normal",
    pomodoros: Number.isInteger(task.pomodoros) && task.pomodoros >= 1 && task.pomodoros <= 8 ? task.pomodoros : 1,
    description: typeof task.description === "string" ? task.description : "",
    time: typeof task.time === "string" ? task.time : "",
    status: task.status === "done" || task.done ? "done" : "open",
  }));
  next.focusTimer = data?.focusTimer && typeof data.focusTimer === "object" ? data.focusTimer : {};
  next.morningPlan = data?.morningPlan && typeof data.morningPlan === "object" ? data.morningPlan : {};
  next.weekly = { ...INIT.weekly, ...(data?.weekly && typeof data.weekly === "object" ? data.weekly : {}) };
  next.decisions = records(data?.decisions);
  next.conversations = records(data?.conversations);
  return next;
}

export function summarize(data) {
  const d = normalize(data);
  const flag = d.shareStatus === "need-help" ? "amber" : d.shareStatus === "steady" ? "green" : null;
  return { openTasks: d.decisions.filter(item => item?.status === "open").length, nextPayment: null, daysToPay: null, latestUpdate: null, flag };
}
