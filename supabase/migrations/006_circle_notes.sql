-- FocusFlow — a free-text note on each circle (what it's for, ground rules,
-- whatever the owner wants members to see up front).
-- Run this after 005_signup_chosen_username.sql. Safe to re-run.

alter table circles add column if not exists description text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'circles_description_length'
  ) then
    alter table circles add constraint circles_description_length
      check (description is null or char_length(description) <= 300);
  end if;
end;
$$;

-- Already covered by existing policies — no new ones needed:
--   * "read joined circles" (a member's own SELECT) already returns every
--     column, description included.
--   * "update own circle" (owner_id = auth.uid()) already covers writing
--     this column the same way it already covers require_approval.
