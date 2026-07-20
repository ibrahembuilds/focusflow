-- FocusFlow schema for Supabase
-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Tables mirror the Task and TimerSession types in src/store.ts.

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  completed boolean not null default false,
  sessions integer not null default 0,
  created_at date not null default current_date,
  project_id uuid,
  due_date date,
  priority text check (priority in ('low', 'medium', 'high')) default 'medium',
  inserted_at timestamptz not null default now()
);

create table if not exists timer_sessions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks (id) on delete set null,
  task_text text,
  duration integer not null, -- seconds
  completed boolean not null default false,
  timestamp timestamptz not null default now()
);

-- Row Level Security: enabled with a permissive policy for anonymous access.
-- NOTE: this lets anyone with your anon key read/write all rows. Fine for a
-- personal single-user app; when you add Supabase Auth, replace these
-- policies with user-scoped ones (add a user_id column and check auth.uid()).
alter table tasks enable row level security;
alter table timer_sessions enable row level security;

create policy "public access to tasks" on tasks
  for all using (true) with check (true);

create policy "public access to timer_sessions" on timer_sessions
  for all using (true) with check (true);
