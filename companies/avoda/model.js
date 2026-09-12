// מודל הנתונים של חברת הקריירה (avoda).
// גרסה 2: מרחיב את מודל המשרות (jobs) לשדות העשירים מהמוצר הישן (Job-guide) —
// ניתוח התאמה, סיכומי חברה/מוצר, CV+מכתב מותאמים, שאלות ראיון — ומוסיף מסך
// קורות חיים (טקסט בלבד) ומעקב תרגול שאלות. זהו Slice 1 של ההעברה: שכבת המודל
// והמסכים מוכנים לקבל את הנתונים האמיתיים במיגרציה נפרדת (לא כאן), ומוכנים
// לקבל את תוצאות ה-AI בעתיד (לא כאן — כרגע כל השדות האלה טקסט חופשי שהמשתמש/ת
// יכולים למלא ידנית, למשל מהמוצר הישן, עד שהאינטגרציה תחובר).
//
// state v1 (הגרסה הקודמת) עדיין נטען בשקיפות ומשודרג אוטומטית ל-v2 (migrateState).

export const STORE_KEY = "career-v1"; // נשאר אותו מפתח אחסון כדי לא לאבד נתונים קיימים
export const CURRENT_VERSION = 2;
export const INIT = {
  version: CURRENT_VERSION,
  jobs: [],
  cv: { filename: "", text: "", uploadedAt: "" },
  practiced: {}, // questionId -> true, מעקב תרגול עצמי בלי AI
};

export const STATUSES = {
  considering: "שוקל להגיש", applied: "הוגשה מועמדות", interview: "ראיון",
  offer: "הצעה", rejected: "נדחתה", withdrawn: "נסגרה",
};
export const PAGE_SIZE = 10;
const CLOSED = new Set(["rejected", "withdrawn"]);

const CORE_FIELDS = ["company", "role", "url", "status", "appliedAt", "nextStep", "nextStepAt", "notes", "description"];
// שדות "מוכני AI" — כרגע טקסט חופשי שממלאים ידנית; בעתיד ימולאו אוטומטית
const RICH_FIELDS = [
  "fitScore", "fitSummary", "fitPros", "fitCons", "shouldApply",
  "companySummary", "productSummary", "tailoredCv", "coverLetter",
  "tailoredQuestions", "candidateQuestions", "myQuestions",
];
const FIELDS = [...CORE_FIELDS, ...RICH_FIELDS];

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

function text(input, key, max) {
  const value = input[key] ?? "";
  if (typeof value !== "string" || value.length > max) throw new Error(`השדה ${key} ארוך מדי או לא תקין`);
  return value.trim();
}

function stringList(input, key, maxItems, maxLen) {
  const value = input[key];
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > maxItems) throw new Error(`השדה ${key} לא תקין`);
  return value.map(item => {
    if (typeof item !== "string" || item.length > maxLen) throw new Error(`השדה ${key} מכיל ערך לא תקין`);
    return item.trim();
  }).filter(Boolean);
}

// רשימת שאלות-ותשובות אחידה — משמשת גם ל-tailoredQuestions (שאלות שישאלו אותי),
// גם ל-candidateQuestions (שאלות שכדאי לי לשאול) וגם ל-myQuestions (שאלות שכתבתי בעצמי)
function qaList(input, key, maxItems = 30) {
  const value = input[key];
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > maxItems) throw new Error(`השדה ${key} לא תקין`);
  return value.map(item => {
    if (!item || typeof item !== "object") throw new Error(`השדה ${key} מכיל ערך לא תקין`);
    const question = String(item.question ?? "").slice(0, 2000).trim();
    const answer = String(item.answer ?? "").slice(0, 4000).trim();
    const category = String(item.category ?? "").slice(0, 60).trim();
    if (!question) throw new Error(`השדה ${key} חייב לכלול שאלה`);
    return { question, answer, category };
  });
}

