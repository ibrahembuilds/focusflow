-- FocusFlow — shareable profiles.
-- Run this after 002_profiles_and_circles.sql. Safe to re-run.

-- ─────────────────────────────────────────────────────────────
-- 1. What a profile holds
-- ─────────────────────────────────────────────────────────────

alter table profiles add column if not exists bio text;
alter table profiles add column if not exists avatar_emoji text not null default '🌱';
alter table profiles add column if not exists avatar_color text not null default 'forest';

-- Sharing is the owner's call, one switch at a time. The profile card itself
-- (name, handle, bio, avatar) is shared by default — it holds only what its
-- owner typed. Each number is a separate opt-out.
alter table profiles add column if not exists is_public boolean not null default true;
alter table profiles add column if not exists show_streak boolean not null default true;
alter table profiles add column if not exists show_focus_time boolean not null default true;
alter table profiles add column if not exists show_completed boolean not null default true;

-- The owner's own UTC offset, so their day starts and ends where they live no
-- matter who is looking at the profile. `Date.getTimezoneOffset()`: minutes
-- behind UTC, so UTC-08:00 stores 480.
alter table profiles add column if not exists tz_offset_minutes integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_bio_length'
  ) then
    alter table profiles add constraint profiles_bio_length
      check (bio is null or char_length(bio) <= 240);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'profiles_avatar_color_choice'
  ) then
    alter table profiles add constraint profiles_avatar_color_choice
      check (avatar_color in ('forest', 'ocean', 'violet', 'rose', 'amber'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'profiles_tz_offset_range'
  ) then
    alter table profiles add constraint profiles_tz_offset_range
      check (tz_offset_minutes between -900 and 900);
  end if;
end;
$$;

create index if not exists profiles_username_lookup_idx on profiles (lower(username));

-- ─────────────────────────────────────────────────────────────
-- 2. A member's day starts where *they* are
-- ─────────────────────────────────────────────────────────────

-- Counting a day needs the offset of the person whose day it is, not of whoever
-- happens to be looking. Someone in London reading a circle board must still see
-- a teammate in California credited for a session they ran at 7pm their time.
create or replace function public.activity_dates_for(
  member uuid,
  since date,
  fallback_offset_minutes integer default 0
)
returns date[]
language sql
security definer
stable
set search_path = public
as $$
  with offset_minutes as (
    select coalesce(
      (select p.tz_offset_minutes from profiles p where p.id = member),
      fallback_offset_minutes
    ) as mins
  ),
  days as (
    select t.created_at as day
    from tasks t
    where t.completed
      and t.created_at > since
      and coalesce(t.completed_by, t.user_id) = member
    union
    select ((s.timestamp at time zone 'UTC') - make_interval(mins => o.mins))::date
    from timer_sessions s, offset_minutes o
    where s.completed
      and s.timestamp > since::timestamptz
      and s.user_id = member
  )
  select coalesce(array_agg(d.day order by d.day), '{}'::date[]) from days d;
$$;

-- The board now also carries each member's avatar, so the signature changes and
-- the old function has to go before the new one can take its name.
drop function if exists public.circle_activity(uuid, date, integer);
drop function if exists public.circle_activity(uuid, date);

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
  active_dates date[],
  avatar_emoji text,
  avatar_color text
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
             - make_interval(mins => coalesce(p.tz_offset_minutes, client_tz_offset_minutes))
            )::date = client_today),
    (select coalesce(sum(s.duration), 0)::integer from timer_sessions s
      where s.user_id = m.user_id and s.completed
        and ((s.timestamp at time zone 'UTC')
             - make_interval(mins => coalesce(p.tz_offset_minutes, client_tz_offset_minutes))
            )::date = client_today),
    public.activity_dates_for(m.user_id, client_today - 90, client_tz_offset_minutes),
    coalesce(p.avatar_emoji, '🌱'),
    coalesce(p.avatar_color, 'forest')
  from members m
  left join profiles p on p.id = m.user_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. The shared profile behind /u/<username>
-- ─────────────────────────────────────────────────────────────

-- Returns no rows for a handle that doesn't exist or isn't shared — the two are
-- deliberately indistinguishable. Each number is omitted unless its own switch
-- is on, and no task text is ever returned.
create or replace function public.public_profile(handle text)
returns table (
  username text,
  display_name text,
  bio text,
  avatar_emoji text,
  avatar_color text,
  member_since timestamptz,
  tz_offset_minutes integer,
  show_streak boolean,
  show_focus_time boolean,
  show_completed boolean,
  completed_total integer,
  focus_seconds_total integer,
  active_dates date[]
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  owner profiles;
begin
  select * into owner from profiles p
  where p.username = lower(trim(coalesce(handle, ''))) and p.is_public;

  if owner.id is null then
    return;
  end if;

  return query
  select
    owner.username,
    owner.display_name,
    owner.bio,
    owner.avatar_emoji,
    owner.avatar_color,
    owner.created_at,
    owner.tz_offset_minutes,
    owner.show_streak,
    owner.show_focus_time,
    owner.show_completed,
    case when owner.show_completed then
      (select count(*)::integer from tasks t
        where coalesce(t.completed_by, t.user_id) = owner.id and t.completed)
    end,
    case when owner.show_focus_time then
      (select coalesce(sum(s.duration), 0)::integer from timer_sessions s
        where s.user_id = owner.id and s.completed)
    end,
    case when owner.show_streak then
      public.activity_dates_for(owner.id, current_date - 90, owner.tz_offset_minutes)
    end;
end;
$$;

-- A shared profile is readable by a signed-out visitor following a link; the
-- profiles table itself stays closed to them.
grant execute on function public.public_profile(text) to anon, authenticated;
