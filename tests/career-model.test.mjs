import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../companies/avoda/model.js", import.meta.url), "utf8");
const model = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

const input = {
  company: "OpenAI", role: "מנהל/ת מוצר", status: "applied",
  url: "https://careers.openai.com/jobs", appliedAt: "2026-09-11",
  nextStep: "מעקב עם המגייס/ת", nextStepAt: "2026-09-12", notes: "", description: "",
};

test("career state accepts only a valid job and keeps its fields", () => {
  const state = model.saveJob(model.INIT, input, undefined, "2026-09-11T10:00:00.000Z");
  const safe = model.validateState(state);
  assert.equal(safe.jobs[0].company, "OpenAI");
  assert.equal(safe.jobs[0].status, "applied");
});

test("career state rejects unsafe job links", () => {
  for (const url of ["http://example.com", "https://localhost/a", "https://127.0.0.1/a", "https://user:pass@example.com"]) {
    assert.throws(() => model.safeJobUrl(url));
  }
});

test("career search, pagination and overdue summary are deterministic", () => {
  let state = model.saveJob(model.INIT, input, undefined, "2026-09-11T10:00:00.000Z");
  for (let index = 2; index <= 12; index += 1) {
    state = model.saveJob(state, { ...input, company: `חברה ${index}`, role: `תפקיד ${index}`, status: "considering", url: "", nextStepAt: "" }, undefined, `2026-09-${String(index).padStart(2, "0")}T10:00:00.000Z`);
  }
  assert.equal(model.selectJobs(state.jobs, "חברה", "all", 1).items.length, 10);
  assert.equal(model.selectJobs(state.jobs, "חברה 12").total, 1);
  assert.equal(model.summarize(state, "2026-09-13").overdue, 1);
});

test("old v1 career data (no cv/practiced/rich fields) upgrades cleanly to v2", () => {
  const legacy = {
    version: 1,
    jobs: [{ ...input, id: "job-1", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" }],
  };
  const safe = model.validateState(legacy);
  assert.equal(safe.version, 2);
  assert.equal(safe.jobs[0].company, "OpenAI");
  assert.equal(safe.jobs[0].fitScore, null);
  assert.deepEqual(safe.jobs[0].fitPros, []);
  assert.deepEqual(safe.cv, { filename: "", text: "", uploadedAt: "" });
  assert.deepEqual(safe.practiced, {});
});

test("rich AI-ready fields round-trip through saveJob/validateState", () => {
  const rich = {
    ...input, company: "Anthropic", role: "PM",
    fitScore: 8, fitSummary: "התאמה טובה", fitPros: ["ניסיון רלוונטי"], fitCons: ["חוסר ניסיון ב-X"],
    shouldApply: true, companySummary: "חברת AI", productSummary: "Claude",
    tailoredQuestions: [{ question: "ספר על עצמך", answer: "תשובה מוצעת", category: "HR" }],
  };
  const state = model.saveJob(model.INIT, rich, undefined, "2026-09-11T10:00:00.000Z");
  const safe = model.validateState(state);
  assert.equal(safe.jobs[0].fitScore, 8);
  assert.equal(safe.jobs[0].shouldApply, true);
  assert.equal(safe.jobs[0].tailoredQuestions[0].question, "ספר על עצמך");
});

test("cv text is stored, validated and can be cleared without touching jobs", () => {
  let state = model.saveJob(model.INIT, input, undefined, "2026-09-11T10:00:00.000Z");
  state = model.saveCv(state, { filename: "cv.pdf", text: "טקסט קורות חיים" }, "2026-09-12T00:00:00.000Z");
  let safe = model.validateState(state);
  assert.equal(safe.cv.filename, "cv.pdf");
  assert.equal(safe.cv.text, "טקסט קורות חיים");
  assert.ok(safe.cv.uploadedAt);
  assert.equal(safe.jobs.length, 1);
  state = model.clearCv(state);
  safe = model.validateState(state);
  assert.equal(safe.cv.text, "");
});
