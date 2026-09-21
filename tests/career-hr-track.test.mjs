import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_PREFS, addHrAttempt, conceptsFor, hrHistory, isHrQuestion, normalizePrefs, questionsFor, setTrack, validateBank } from "../companies/avoda/practice-tracks.js";

const load = name => JSON.parse(readFileSync(new URL(`../companies/avoda/data/${name}.json`, import.meta.url), "utf8"));
const pm = load("questions"), pmTerm = load("terminology-questions"), hr = load("hr-questions"), hrTerm = load("hr-terminology-questions"), hrConcepts = load("hr-concepts"), pmConcepts = load("concepts");

test("בנק HR: מזהים ייחודיים, שדות חובה ושאלות אמריקאיות תקינות", () => {
  assert.deepEqual(validateBank(hr, "hrm-"), []);
  assert.deepEqual(validateBank(hrTerm, "hrm-term-"), []);
  assert.ok(hr.length >= 50 && hrTerm.length >= 15 && hrConcepts.length >= 25);
});

test("אין התנגשות מזהים בין מסלול המוצר למסלול HR", () => {
  const ids = [...pm, ...pmTerm, ...hr, ...hrTerm].map(q => q.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok([...pm, ...pmTerm].every(q => !isHrQuestion(q.id)));
  assert.ok(pm.some(q => q.id.startsWith("hr-")), "בנק המוצר כולל hr-001.. וצריך להישאר במסלול Supabase");
  assert.equal(isHrQuestion("hr-001"), false);
});

test("מושגים: שדות חובה וללא כפילות", () => {
  for (const c of [...hrConcepts, ...pmConcepts]) assert.ok(c.term && c.category && c.explanation);
  assert.equal(new Set(hrConcepts.map(c => c.term)).size, hrConcepts.length);
});

test("ברירת מחדל היא מסלול המוצר, וחשבון קיים בלי העדפות לא משתנה", () => {
  assert.equal(normalizePrefs(null).track, "pm");
  assert.equal(normalizePrefs(undefined).track, "pm");
  assert.equal(normalizePrefs({ track: "nonsense" }).track, "pm");
  assert.deepEqual(normalizePrefs(DEFAULT_PREFS), { track: "pm", hrAttempts: [], irrelevantJobs: {} });
  const banks = { pm, hr };
  assert.equal(questionsFor("pm", banks), pm);
  assert.equal(questionsFor("hr", banks), hr);
  assert.equal(conceptsFor("pm", { pm: pmConcepts, hr: hrConcepts }), pmConcepts);
});

test("בחירת מסלול נשמרת ולא נוגעת בניסיונות", () => {
  const withAttempt = addHrAttempt(DEFAULT_PREFS, "hrm-001", "תשובה", { id: "a1", now: 1 });
  const next = setTrack(withAttempt, "hr");
  assert.equal(next.track, "hr");
  assert.equal(next.hrAttempts.length, 1);
  assert.equal(setTrack(next, "junk").track, "pm");
});

test("ניסיון HR: נשמר רק לשאלת HR עם טקסט, הכי חדש ראשון, וקיצוץ אורך", () => {
  let p = addHrAttempt(DEFAULT_PREFS, "hrm-001", "  ראשון  ", { id: "a1", now: Date.UTC(2026, 8, 21) });
  p = addHrAttempt(p, "hrm-002", "שני", { id: "a2", now: Date.UTC(2026, 8, 22) });
  assert.deepEqual(p.hrAttempts.map(a => a.id), ["a2", "a1"]);
  assert.equal(p.hrAttempts[1].text, "ראשון");
  assert.equal(addHrAttempt(p, "hr-001", "לא HR", { id: "x", now: 1 }).hrAttempts.length, 2);
  assert.equal(addHrAttempt(p, "hrm-003", "   ", { id: "x", now: 1 }).hrAttempts.length, 2);
  assert.equal(addHrAttempt(DEFAULT_PREFS, "hrm-001", "א".repeat(9000), { id: "l", now: 1 }).hrAttempts[0].text.length, 5000);
});

test("נתון שמור פגום מנוקה ולא שובר את המסך", () => {
  const dirty = { track: "hr", hrAttempts: [null, 5, { questionId: "pri-1", text: "x", id: "1", createdAt: "d" }, { questionId: "hrm-001", text: "ok", id: "2", createdAt: "2026-09-21T00:00:00.000Z" }, { questionId: "hrm-002", text: 7, id: "3", createdAt: "d" }] };
  const clean = normalizePrefs(dirty);
  assert.deepEqual(clean.hrAttempts.map(a => a.id), ["2"]);
});

test("היסטוריית HR מציגה את נוסח השאלה, ושאלה שנמחקה לא שוברת", () => {
  let p = addHrAttempt(DEFAULT_PREFS, hr[0].id, "תשובה", { id: "a1", now: 5 });
  p = addHrAttempt(p, "hrm-999", "שאלה שאינה בבנק", { id: "a2", now: 6 });
  const h = hrHistory(p, hr);
  assert.equal(h[1].career_questions.question, hr[0].question);
  assert.equal(h[0].career_questions, null);
  assert.equal(h[0].answer_text, "שאלה שאינה בבנק");
});

test("שאלות HR אינן תלויות בשמות או בתוכן אישי", () => {
  const text = JSON.stringify([hr, hrTerm, hrConcepts]);
  for (const bad of ["ליאור", "לירון", "Liron", "Lior", "@", "http"]) assert.ok(!text.includes(bad), bad);
});
