-- FocusFlow — let the sign-up form offer a username, not just assign one.
-- Run this after 004_avatars_and_group_privacy.sql. Safe to re-run.
--
-- This has to happen inside handle_new_user() itself, not as a client-side
-- update after sign-up: when a project requires email confirmation there is
-- no active session yet for the browser to write with — auth.uid() would be
-- null and the "update own profile" policy would refuse it. The trigger
-- runs as part of the same transaction that creates the auth.users row, so
-- it has no such gap.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  seeded_name text;
  seeded_avatar text;
  preferred_username text;
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

  -- Honor a sign-up-chosen handle only when it actually satisfies the same
  -- rule the column's own check constraint enforces, so malformed or
  -- tampered metadata can't reach the table any other way than
  -- suggest_username()'s own safe derivation.
  preferred_username := lower(trim(coalesce(new.raw_user_meta_data ->> 'preferredUsername', '')));
  if preferred_username !~ '^[a-z0-9_]{3,20}$' then
    preferred_username := null;
  end if;

  candidate := coalesce(preferred_username, public.suggest_username(new.email));

  -- Same collision-retry as before: a taken handle must never fail the
  -- whole sign-up. The one addition is that the first retry after a taken
  -- *preferred* handle tries a clean, readable email-derived name before
  -- falling back to appending random noise to what they typed.
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
        candidate := case
          when attempt = 1 and preferred_username is not null
            then public.suggest_username(new.email)
          else left(candidate, 15) || substr(md5(random()::text), 1, 4)
        end;
    end;
  end loop;

  return new;
end;
$$;
