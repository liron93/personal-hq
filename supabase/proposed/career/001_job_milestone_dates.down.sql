-- החזרה לאחור של 001_job_milestone_dates. מוחק את שלוש העמודות (ואת הנתונים שבהן, אם מולאו).

begin;

alter table public.career_jobs
  drop column if exists applied_at,
  drop column if exists rejected_at,
  drop column if exists closed_at;

commit;
