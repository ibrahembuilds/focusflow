grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

do $$
declare
  alice uuid;
  bob uuid;
  carol uuid;
  circle_row circles;
  code text;
  shared_task uuid;
  private_task uuid;
  visible integer;
  activity record;
  profile_row record;
  private_circle circles;
  join_result record;
begin
  -- Two accounts sign up; the trigger must hand each one a handle.
  insert into auth.users (email, raw_user_meta_data)
    values ('alice@example.com', '{"fullName":"Alice"}') returning id into alice;
  insert into auth.users (email) values ('bob@example.com') returning id into bob;
  insert into auth.users (email) values ('alice@other.com') returning id into carol;

  assert (select username from profiles where id = alice) = 'alice',
    'alice should get the handle @alice';
  assert (select display_name from profiles where id = alice) = 'Alice',
    'display name should come from the sign-up metadata';
  assert (select username from profiles where id = carol) = 'alice1',
    format('a taken handle must get a suffix, got %s', (select username from profiles where id = carol));

  -- ── Alice creates a circle ──
  perform set_config('request.jwt.claim.sub', alice::text, false);
  execute 'set role authenticated';

  circle_row := create_circle('Biology finals', '📚');
  code := circle_row.invite_code;
  assert code ~ '^[A-Z0-9]{6}$', format('invite code should be 6 chars, got %s', code);
  assert (select count(*) from circle_members where circle_id = circle_row.id) = 1,
    'the creator should be the first member';

  -- A shared task and a private one.
  insert into tasks (user_id, circle_id, text, created_at)
    values (alice, circle_row.id, 'Book the lab slot', current_date) returning id into shared_task;
  insert into tasks (user_id, text, created_at)
    values (alice, 'Salary negotiation notes', current_date) returning id into private_task;

  -- ── Bob joins ──
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', bob::text, false);
  execute 'set role authenticated';

  perform join_circle_by_code(lower(code));  -- codes are case-insensitive
  assert (select count(*) from circle_members where circle_id = circle_row.id) = 2,
    'bob should now be a member';

  -- Bob sees the shared task and nothing else of Alice's.
  select count(*) into visible from tasks;
  assert visible = 1, format('bob should see exactly 1 task, saw %s', visible);
  assert (select text from tasks) = 'Book the lab slot', 'bob must not see the private task';

  -- Bob ticks the shared task off: the trigger credits Bob, not Alice.
  update tasks set completed = true where id = shared_task;
  execute 'reset role';
  assert (select completed_by from tasks where id = shared_task) = bob,
    'the person who ticked the box owns the completion';
  assert (select user_id from tasks where id = shared_task) = alice,
    'the author of the task is unchanged';

  -- Bob cannot delete a task he did not write.
  perform set_config('request.jwt.claim.sub', bob::text, false);
  execute 'set role authenticated';
  delete from tasks where id = shared_task;
  execute 'reset role';
  assert (select count(*) from tasks where id = shared_task) = 1,
    'only the author or the circle owner may delete a shared task';

  -- ── The streak board ──
  perform set_config('request.jwt.claim.sub', alice::text, false);
  execute 'set role authenticated';

  select count(*) into visible from circle_activity(circle_row.id, current_date);
  assert visible = 2, format('the board should list both members, listed %s', visible);

  select * into activity from circle_activity(circle_row.id, current_date) a where a.user_id = bob;
  assert activity.completed_today = 1,
    format('bob finished one task today, board says %s', activity.completed_today);
  assert activity.active_dates = array[current_date],
    format('bob should have one active date, got %s', activity.active_dates);
  assert activity.username = 'bob', 'the board shows handles';

  select * into activity from circle_activity(circle_row.id, current_date) a where a.user_id = alice;
  assert activity.completed_today = 0,
    'alice gets no credit for a task bob completed';
  assert activity.role = 'owner', 'alice owns the circle';
  execute 'reset role';

  -- A focus session is credited to the day it was for the person who ran it.
  -- 03:00 UTC is still "yesterday evening" for someone at UTC-08:00, and that
  -- stays true no matter which timezone the person reading the board is in.
  insert into timer_sessions (user_id, duration, completed, timestamp)
    values (bob, 1500, true, (current_date + time '03:00') at time zone 'UTC');

  perform set_config('request.jwt.claim.sub', alice::text, false);
  execute 'set role authenticated';

  -- Bob's profile says UTC, so the session belongs to today.
  select * into activity
    from circle_activity(circle_row.id, current_date, 0) a where a.user_id = bob;
  assert activity.sessions_today = 1, 'at UTC the 03:00 session belongs to today';
  execute 'reset role';

  -- Move Bob to California. The same row now belongs to his yesterday.
  update profiles set tz_offset_minutes = 480 where id = bob;

  perform set_config('request.jwt.claim.sub', alice::text, false);
  execute 'set role authenticated';

  select * into activity
    from circle_activity(circle_row.id, current_date, 0) a where a.user_id = bob;
  assert activity.sessions_today = 0,
    format('bob''s 7pm session is not on his today, board says %s', activity.sessions_today);

  select * into activity
    from circle_activity(circle_row.id, current_date - 1, 0) a where a.user_id = bob;
  assert activity.sessions_today = 1,
    'it belongs to the day it was for him, not the day it was in UTC';
  assert activity.focus_seconds_today = 1500, 'and carries its focus time with it';

  -- Alice's own offset must not move Bob's day around.
  select * into activity
    from circle_activity(circle_row.id, current_date - 1, -600) a where a.user_id = bob;
  assert activity.sessions_today = 1,
    'a reader in Sydney sees bob credited on bob''s day, not on hers';
  execute 'reset role';

  -- ── An outsider is locked out entirely ──
  perform set_config('request.jwt.claim.sub', carol::text, false);
  execute 'set role authenticated';
  assert (select count(*) from circles) = 0, 'a non-member cannot read the circle';
  assert (select count(*) from tasks) = 0, 'a non-member cannot read the shared task';
  begin
    perform circle_activity(circle_row.id, current_date);
    raise exception 'circle_activity must refuse a non-member';
  exception
    when insufficient_privilege then null;  -- expected
  end;
  execute 'reset role';

  -- ── A bad code, and a duplicate handle ──
  perform set_config('request.jwt.claim.sub', bob::text, false);
  execute 'set role authenticated';
  begin
    perform join_circle_by_code('ZZZZZZ');
    raise exception 'an unknown invite code must be refused';
  exception
    when no_data_found then null;  -- expected (P0002)
  end;

  begin
    update profiles set username = 'alice' where id = bob;
    raise exception 'a taken handle must be refused';
  exception
    when unique_violation then null;  -- expected
  end;

  begin
    update profiles set username = 'Bad Handle!' where id = bob;
    raise exception 'an invalid handle must be refused';
  exception
    when check_violation then null;  -- expected
  end;
  execute 'reset role';

  -- Un-ticking clears the credit again.
  perform set_config('request.jwt.claim.sub', alice::text, false);
  execute 'set role authenticated';
  update tasks set completed = false where id = shared_task;
  execute 'reset role';
  assert (select completed_by from tasks where id = shared_task) is null,
    'reopening a task clears who completed it';

  assert (select count(*) from tasks where id = private_task) = 1, 'the private task is untouched';

  -- ── Shared profiles ──
  perform set_config('request.jwt.claim.sub', bob::text, false);
  execute 'set role authenticated';
  -- The shared task was reopened above, so give Bob something finished to count.
  insert into tasks (user_id, text, created_at, completed)
    values (bob, 'read one chapter', current_date, true);
  update profiles
    set bio = 'Chemistry, mostly.', avatar_emoji = '🔥', avatar_color = 'ocean',
        avatar_url = 'https://cdn.example.test/avatars/bob.jpg',
        display_name = 'Bob', tz_offset_minutes = 0
    where id = bob;
  execute 'reset role';

  -- A signed-out visitor following a link gets the card and the opted-in numbers.
  execute 'set role anon';
  select * into profile_row from public_profile('BOB');  -- handles are case-insensitive
  assert profile_row.username = 'bob', 'a shared profile opens for a signed-out visitor';
  assert profile_row.bio = 'Chemistry, mostly.', 'the bio is shared';
  assert profile_row.avatar_emoji = '🔥', 'the emoji avatar is shared';
  assert profile_row.avatar_url = 'https://cdn.example.test/avatars/bob.jpg',
    'an uploaded avatar photo is shared too';
  assert profile_row.completed_total = 1,
    format('bob finished one task, card says %s', profile_row.completed_total);
  assert profile_row.active_dates = array[current_date], 'the streak dates are shared';
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', alice::text, false);
  execute 'set role authenticated';
  select * into activity from circle_activity(circle_row.id, current_date) a where a.user_id = bob;
  assert activity.avatar_url = 'https://cdn.example.test/avatars/bob.jpg',
    'the streak board shows the same uploaded photo, not just the emoji fallback';
  execute 'reset role';

  -- Switching a number off removes it, and only it.
  update profiles set show_streak = false, show_focus_time = false where id = bob;
  execute 'set role anon';
  select * into profile_row from public_profile('bob');
  assert profile_row.active_dates is null, 'a hidden streak is not returned at all';
  assert profile_row.focus_seconds_total is null, 'a hidden focus time is not returned at all';
  assert profile_row.completed_total = 1, 'the number still switched on is unaffected';
  execute 'reset role';

  -- Switching the profile off closes the link, and looks like a handle nobody owns.
  update profiles set is_public = false where id = bob;
  execute 'set role anon';
  assert (select count(*) from public_profile('bob')) = 0, 'a private profile returns nothing';
  assert (select count(*) from public_profile('nobody_here')) = 0,
    'an unknown handle returns nothing, exactly the same way';
  -- And the table itself stays shut to a signed-out visitor.
  begin
    perform 1 from profiles;
    assert (select count(*) from profiles) = 0, 'anon cannot read the profiles table directly';
  exception
    when insufficient_privilege then null;  -- also fine
  end;
  execute 'reset role';

  -- ── A circle can be open, or ask-to-join ──
  perform set_config('request.jwt.claim.sub', alice::text, false);
  execute 'set role authenticated';
  private_circle := create_circle('Founders only', '🔒');
  update circles set require_approval = true where id = private_circle.id;
  execute 'reset role';

  -- Requesting does not make you a member — only a pending row exists.
  perform set_config('request.jwt.claim.sub', bob::text, false);
  execute 'set role authenticated';
  select * into join_result from join_circle_by_code(private_circle.invite_code);
  assert join_result.status = 'pending',
    format('a request-only circle should answer pending, got %s', join_result.status);
  assert not is_circle_member(private_circle.id), 'a pending request is not membership';

  -- Asking again while already pending is a no-op, not a second row or an error.
  select * into join_result from join_circle_by_code(private_circle.invite_code);
  assert join_result.status = 'pending', 'asking twice while pending stays pending';
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', carol::text, false);
  execute 'set role authenticated';
  select * into join_result from join_circle_by_code(private_circle.invite_code);
  assert join_result.status = 'pending', 'carol also only requests, and does not join';
  execute 'reset role';

  assert (select count(*) from circle_join_requests where circle_id = private_circle.id) = 2,
    format('two people asked, expected 2 pending requests, saw %s',
      (select count(*) from circle_join_requests where circle_id = private_circle.id));

  -- Only the owner can see or act on the inbox.
  perform set_config('request.jwt.claim.sub', bob::text, false);
  execute 'set role authenticated';
  begin
    perform list_join_requests(private_circle.id);
    raise exception 'a non-owner must not read the join-request inbox';
  exception
    when insufficient_privilege then null;  -- expected
  end;
  begin
    perform respond_to_join_request(private_circle.id, carol, true);
    raise exception 'a non-owner must not be able to approve someone else''s request';
  exception
    when insufficient_privilege then null;  -- expected
  end;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', alice::text, false);
  execute 'set role authenticated';
  select count(*) into visible from list_join_requests(private_circle.id);
  assert visible = 2, format('the owner should see 2 pending requests, saw %s', visible);

  -- Accept bob, decline carol.
  perform respond_to_join_request(private_circle.id, bob, true);
  perform respond_to_join_request(private_circle.id, carol, false);
  execute 'reset role';

  assert (select count(*) from circle_join_requests where circle_id = private_circle.id) = 0,
    'both requests are cleared from the inbox once answered';

  perform set_config('request.jwt.claim.sub', bob::text, false);
  execute 'set role authenticated';
  assert is_circle_member(private_circle.id), 'accepting a request must add the member';
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', carol::text, false);
  execute 'set role authenticated';
  assert not is_circle_member(private_circle.id), 'a declined request must not become membership';

  -- Declining is not a ban: carol can ask again.
  select * into join_result from join_circle_by_code(private_circle.invite_code);
  assert join_result.status = 'pending', 'a declined person can send a new request';
  execute 'reset role';

  -- Re-using the code once you are already a member is a no-op that says so.
  perform set_config('request.jwt.claim.sub', bob::text, false);
  execute 'set role authenticated';
  select * into join_result from join_circle_by_code(private_circle.invite_code);
  assert join_result.status = 'already_member',
    format('an existing member re-using the code should hear already_member, got %s',
      join_result.status);
  execute 'reset role';

  -- The original circle from earlier in this test never opted into approval,
  -- so the code still joins instantly — the default behaviour is unchanged.
  perform set_config('request.jwt.claim.sub', carol::text, false);
  execute 'set role authenticated';
  select * into join_result from join_circle_by_code(circle_row.invite_code);
  assert join_result.status = 'joined',
    format('an open circle should still join instantly, got %s', join_result.status);
  assert is_circle_member(circle_row.id), 'and carol is now actually a member';
  execute 'reset role';

  raise notice 'ALL SQL BEHAVIOUR CHECKS PASSED';
end $$;
