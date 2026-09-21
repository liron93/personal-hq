import assert from "node:assert/strict";
import test from "node:test";
import { parseProgramText, parseReps, parseWeight, canonReps, formatLoads, UNSET } from "../companies/health/program.mjs";
import { importFromText } from "../companies/health/plan.mjs";

// נתוני דמה מומצאים בלבד.
const one = line => parseProgramText("A\n" + line);

test("reps: range or single number; invalid rejected", () => {
  assert.deepEqual(parseReps("8-12"), { min: 8, max: 12 });
  assert.deepEqual(parseReps("8 – 12"), { min: 8, max: 12 });
  assert.deepEqual(parseReps("12"), { min: 12, max: 12 });
  assert.equal(parseReps("12-8"), null);
  assert.equal(parseReps("0"), null);
  assert.equal(parseReps("abc"), null);
  assert.equal(parseReps(""), null);
  assert.equal(canonReps("8–12"), "8-12");
  assert.equal(canonReps("12-12"), "12");
});

test("weight parsing: dot or comma decimal, zero and junk rejected", () => {
  assert.equal(parseWeight("22,5"), "22.5");
  assert.equal(parseWeight("23.75"), "23.75");
  assert.equal(parseWeight("70"), "70");
  assert.equal(parseWeight("0"), null);
  assert.equal(parseWeight(""), null);
  assert.equal(parseWeight(UNSET), null);
});

test("import: single weight applies to all sets", () => {
  const r = one("תרגיל א | 3 | 8-12 | 70");
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.sessions.A[0], { name: "תרגיל א", sets: 3, reps: "8-12", loads: ["70", "70", "70"] });
});

test("import: per-set list with / including decimals and 'טרם נקבע' element", () => {
  let r = one("תרגיל א | 3 | 8-12 | 70/70/60");
  assert.deepEqual(r.sessions.A[0].loads, ["70", "70", "60"]);
  r = one("תרגיל ב | 3 | 12 | 23.75/21.25/טרם נקבע");
  assert.deepEqual(r.sessions.A[0].loads, ["23.75", "21.25", null]);
  r = one("תרגיל ג | 3 | 12 | 22,5/ /20");
  assert.deepEqual(r.sessions.A[0].loads, ["22.5", null, "20"]);
  assert.equal(r.sessions.A[0].reps, "12");
});

test("import: unset weight (token or missing) means all sets unset", () => {
  assert.deepEqual(one("תרגיל א | 2 | 10 | טרם נקבע").sessions.A[0].loads, [null, null]);
  assert.deepEqual(one("תרגיל א | 2 | 10").sessions.A[0].loads, [null, null]);
  assert.deepEqual(one("תרגיל א | 2 | 10 |").sessions.A[0].loads, [null, null]);
});

test("import: weight count must equal set count, otherwise the line is reported and not loaded", () => {
  const r = parseProgramText("A\nתרגיל א | 3 | 8-12 | 70/70\nתרגיל ב | 2 | 8 | 10/10/10\nתרגיל ג | 2 | 8 | 10/10");
  assert.equal(r.errors.length, 2);
  assert.equal(r.errors[0].line, 2);
  assert.match(r.errors[0].message, /מספר המשקלים/);
  assert.equal(r.sessions.A.length, 1);
  assert.equal(r.sessions.A[0].name, "תרגיל ג");
});

test("import: bad numbers, zero weight, bad reps and bad sets are line errors", () => {
  for (const line of ["תרגיל | 3 | 8-12 | 0", "תרגיל | 3 | 8-12 | כבד", "תרגיל | 3 | 8-12 | 10/0/10", "תרגיל | 3 | 12-8 | 10", "תרגיל | 3 | | 10", "תרגיל | x | 8 | 10", "תרגיל | 0 | 8 | 10", "תרגיל | 3", "| 3 | 8 | 10"]) {
    const r = one(line);
    assert.equal(r.errors.length, 1, line);
    assert.equal(r.sessions.A.length, 0, line);
  }
});

test("import: English names with parentheses, blank lines, headers, Hebrew and English header forms", () => {
  const r = parseProgramText("\n\nאימון A\n\nTest Exercise (Bar Grip) | 3 | 8-12 | 40/40/35\n\n\nB\nAnother Move (Wide) | 2 | 10 | טרם נקבע\n\nאימון C:\nתרגיל | 1 | 5 | 10.5\n");
  assert.deepEqual(r.errors, []);
  assert.equal(r.sessions.A[0].name, "Test Exercise (Bar Grip)");
  assert.deepEqual(r.sessions.A[0].loads, ["40", "40", "35"]);
  assert.deepEqual(r.sessions.B[0].loads, [null, null]);
  assert.deepEqual(r.sessions.C[0].loads, ["10.5"]);
});

test("import: line before any header is an error; empty text yields no program", () => {
  const r = parseProgramText("תרגיל | 3 | 8 | 10\nA\nתרגיל | 3 | 8");
  assert.equal(r.errors.length, 1);
  assert.equal(importFromText("").program, null);
  assert.equal(importFromText("A\nתרגיל | 3 | 8 | 70/70").program, null);
});

test("importFromText builds a program with per-set loads and never overwrites anything by itself", () => {
  const { program, errors } = importFromText("A\nתרגיל א | 3 | 8-12 | 70/70/60\nB\nתרגיל ב | 2 | 10 | טרם נקבע\nשורה שבורה | 2 | 10 | 5/5/5", "t");
  assert.equal(errors.length, 1);
  assert.equal(program.source, "imported");
  assert.deepEqual(program.sessions.A[0].loads, ["70", "70", "60"]);
  assert.deepEqual(program.sessions.B[0].loads, [null, null]);
  assert.equal(program.sessions.B.length, 1);
});

test("formatLoads: Hebrew text, unset never invented", () => {
  assert.equal(formatLoads([null, null]), "טרם נקבע");
  assert.equal(formatLoads([]), "טרם נקבע");
  assert.equal(formatLoads(["70", "70", "70"]), "70 ק״ג");
  assert.equal(formatLoads(["70", "70", "60"]), "70 / 70 / 60 ק״ג");
  assert.equal(formatLoads(["23.75", null]), "23.75 / טרם נקבע ק״ג");
});
