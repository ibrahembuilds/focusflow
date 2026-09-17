-- FocusFlow schema for Supabase
-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Tables mirror the types in src/store.ts.
-- Personal data is scoped per authenticated user via Supabase Auth (auth.uid()).
-- Team data is scoped per team membership (see team_members below).
-- Every statement here is idempotent, so re-running the whole file against an
-- existing project is safe and brings it up to date (see "Upgrading an
-- existing project" at the bottom for the two manual backfill steps).

-- ── Profiles (public username + display name) ──
-- One row per account, auto-created by the trigger at the bottom of this file.

create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  full_name text,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

drop policy if exists "profiles are viewable by any signed-in user" on profiles;
drop policy if exists "users can insert own profile" on profiles;
drop policy if exists "users can update own profile" on profiles;

-- Readable by any signed-in user — teammates need to look each other up by
-- username, and a username on its own reveals nothing private.
create policy "profiles are viewable by any signed-in user" on profiles
  for select using (auth.role() = 'authenticated');

create policy "users can insert own profile" on profiles
  for insert with check (auth.uid() = id);

create policy "users can update own profile" on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ── Teams ──
-- A team is a shared workspace: its members see and edit the same tasks
-- (tasks.team_id set), separate from anyone's personal task list. Defined
-- before `tasks` below so tasks.team_id can reference it.

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists team_members (
  team_id uuid not null references teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'member')) default 'member',
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table if not exists team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  invited_user_id uuid not null references auth.users (id) on delete cascade,
  invited_by uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'declined')) default 'pending',
  created_at timestamptz not null default now(),
  unique (team_id, invited_user_id)
);

create index if not exists team_members_user_id_idx on team_members (user_id);
create index if not exists team_invites_invited_user_id_idx on team_invites (invited_user_id);

-- `security definer` here is load-bearing, not incidental: a `team_members`
-- select policy that itself queries `team_members` recurses under RLS. Routing
-- the membership check through a definer function sidesteps that recursion.
create or replace function public.is_team_member(check_team_id uuid, check_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from team_members
    where team_id = check_team_id and user_id = check_user_id
  );
$$;

alter table teams enable row level security;
alter table team_members enable row level security;
alter table team_invites enable row level security;

drop policy if exists "select teams you belong to" on teams;
drop policy if exists "select teams you belong to or are invited to" on teams;
drop policy if exists "create a team you own" on teams;
drop policy if exists "owner can rename team" on teams;
drop policy if exists "owner can delete team" on teams;

-- A pending invite also grants read access to the team's name (nothing
-- else — team_members/tasks stay member-only) so an invited user can see
-- what they're being asked to join before accepting.
create policy "select teams you belong to or are invited to" on teams
  for select using (
    public.is_team_member(id, auth.uid())
    or exists (
      select 1 from team_invites
      where team_id = id and invited_user_id = auth.uid() and status = 'pending'
    )
  );

create policy "create a team you own" on teams
  for insert with check (auth.uid() = created_by);

create policy "owner can rename team" on teams
  for update using (
    exists (select 1 from team_members where team_id = id and user_id = auth.uid() and role = 'owner')
  );

create policy "owner can delete team" on teams
  for delete using (
    exists (select 1 from team_members where team_id = id and user_id = auth.uid() and role = 'owner')
  );

drop policy if exists "select members of your teams" on team_members;
drop policy if exists "insert owner row on team create" on team_members;
drop policy if exists "insert self via accepted invite" on team_members;
drop policy if exists "leave or owner removes a member" on team_members;

create policy "select members of your teams" on team_members
  for select using (public.is_team_member(team_id, auth.uid()));

-- Two ways a row can be inserted: the creator seating themselves as owner
-- right after `create a team you own` succeeds, or an invited user accepting
-- a pending invite.
create policy "insert owner row on team create" on team_members
  for insert with check (
    user_id = auth.uid()
    and role = 'owner'
    and exists (select 1 from teams where id = team_id and created_by = auth.uid())
  );

create policy "insert self via accepted invite" on team_members
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from team_invites
      where team_id = team_members.team_id and invited_user_id = auth.uid() and status = 'pending'
    )
  );

create policy "leave or owner removes a member" on team_members
  for delete using (
    user_id = auth.uid()
    or exists (
      select 1 from team_members m
      where m.team_id = team_members.team_id and m.user_id = auth.uid() and m.role = 'owner'
    )
  );

drop policy if exists "select your invites or ones you sent" on team_invites;
drop policy if exists "team members can invite" on team_invites;
drop policy if exists "invited user can respond" on team_invites;
drop policy if exists "inviter or invitee can delete invite" on team_invites;

create policy "select your invites or ones you sent" on team_invites
  for select using (invited_user_id = auth.uid() or invited_by = auth.uid());

create policy "team members can invite" on team_invites
  for insert with check (invited_by = auth.uid() and public.is_team_member(team_id, auth.uid()));

