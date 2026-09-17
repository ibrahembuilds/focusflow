-- FocusFlow — real avatar photos, and a privacy choice per circle.
-- Run this after 003_shareable_profiles.sql. Safe to re-run.
--
-- Two independent things live here:
--   1. profiles.avatar_url — an uploaded photo, alongside the existing emoji.
--      The emoji stays as the fallback for anyone who never uploads one.
--   2. circles.require_approval — the circle owner's choice between "anyone
--      with the code joins instantly" (the existing behaviour, still the
--      default) and "I approve each join request." circle_join_requests
--      holds the pending asks.

-- ─────────────────────────────────────────────────────────────
-- 1. Avatar photos
-- ─────────────────────────────────────────────────────────────

alter table profiles add column if not exists avatar_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_avatar_url_length'
  ) then
    alter table profiles add constraint profiles_avatar_url_length
      check (avatar_url is null or char_length(avatar_url) <= 600);
  end if;
end;
$$;

-- The bucket and its policies only exist on a real Supabase project — the
-- `storage` schema is part of Supabase's own infrastructure, not something a
-- plain Postgres database has. This block is a no-op (with a clear notice)
-- when run against the throwaway database supabase/tests/ uses; the upload
-- itself is exercised there through the fake Supabase Storage API instead.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public)
    values ('avatars', 'avatars', true)
    on conflict (id) do nothing;

    drop policy if exists "avatar images are publicly readable" on storage.objects;
    create policy "avatar images are publicly readable"
      on storage.objects for select
      using (bucket_id = 'avatars');

    -- Every avatar path starts with the uploader's own user id
    -- (`<user_id>/<filename>`), so each person can only ever touch their own
    -- folder inside the shared bucket.
    drop policy if exists "users upload their own avatar" on storage.objects;
    create policy "users upload their own avatar"
      on storage.objects for insert
      to authenticated
      with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

    drop policy if exists "users replace their own avatar" on storage.objects;
    create policy "users replace their own avatar"
      on storage.objects for update
      to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

    drop policy if exists "users delete their own avatar" on storage.objects;
    create policy "users delete their own avatar"
      on storage.objects for delete
      to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
  else
    raise notice 'storage schema not found — skipping avatar bucket setup (expected outside a real Supabase project)';
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. A circle can be open (join with the code) or ask-to-join
-- ─────────────────────────────────────────────────────────────

alter table circles add column if not exists require_approval boolean not null default false;
-- Updating it is already covered by the "update own circle" policy from
-- 002_profiles_and_circles.sql (owner_id = auth.uid()).

create table if not exists circle_join_requests (
  circle_id uuid not null references circles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  requested_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);

alter table circle_join_requests enable row level security;

drop policy if exists "read own or owned join requests" on circle_join_requests;
create policy "read own or owned join requests" on circle_join_requests
  for select to authenticated
  using (user_id = auth.uid() or public.is_circle_owner(circle_id));

-- Withdrawing your own ask, or the owner declining it, are both a delete —
-- there is no separate "declined" state to keep around.
drop policy if exists "withdraw or decline a join request" on circle_join_requests;
create policy "withdraw or decline a join request" on circle_join_requests
  for delete to authenticated
  using (user_id = auth.uid() or public.is_circle_owner(circle_id));

-- Creating a request goes through join_circle_by_code below, same as circles
-- and circle_members already work — no direct INSERT policy.

-- ─────────────────────────────────────────────────────────────
-- 3. join_circle_by_code now answers with what actually happened
-- ─────────────────────────────────────────────────────────────

drop function if exists public.join_circle_by_code(text);

