export const STORE_KEY = "hq:avoda:v1";
export const INIT = { tasks: [], updates: [] };
export function summarize(data) {
  const d = data || INIT;
  return { openTasks: d.tasks.filter(task => !task.done).length, nextPayment: null, daysToPay: null, latestUpdate: d.updates[0] || null, flag: "amber" };
}
