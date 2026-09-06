-- personal-hq: טבלת אחסון המצב של כל תת-חברה, לפי משתמש.
-- מריצים את הקובץ הזה פעם אחת ב-SQL Editor של הפרויקט ב-Supabase.

create table if not exists public.company_state (
  user_id     uuid not null references auth.users (id) on delete cascade,
  company_key text not null,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (user_id, company_key)
);

-- הפעלת Row Level Security
alter table public.company_state enable row level security;

-- כל משתמש רואה ורושם רק את השורות של עצמו
create policy "select own rows"
  on public.company_state for select
  using (auth.uid() = user_id);

create policy "insert own rows"
  on public.company_state for insert
  with check (auth.uid() = user_id);

create policy "update own rows"
  on public.company_state for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "delete own rows"
  on public.company_state for delete
  using (auth.uid() = user_id);
