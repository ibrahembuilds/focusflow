-- FocusFlow — usernames, profiles, and shared circles.
-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Safe to run on an existing install; every statement is idempotent.

-- ─────────────────────────────────────────────────────────────
-- 1. Profiles — every account gets a public @username
-- ─────────────────────────────────────────────────────────────

create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Handles are public by design: you have to be able to find a friend by name.
drop policy if exists "read profiles" on profiles;
create policy "read profiles" on profiles
  for select to authenticated using (true);

drop policy if exists "insert own profile" on profiles;
create policy "insert own profile" on profiles
  for insert to authenticated with check (auth.uid() = id);

drop policy if exists "update own profile" on profiles;
create policy "update own profile" on profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Derive a free handle from an email local part: ibrahem@x.com -> ibrahem, then
-- ibrahem1, ibrahem2 … until one is unused.
create or replace function public.suggest_username(seed text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  base text;
  candidate text;
  suffix integer := 0;
begin
  base := lower(regexp_replace(split_part(coalesce(seed, ''), '@', 1), '[^a-zA-Z0-9_]', '', 'g'));
  if length(base) < 3 then
    base := base || 'focus';
  end if;
  base := left(base, 16);
  candidate := base;
  while exists (select 1 from profiles p where p.username = candidate) loop
    suffix := suffix + 1;
    candidate := left(base, 20 - length(suffix::text)) || suffix::text;
  end loop;
  return candidate;
end;
$$;

-- New sign-ups get a profile automatically, so a circle never shows a blank
-- member. The user can rename the handle afterwards in Settings.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, username, display_name)
  values (
    new.id,
    public.suggest_username(new.email),
    nullif(new.raw_user_meta_data ->> 'fullName', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill accounts that existed before this migration.
do $$
declare
  account record;
begin
  for account in
    select u.id, u.email, u.raw_user_meta_data
    from auth.users u
    where not exists (select 1 from profiles p where p.id = u.id)
  loop
    insert into profiles (id, username, display_name)
    values (
      account.id,
      public.suggest_username(account.email),
      nullif(account.raw_user_meta_data ->> 'fullName', '')
    )
    on conflict (id) do nothing;
  end loop;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. Circles — a shared space for classmates, friends, or a team
-- ─────────────────────────────────────────────────────────────

create table if not exists circles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 60),
  emoji text not null default '🎯',
  owner_id uuid not null references auth.users (id) on delete cascade,
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists circle_members (
  circle_id uuid not null references circles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);

create index if not exists circle_members_user_id_idx on circle_members (user_id);

-- Membership checks run as the definer so a policy on circle_members can ask
-- "is this user a member?" without recursing into its own policy.
create or replace function public.is_circle_member(target_circle uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from circle_members m
    where m.circle_id = target_circle and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_circle_owner(target_circle uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from circles c
    where c.id = target_circle and c.owner_id = auth.uid()
  );
$$;

alter table circles enable row level security;
alter table circle_members enable row level security;

drop policy if exists "read joined circles" on circles;
create policy "read joined circles" on circles
  for select to authenticated
  using (owner_id = auth.uid() or public.is_circle_member(id));

drop policy if exists "update own circle" on circles;
create policy "update own circle" on circles
  for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "delete own circle" on circles;
create policy "delete own circle" on circles
  for delete to authenticated using (owner_id = auth.uid());

drop policy if exists "read circle members" on circle_members;
create policy "read circle members" on circle_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_circle_member(circle_id));

-- Leaving is always allowed; the owner can also remove someone.
drop policy if exists "leave circle" on circle_members;
create policy "leave circle" on circle_members
  for delete to authenticated
  using (user_id = auth.uid() or public.is_circle_owner(circle_id));

-- Creating and joining go through the definer functions below, so there is
-- deliberately no INSERT policy on circles or circle_members.

create or replace function public.create_circle(circle_name text, circle_emoji text default '🎯')
returns circles
language plpgsql
security definer
set search_path = public
as $$
declare
  new_circle circles;
  code text;
begin
  if auth.uid() is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  if coalesce(trim(circle_name), '') = '' then
    raise exception 'circle name is required' using errcode = '22023';
  end if;

  loop
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from circles c where c.invite_code = code);
  end loop;

  insert into circles (name, emoji, owner_id, invite_code)
  values (left(trim(circle_name), 60), coalesce(nullif(trim(circle_emoji), ''), '🎯'), auth.uid(), code)
  returning * into new_circle;

  insert into circle_members (circle_id, user_id, role)
  values (new_circle.id, auth.uid(), 'owner');

  return new_circle;
end;
$$;

create or replace function public.join_circle_by_code(code text)
returns circles
language plpgsql
security definer
set search_path = public
as $$
declare
  target circles;
begin
  if auth.uid() is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;

  select * into target from circles c
  where c.invite_code = upper(trim(coalesce(code, '')));

  if target.id is null then
    raise exception 'no circle with that invite code' using errcode = 'P0002';
  end if;

  insert into circle_members (circle_id, user_id, role)
  values (target.id, auth.uid(), 'member')
  on conflict (circle_id, user_id) do nothing;

  return target;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. Shared tasks — a task with a circle_id is visible to that circle