create or replace function public.join_circle_by_code(code text)
returns table (
  status text, -- 'joined' | 'pending' | 'already_member'
  circle_id uuid,
  circle_name text,
  circle_emoji text,
  invite_code text,
  owner_id uuid,
  created_at timestamptz,
  require_approval boolean
)
language plpgsql
security definer
set search_path = public
as $$
-- The OUT columns above intentionally read like the `circles` row they
-- describe (circle_id, invite_code, owner_id...), which means a bare
-- `circle_id` below could mean either the OUT column or the real column on
-- circle_join_requests. This tells the parser: when in doubt, it's the table.
#variable_conflict use_column
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

  if public.is_circle_member(target.id) then
    return query select 'already_member', target.id, target.name, target.emoji,
      target.invite_code, target.owner_id, target.created_at, target.require_approval;
    return;
  end if;

  if not target.require_approval then
    insert into circle_members (circle_id, user_id, role)
    values (target.id, auth.uid(), 'member');
    return query select 'joined', target.id, target.name, target.emoji,
      target.invite_code, target.owner_id, target.created_at, target.require_approval;
    return;
  end if;

  insert into circle_join_requests (circle_id, user_id)
  values (target.id, auth.uid())
  on conflict (circle_id, user_id) do nothing;

  return query select 'pending', target.id, target.name, target.emoji,
    target.invite_code, target.owner_id, target.created_at, target.require_approval;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 4. The owner's inbox
-- ─────────────────────────────────────────────────────────────

create or replace function public.list_join_requests(target_circle uuid)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_emoji text,
  avatar_color text,
  avatar_url text,
  requested_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_circle_owner(target_circle) then
    raise exception 'only the circle owner can see join requests' using errcode = '42501';
  end if;

  return query
  select r.user_id, p.username, p.display_name, p.avatar_emoji, p.avatar_color, p.avatar_url,
    r.requested_at
  from circle_join_requests r
  left join profiles p on p.id = r.user_id
  where r.circle_id = target_circle
  order by r.requested_at asc;
end;
$$;

create or replace function public.respond_to_join_request(
  target_circle uuid,
  requester uuid,
  accept boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_circle_owner(target_circle) then
    raise exception 'only the circle owner can respond to a join request' using errcode = '42501';
  end if;

  delete from circle_join_requests
  where circle_id = target_circle and user_id = requester;

  if accept then
    insert into circle_members (circle_id, user_id, role)
    values (target_circle, requester, 'member')
    on conflict (circle_id, user_id) do nothing;
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 5. Carry avatar photos onto the two screens that show faces
-- ─────────────────────────────────────────────────────────────

drop function if exists public.circle_activity(uuid, date, integer);

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
  avatar_color text,
  avatar_url text
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
    coalesce(p.avatar_color, 'forest'),
    p.avatar_url
  from members m
  left join profiles p on p.id = m.user_id;
end;
$$;

drop function if exists public.public_profile(text);

create or replace function public.public_profile(handle text)
returns table (
  username text,
  display_name text,
  bio text,
  avatar_emoji text,
  avatar_color text,
  avatar_url text,
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
    owner.avatar_url,
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

grant execute on function public.public_profile(text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 6. Google (and any future OAuth provider) sign-ups also get a profile,
--    seeded from whatever the provider hands back
-- ─────────────────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  seeded_name text;
  seeded_avatar text;
  candidate text;
  attempt integer := 0;
begin
  -- Email/password sign-up sets `fullName`; Google (and most OAuth
  -- providers) set `full_name` / `name` and `avatar_url` instead.
  seeded_name := nullif(coalesce(
    new.raw_user_meta_data ->> 'fullName',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name'
  ), '');
  seeded_avatar := nullif(new.raw_user_meta_data ->> 'avatar_url', '');

  candidate := public.suggest_username(new.email);

  -- suggest_username() only checks that a handle looks free; it can't
  -- reserve one. Two sign-ups deriving the same base (e.g. sam@gmail.com
  -- and sam@yahoo.com landing in the same instant) can both pass that
  -- check and then race on the real unique constraint below — and
  -- `on conflict (id)` only covers the primary key, not `username`, so
  -- that collision used to raise and abort the whole sign-up. Retrying
  -- with a re-randomized candidate turns "your sign-up sometimes fails"
  -- into "you get a slightly different handle".
  loop
    begin
      insert into profiles (id, username, display_name, avatar_url)
      values (new.id, candidate, seeded_name, seeded_avatar)
      on conflict (id) do nothing;
      exit;
    exception
      when unique_violation then
        attempt := attempt + 1;
        if attempt >= 5 then
          raise;
        end if;
        candidate := left(candidate, 15) || substr(md5(random()::text), 1, 4);
    end;
  end loop;

  return new;
end;
$$;
