
create table if not exists public.career_questions (
  id text primary key,
  category text not null,
  subcategory text,
  difficulty text not null check (difficulty in ('easy','medium','hard')),
  question text not null,
  frameworks text[] not null default '{}',
  tags text[] not null default '{}',
  hint text,
  question_type text not null default 'open' check (question_type in ('open','multiple_choice')),
  options jsonb,
  correct_answer text,
  explanation text,
  reveal jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.career_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  question_id text not null references public.career_questions(id) on delete cascade,
  cv_id uuid references public.career_cvs(id) on delete set null,
  job_id uuid references public.career_jobs(id) on delete set null,
  answer_text text not null,
  evaluation jsonb,
  overall_score integer check (overall_score is null or overall_score between 0 and 10),
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  created_at timestamptz not null default now()
);
create index if not exists career_answers_user_created_idx on public.career_answers(user_id, created_at desc);
create index if not exists career_answers_user_question_idx on public.career_answers(user_id, question_id);
create table if not exists public.career_interview_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_id uuid references public.career_jobs(id) on delete set null,
  persona text not null check (persona in ('hiring_manager','hr')),
  language text not null default 'he' check (language in ('he','en')),
  role_title text,
  state text not null default 'active' check (state in ('active','completed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create table if not exists public.career_interview_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.career_interview_sessions(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ordinal integer not null,
  speaker text not null check (speaker in ('interviewer','candidate')),
  content text not null,
  created_at timestamptz not null default now(),
  unique(session_id, ordinal)
);
create index if not exists career_interview_messages_session_idx on public.career_interview_messages(session_id, ordinal);
create table if not exists public.career_article_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  url text not null check (url ~ '^https://'),
  title text,
  summary text,
  key_points text[] not null default '{}',
  pm_relevance_score integer check (pm_relevance_score is null or pm_relevance_score between 1 and 10),
  pm_relevance_reason text,
  recommendation text check (recommendation is null or recommendation in ('must_read','worth_reading','skip')),
  estimated_read_minutes integer check (estimated_read_minutes is null or estimated_read_minutes >= 0),
  article_published_at date,
  created_at timestamptz not null default now()
);
create index if not exists career_articles_user_created_idx on public.career_article_summaries(user_id, created_at desc);
alter table public.career_questions enable row level security;
alter table public.career_answers enable row level security;
alter table public.career_interview_sessions enable row level security;
alter table public.career_interview_messages enable row level security;
alter table public.career_article_summaries enable row level security;
drop policy if exists "career_questions_read_authenticated" on public.career_questions;
create policy "career_questions_read_authenticated" on public.career_questions for select to authenticated using (true);
drop policy if exists "career_answers_owner" on public.career_answers;
create policy "career_answers_owner" on public.career_answers for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "career_sessions_owner" on public.career_interview_sessions;
create policy "career_sessions_owner" on public.career_interview_sessions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "career_messages_owner" on public.career_interview_messages;
create policy "career_messages_owner" on public.career_interview_messages for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "career_articles_owner" on public.career_article_summaries;
create policy "career_articles_owner" on public.career_article_summaries for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select on public.career_questions to authenticated;
grant select, insert, update, delete on public.career_answers, public.career_interview_sessions, public.career_interview_messages, public.career_article_summaries to authenticated;