-- ─────────────────────────────────────────────────────────────

alter table tasks add column if not exists circle_id uuid references circles (id) on delete set null;
alter table tasks add column if not exists completed_by uuid references auth.users (id) on delete set null;
alter table tasks add column if not exists completed_at timestamptz;

create index if not exists tasks_circle_id_idx on tasks (circle_id);

-- Credit the person who actually ticked the box, so a shared task can never
-- inflate someone else's streak.
create or replace function public.stamp_task_completion()
returns trigger
language plpgsql
as $$
begin
  if new.completed and (tg_op = 'INSERT' or coalesce(old.completed, false) = false) then
    new.completed_by := coalesce(auth.uid(), new.user_id);
    new.completed_at := now();
  elsif not new.completed then
    new.completed_by := null;
    new.completed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_stamp_completion on tasks;
create trigger tasks_stamp_completion
  before insert or update of completed on tasks
  for each row execute function public.stamp_task_completion();

drop policy if exists "select own tasks" on tasks;
create policy "select own tasks" on tasks
  for select to authenticated
  using (
    auth.uid() = user_id
    or (circle_id is not null and public.is_circle_member(circle_id))
  );

drop policy if exists "insert own tasks" on tasks;
create policy "insert own tasks" on tasks
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and (circle_id is null or public.is_circle_member(circle_id))
  );

-- Anyone in the circle can tick a shared task off; a private task stays private.
drop policy if exists "update own tasks" on tasks;
create policy "update own tasks" on tasks
  for update to authenticated
  using (
    auth.uid() = user_id
    or (circle_id is not null and public.is_circle_member(circle_id))
  )
  with check (
    (auth.uid() = user_id or (circle_id is not null and public.is_circle_member(circle_id)))
    and (circle_id is null or public.is_circle_member(circle_id))
  );

-- Deleting stays with the author (or the circle owner) so nobody can wipe
-- someone else's list.
drop policy if exists "delete own tasks" on tasks;
create policy "delete own tasks" on tasks
  for delete to authenticated
  using (
    auth.uid() = user_id
    or (circle_id is not null and public.is_circle_owner(circle_id))
  );

-- ─────────────────────────────────────────────────────────────
-- 4. Shared streaks — activity dates only, never task text
-- ─────────────────────────────────────────────────────────────

-- `client_today` is the caller's *local* date and `client_tz_offset_minutes` is
-- `Date.getTimezoneOffset()` — minutes behind UTC, so UTC-08:00 sends 480. The
-- app records task dates in each user's own timezone, so measuring a day in UTC
-- here would put an evening focus session on the wrong side of midnight for
-- anyone west of Greenwich.
create or replace function public.circle_activity(
  target_circle uuid,
  client_today date default current_date,
  client_tz_offset_minutes integer default 0
)
returns table (
  user_id uuid,
  username text,
  display_name text,
  role text,
  completed_today integer,
  sessions_today integer,
  focus_seconds_today integer,
  active_dates date[]
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_circle_member(target_circle) then
    raise exception 'not a member of this circle' using errcode = '42501';
  end if;

  return query
  with members as (
    select m.user_id, m.role from circle_members m where m.circle_id = target_circle
  ),
  task_days as (
    select coalesce(t.completed_by, t.user_id) as member_id, t.created_at as day
    from tasks t
    where t.completed
      and t.created_at > client_today - 90
      and coalesce(t.completed_by, t.user_id) in (select m.user_id from members m)
  ),
  session_days as (
    select
      s.user_id as member_id,
      ((s.timestamp at time zone 'UTC') - make_interval(mins => client_tz_offset_minutes))::date as day
    from timer_sessions s
    where s.completed
      and s.timestamp > (client_today - 90)::timestamptz
      and s.user_id in (select m.user_id from members m)
  ),
  all_days as (
    select * from task_days
    union
    select * from session_days
  )
  select
    m.user_id,
    p.username,
    p.display_name,
    m.role,
    (select count(*)::integer from tasks t
      where coalesce(t.completed_by, t.user_id) = m.user_id
        and t.completed and t.created_at = client_today),
    (select count(*)::integer from timer_sessions s
      where s.user_id = m.user_id and s.completed
        and ((s.timestamp at time zone 'UTC')
             - make_interval(mins => client_tz_offset_minutes))::date = client_today),
    (select coalesce(sum(s.duration), 0)::integer from timer_sessions s
      where s.user_id = m.user_id and s.completed
        and ((s.timestamp at time zone 'UTC')
             - make_interval(mins => client_tz_offset_minutes))::date = client_today),
    coalesce(
      (select array_agg(d.day order by d.day) from all_days d where d.member_id = m.user_id),
      '{}'::date[]
    )
  from members m
  left join profiles p on p.id = m.user_id;
end;
$$;
