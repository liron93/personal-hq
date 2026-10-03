-- ============================================================================
-- תאריכי אבן-דרך למשרה: הגשה/דחייה/סגירה -- PROPOSED PATCH, NOT APPLIED.
-- מוסיף 3 עמודות תאריך אופציונליות ל-career_jobs הקיימת. לא נוגע ב-RLS/policies -
-- אותן הרשאות קיימות (שכבר חלות על כל שורת career_jobs) חלות גם על העמודות החדשות.
--
-- מטרה (Issue #7, Liron): לתעד מתי משרה הוגשה/נדחתה/נסגרה - ידנית דרך הטופס
-- (companies/avoda/Company.jsx), או ע"י סוכן חיצוני שכותב ישירות ל-career_jobs
-- (כמו שכבר קורה היום ל-career_communications - ראה הדיון ב-Issue #7 על הסריקה
-- החד-פעמית של ספטמבר 2026). אין כאן שום הנחה על *איך* הסוכן כותב - רק מוסיפים
-- מקום לתעד את זה, בלי לשנות הרשאות.
-- ============================================================================

begin;

alter table public.career_jobs
  add column if not exists applied_at date,
  add column if not exists rejected_at date,
  add column if not exists closed_at date;

commit;