export function parseJob(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("מועמדות לא תקינה");
  if (Object.keys(input).some(key => !FIELDS.includes(key))) throw new Error("המועמדות מכילה שדות לא מורשים");

  const company = text(input, "company", 160), role = text(input, "role", 200);
  if (!company || !role) throw new Error("שם חברה ותפקיד הם שדות חובה");
  const status = text(input, "status", 30) || "considering";
  if (!Object.hasOwn(STATUSES, status)) throw new Error("סטטוס לא תקין");

  let fitScore = input.fitScore ?? null;
  if (fitScore != null) {
    fitScore = Number(fitScore);
    if (!Number.isFinite(fitScore) || fitScore < 1 || fitScore > 10) throw new Error("ציון התאמה חייב להיות בין 1 ל-10");
  }
  let shouldApply = input.shouldApply ?? null;
  if (shouldApply != null && typeof shouldApply !== "boolean") throw new Error("שדה should_apply לא תקין");

  return {
    company, role, status, url: safeJobUrl(text(input, "url", 2048)),
    appliedAt: dateOnly(text(input, "appliedAt", 10), "תאריך הגשה"),
    nextStep: text(input, "nextStep", 500), nextStepAt: dateOnly(text(input, "nextStepAt", 10), "מועד הצעד הבא"),
    notes: text(input, "notes", 6000), description: text(input, "description", 12000),
    // שדות עשירים — ממתינים לאינטגרציית AI; כרגע טקסט חופשי/עריכה ידנית בלבד
    fitScore, fitSummary: text(input, "fitSummary", 2000),
    fitPros: stringList(input, "fitPros", 10, 300), fitCons: stringList(input, "fitCons", 10, 300),
    shouldApply,
    companySummary: text(input, "companySummary", 2000), productSummary: text(input, "productSummary", 2000),
    tailoredCv: text(input, "tailoredCv", 20000), coverLetter: text(input, "coverLetter", 20000),
    tailoredQuestions: qaList(input, "tailoredQuestions"),
    candidateQuestions: qaList(input, "candidateQuestions"),
    myQuestions: qaList(input, "myQuestions"),
  };
}

export function saveJob(state, input, id, now = new Date().toISOString()) {
  const fields = parseJob(input);
  const previous = id ? state.jobs.find(job => job.id === id) : null;
  if (id && !previous) throw new Error("המועמדות לא נמצאה; יש לרענן את הרשימה");
  const job = { ...fields, id: id || crypto.randomUUID(), createdAt: previous?.createdAt || now, updatedAt: now };
  return { ...state, jobs: previous ? state.jobs.map(item => item.id === id ? job : item) : [job, ...state.jobs] };
}

export function removeJob(state, id) {
  return { ...state, jobs: state.jobs.filter(job => job.id !== id) };
}

export function saveCv(state, { filename, text: cvText }, now = new Date().toISOString()) {
  const name = String(filename ?? "").slice(0, 200).trim();
  const body = String(cvText ?? "").slice(0, 20000).trim();
  return { ...state, cv: { filename: name, text: body, uploadedAt: body ? now : "" } };
}

export function clearCv(state) {
  return { ...state, cv: { filename: "", text: "", uploadedAt: "" } };
}

export function togglePracticed(state, questionId, value) {
  const practiced = { ...(state.practiced || {}) };
  if (value) practiced[questionId] = true; else delete practiced[questionId];
  return { ...state, practiced };
}

// משדרג נתונים ישנים (v1: רק jobs בסיסיים) לצורה החדשה, בלי לאבד כלום
export function migrateState(raw) {
  if (!raw || typeof raw !== "object") return { ...INIT };
  if (raw.version === CURRENT_VERSION) return raw;
  if (raw.version === 1 && Array.isArray(raw.jobs)) {
    return {
      version: CURRENT_VERSION,
      jobs: raw.jobs.map(job => ({
        ...job,
        fitScore: null, fitSummary: "", fitPros: [], fitCons: [], shouldApply: null,
        companySummary: "", productSummary: "", tailoredCv: "", coverLetter: "",
        tailoredQuestions: [], candidateQuestions: [], myQuestions: [],
      })),
      cv: { filename: "", text: "", uploadedAt: "" },
      practiced: {},
    };
  }
  throw new Error("גרסת נתוני הקריירה אינה נתמכת");
}

export function validateState(rawState) {
  const state = migrateState(rawState);
  if (!state || state.version !== CURRENT_VERSION || !Array.isArray(state.jobs)) throw new Error("גרסת נתוני הקריירה אינה נתמכת");
  if (Object.keys(state).some(key => !["version", "jobs", "cv", "practiced"].includes(key))) throw new Error("נתוני קריירה לא תקינים");
  const ids = new Set();
  const jobs = state.jobs.map(job => {
    if (!job || typeof job.id !== "string" || !job.id || ids.has(job.id)) throw new Error("מזהה מועמדות לא תקין");
    ids.add(job.id);
    const { id, createdAt, updatedAt, ...input } = job;
    if (![createdAt, updatedAt].every(date => typeof date === "string" && Number.isFinite(Date.parse(date)))) throw new Error("זמני מועמדות לא תקינים");
    return { ...parseJob(input), id, createdAt, updatedAt };
  });
  const cv = state.cv && typeof state.cv === "object" ? {
    filename: String(state.cv.filename ?? "").slice(0, 200),
    text: String(state.cv.text ?? "").slice(0, 20000),
    uploadedAt: String(state.cv.uploadedAt ?? ""),
  } : { filename: "", text: "", uploadedAt: "" };
  const practiced = state.practiced && typeof state.practiced === "object" && !Array.isArray(state.practiced) ? state.practiced : {};
  return { version: CURRENT_VERSION, jobs, cv, practiced };
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
