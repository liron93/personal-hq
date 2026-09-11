export const STORE_KEY = "career-v1";
export const INIT = { version: 1, jobs: [] };
export const STATUSES = {
  considering: "שוקל להגיש", applied: "הוגשה מועמדות", interview: "ראיון",
  offer: "הצעה", rejected: "נדחתה", withdrawn: "נסגרה",
};
export const PAGE_SIZE = 10;
const CLOSED = new Set(["rejected", "withdrawn"]);
const FIELDS = ["company", "role", "url", "status", "appliedAt", "nextStep", "nextStepAt", "notes", "description"];

export function safeJobUrl(value) {
  if (!value?.trim()) return "";
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error("יש להזין קישור HTTPS תקין"); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !host.includes(".") || /[\[\]:]/.test(host) || /^\d+(\.\d+){3}$/.test(host) ||
      /(^|\.)(localhost|local|internal|test|invalid)$/.test(host)) {
    throw new Error("יש להזין קישור HTTPS לאתר ציבורי, ללא פרטי כניסה");
  }
  return url.href;
}

function dateOnly(value, label) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value) throw new Error(`${label}: תאריך לא תקין`);
  return value;
}

export function parseJob(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("מועמדות לא תקינה");
  if (Object.keys(input).some(key => !FIELDS.includes(key))) throw new Error("המועמדות מכילה שדות לא מורשים");
  const text = (key, max) => {
    const value = input[key] ?? "";
    if (typeof value !== "string" || value.length > max) throw new Error(`השדה ${key} ארוך מדי או לא תקין`);
    return value.trim();
  };
  const company = text("company", 160), role = text("role", 200);
  if (!company || !role) throw new Error("שם חברה ותפקיד הם שדות חובה");
  const status = text("status", 30) || "considering";
  if (!Object.hasOwn(STATUSES, status)) throw new Error("סטטוס לא תקין");
  return {
    company, role, status, url: safeJobUrl(text("url", 2048)),
    appliedAt: dateOnly(text("appliedAt", 10), "תאריך הגשה"),
    nextStep: text("nextStep", 500), nextStepAt: dateOnly(text("nextStepAt", 10), "מועד הצעד הבא"),
    notes: text("notes", 6000), description: text("description", 12000),
  };
}

export function saveJob(state, input, id, now = new Date().toISOString()) {
  const fields = parseJob(input);
  const previous = id ? state.jobs.find(job => job.id === id) : null;
  if (id && !previous) throw new Error("המועמדות לא נמצאה; יש לרענן את הרשימה");
  const job = { ...fields, id: id || crypto.randomUUID(), createdAt: previous?.createdAt || now, updatedAt: now };
  return { version: 1, jobs: previous ? state.jobs.map(item => item.id === id ? job : item) : [job, ...state.jobs] };
}

export function removeJob(state, id) {
  return { version: 1, jobs: state.jobs.filter(job => job.id !== id) };
}

export function validateState(state) {
  if (!state || state.version !== 1 || !Array.isArray(state.jobs)) throw new Error("גרסת נתוני הקריירה אינה נתמכת");
  if (Object.keys(state).some(key => !["version", "jobs"].includes(key))) throw new Error("נתוני קריירה לא תקינים");
  const ids = new Set();
  return { version: 1, jobs: state.jobs.map(job => {
    if (!job || typeof job.id !== "string" || !job.id || ids.has(job.id)) throw new Error("מזהה מועמדות לא תקין");
    ids.add(job.id);
    const { id, createdAt, updatedAt, ...input } = job;
    if (![createdAt, updatedAt].every(date => typeof date === "string" && Number.isFinite(Date.parse(date)))) throw new Error("זמני מועמדות לא תקינים");
    return { ...parseJob(input), id, createdAt, updatedAt };
  }) };
}

export function selectJobs(jobs, query = "", status = "all", page = 1) {
  const needle = query.trim().toLocaleLowerCase();
  const filtered = jobs.filter(job => (status === "all" || job.status === status) &&
    `${job.company} ${job.role}`.toLocaleLowerCase().includes(needle))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.max(1, Math.min(page, pages));
  return { items: filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE), total: filtered.length, pages, page: currentPage };
}

export function summarize(data, today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" })) {
  const jobs = data?.jobs ?? [];
  const active = jobs.filter(job => !CLOSED.has(job.status));
  const steps = active.filter(job => job.nextStep);
  const overdue = steps.filter(job => job.nextStepAt && job.nextStepAt < today).length;
  const next = [...steps].sort((left, right) => (left.nextStepAt || "9999").localeCompare(right.nextStepAt || "9999"))[0];
  const latest = [...jobs].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  return { openTasks: steps.length, activeJobs: active.length, interviews: active.filter(job => job.status === "interview").length,
    overdue, nextStep: next ? { text: next.nextStep, company: next.company, date: next.nextStepAt } : null,
    flag: overdue ? "amber" : "green",
    latestUpdate: latest ? { date: latest.updatedAt, text: `${latest.company} — ${latest.role}: ${STATUSES[latest.status]}` } : null };
}
