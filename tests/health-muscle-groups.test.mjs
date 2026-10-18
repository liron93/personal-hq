import { test } from "node:test";
import assert from "node:assert/strict";
import { MUSCLE_GROUPS, DEFAULT_MUSCLE_DICT, detectMuscleGroup, addMuscleKeyword } from "../companies/health/muscle-groups.mjs";

test("detectMuscleGroup: מזהה קבוצה ממילת מפתח (עברית/אנגלית, לא רגיש לרישיות), null כשלא תואם", () => {
  assert.equal(detectMuscleGroup("Bench Press"), "חזה");
  assert.equal(detectMuscleGroup("לחיצת חזה שטוחה"), "חזה");
  assert.equal(detectMuscleGroup("Barbell Squat"), "ארבע-ראשי");
  assert.equal(detectMuscleGroup("Romanian Deadlift"), "אחורית ירך");
  assert.equal(detectMuscleGroup("תרגיל מוזר שלא קיים בשום מילון"), null);
  assert.equal(detectMuscleGroup(""), null);
  assert.equal(detectMuscleGroup(null), null);
});

test("detectMuscleGroup: תרגיל לא ממופה מחזיר null, לא קבוצה מומצאת ('אחר')", () => {
  // דרישת עמית: תרגיל שאינו ממופה חייב לבקש מיפוי - לא להמציא. בניגוד ל-FALLBACK_CATEGORY
  // של משק בית, אין כאן קבוצת "אחר" קולטת-כל.
  assert.equal(MUSCLE_GROUPS.includes("אחר"), false);
  assert.equal(detectMuscleGroup("ג'אגלינג עם כדורי קרקס"), null);
});

test("addMuscleKeyword: מוסיף מילת מפתח רק לקבוצה תקנית, לא דורס את המילון הקיים", () => {
  const dict = addMuscleKeyword(DEFAULT_MUSCLE_DICT, "חבטות אגרוף", "כתפיים");
  assert.equal(detectMuscleGroup("אימון חבטות אגרוף", dict), "כתפיים");
  assert.equal(detectMuscleGroup("Bench Press", dict), "חזה"); // המילון הקיים לא נפגע
  assert.equal(addMuscleKeyword(DEFAULT_MUSCLE_DICT, "משהו", "קבוצה לא קיימת"), DEFAULT_MUSCLE_DICT);
  assert.equal(addMuscleKeyword(DEFAULT_MUSCLE_DICT, "", "חזה"), DEFAULT_MUSCLE_DICT);
});
