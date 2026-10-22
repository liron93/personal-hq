// תוכנית פתיחה שנבנית מהשאלון ומהמשקלים שכבר תועדו.
// זו אינה המלצה רפואית; היא נקודת פתיחה ברורה שאפשר למדוד ולכוונן אחרי שבועיים.
import { normalizeProgram } from "./plan.mjs";

const exercise = (id, name, sets, reps, loads, rest = 75) => ({ id, name, sets, reps, loads, rest });

export function buildPersonalProgram(now = "") {
  // רק תרגילים ומשקלים שכבר הופיעו בהיסטוריית Hevy; בתרגיל ללא משקל מתועד השדה נשאר פתוח.
  const sessions = {
    A: [exercise("A1", "Chest Press (Machine)", 3, "8-12", [57.5, 57.5, 57.5]), exercise("A2", "Seated Cable Row - Bar Grip", 3, "8-12", [70, 70, 70]), exercise("A3", "Leg Press Horizontal (Machine)", 3, "10-15", [100, 100, 100]), exercise("A4", "Seated Shoulder Press (Machine)", 2, "8-12", [32.5, 32.5]), exercise("A5", "Cable Crunch", 3, "10-15", [null, null, null], 60)],
    B: [exercise("B1", "Lat Pulldown (Cable)", 3, "8-12", [60, 60, 60]), exercise("B2", "Incline Bench Press (Dumbbell)", 3, "8-12", [22.5, 22.5, 22.5]), exercise("B3", "Lying Leg Curl (Machine)", 3, "10-15", [50, 50, 50], 60), exercise("B4", "Rear Delt Reverse Fly (Machine)", 2, "12-20", [35, 35], 60), exercise("B5", "Bicep Curl (Machine)", 2, "10-15", [42.5, 42.5], 60)],
    C: [exercise("C1", "Bench Press (Dumbbell)", 3, "8-12", [25, 25, 25]), exercise("C2", "Seated Cable Row - Bar Grip", 3, "8-12", [70, 70, 70]), exercise("C3", "Leg Press Horizontal (Machine)", 3, "10-15", [100, 100, 100]), exercise("C4", "Triceps Pushdown", 3, "10-15", [23.75, 23.75, 23.75], 60), exercise("C5", "Lateral Raise (Machine)", 3, "12-20", [null, null, null], 60), exercise("C6", "Cable Crunch", 3, "10-15", [null, null, null], 60)],
  };
  return normalizeProgram({ version: 1, source: "custom", updatedAt: now, sessions });
}

export function buildPersonalPlan(profile, now = "") {
  const baseline = profile?.stepsBaseline || "";
  const dailySteps = baseline === "עד 3,000" ? 5000 : baseline === "3,000–5,000" ? 6000 : 7500;
  return { version: 1, createdAt: now, phase: "14 הימים הראשונים", training: "3 אימוני כוח בשבוע, לפי הסדר A → B → C. אין צורך לבצע שני אימונים קשים ביום.", progression: "כשכל הסטים מגיעים לקצה העליון של טווח החזרות בטכניקה טובה, מעלים בפעם הבאה את המשקל הקטן ביותר האפשרי. אם לא — נשארים עם אותו משקל.", weekly: { workouts: 3, steps: dailySteps, foodDays: 7, weighIns: 3 }, nutrition: ["בכל ארוחה עיקרית: מקור חלבון ברור לפני שמוסיפים תוספות.", "מחליטים מראש מה אוכלים בערב ומכינים אפשרות אחת זמינה בבית.", "בסוף שבוע בוחרים מראש ארוחה גמישה אחת — לא יום חופשי שלם."], reviewAfterDays: 14, targetRate: "0.3–0.6 ק״ג בשבוע בממוצע; תחזית אישית תופיע אחרי ארבע שקילות פרושות על פני לפחות שבועיים." };
}