create policy "invited user can respond" on team_invites
  for update using (invited_user_id = auth.uid()) with check (invited_user_id = auth.uid());

create policy "inviter or invitee can delete invite" on team_invites
  for delete using (invited_by = auth.uid() or invited_user_id = auth.uid());

-- ── Tasks & focus sessions ──

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  text text not null,
  completed boolean not null default false,
  sessions integer not null default 0,
  created_at date not null default current_date,
  project_id uuid,
  due_date date,
  priority text check (priority in ('low', 'medium', 'high')) default 'medium',
  inserted_at timestamptz not null default now()
);

-- Added after the base columns (rather than inlined above) so this also
-- backfills an existing `tasks` table on an upgrade, not just a fresh one.
alter table tasks add column if not exists team_id uuid references teams (id) on delete cascade;
alter table tasks add column if not exists notes text;
alter table tasks add column if not exists subject text;

create table if not exists timer_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid references tasks (id) on delete set null,
  task_text text,
  duration integer not null, -- seconds
  completed boolean not null default false,
  timestamp timestamptz not null default now()
);

create index if not exists tasks_user_id_idx on tasks (user_id);
create index if not exists tasks_team_id_idx on tasks (team_id);
create index if not exists timer_sessions_user_id_idx on timer_sessions (user_id);

-- Row Level Security: a task is visible/editable by its owner, or by anyone
-- on its team when team_id is set. Deleting a team task is limited to its
-- owner or the team's owner, so a stray teammate can't wipe the shared list.

alter table tasks enable row level security;
alter table timer_sessions enable row level security;

drop policy if exists "public access to tasks" on tasks;
drop policy if exists "public access to timer_sessions" on timer_sessions;
drop policy if exists "select own tasks" on tasks;
drop policy if exists "insert own tasks" on tasks;
drop policy if exists "update own tasks" on tasks;
drop policy if exists "delete own tasks" on tasks;
drop policy if exists "select own or team tasks" on tasks;
drop policy if exists "insert own tasks in own or team scope" on tasks;
drop policy if exists "update own or team tasks" on tasks;
drop policy if exists "delete own tasks or team owner" on tasks;

create policy "select own or team tasks" on tasks
  for select using (
    auth.uid() = user_id or (team_id is not null and public.is_team_member(team_id, auth.uid()))
  );

create policy "insert own tasks in own or team scope" on tasks
  for insert with check (
    auth.uid() = user_id and (team_id is null or public.is_team_member(team_id, auth.uid()))
  );

create policy "update own or team tasks" on tasks
  for update using (
    auth.uid() = user_id or (team_id is not null and public.is_team_member(team_id, auth.uid()))
  ) with check (
    auth.uid() = user_id or (team_id is not null and public.is_team_member(team_id, auth.uid()))
  );

create policy "delete own tasks or team owner" on tasks
  for delete using (
    auth.uid() = user_id
    or (team_id is not null and exists (
      select 1 from team_members where team_id = tasks.team_id and user_id = auth.uid() and role = 'owner'
    ))
  );

drop policy if exists "select own timer_sessions" on timer_sessions;
drop policy if exists "insert own timer_sessions" on timer_sessions;
drop policy if exists "update own timer_sessions" on timer_sessions;
drop policy if exists "delete own timer_sessions" on timer_sessions;

create policy "select own timer_sessions" on timer_sessions
  for select using (auth.uid() = user_id);

create policy "insert own timer_sessions" on timer_sessions
  for insert with check (auth.uid() = user_id);

create policy "update own timer_sessions" on timer_sessions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "delete own timer_sessions" on timer_sessions
  for delete using (auth.uid() = user_id);

-- ── Auto-provision a profile row for every new account ──
-- The username is a random placeholder; users pick their real one in Settings.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, full_name)
  values (
    new.id,
    'user_' || substr(replace(new.id::text, '-', ''), 1, 10),
    new.raw_user_meta_data ->> 'fullName'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Upgrading an existing project ──
-- Re-running this whole file against a project that already has tasks/
-- timer_sessions from an earlier version is safe — every statement above is
-- idempotent. Two things the file can't do for you, run once by hand:
--
-- 1. Backfill a profile for every account that existed before the trigger
--    above did (new accounts get one automatically from here on):
--    insert into public.profiles (id, username, full_name)
--    select id, 'user_' || substr(replace(id::text, '-', ''), 1, 10), raw_user_meta_data ->> 'fullName'
--    from auth.users
--    on conflict (id) do nothing;
--
-- 2. If you're upgrading from the very first (pre-user_id) version of this
--    schema: alter table tasks add column if not exists user_id uuid references auth.users (id) on delete cascade;
--    alter table timer_sessions add column if not exists user_id uuid references auth.users (id) on delete cascade;
--    -- then backfill user_id for existing rows before adding: alter table tasks alter column user_id set not null;
