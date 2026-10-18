begin;
select plan(35);

-- SPM-88: Venue Staff identify existing bookings that now conflict because of a
-- venue's setup or turnaround time. Flagging never changes the bookings; a flag
-- clears once the overlap is gone. (Notifying the coordinator when a flag
-- clears is out of scope for SPM-88; Venue Staff are notified.)
insert into auth.users (id, email, raw_user_meta_data) values
  ('f8800000-0000-0000-0000-000000000001', 'spm88-staff@example.test', '{"full_name":"SPM88 Staff","role":"venue_staff"}'::jsonb),
  ('f8800000-0000-0000-0000-000000000002', 'spm88-coord-a@example.test', '{"full_name":"SPM88 Coordinator A","role":"event_coordinator"}'::jsonb),
  ('f8800000-0000-0000-0000-000000000003', 'spm88-coord-b@example.test', '{"full_name":"SPM88 Coordinator B","role":"event_coordinator"}'::jsonb),
  ('f8800000-0000-0000-0000-000000000004', 'spm88-org@example.test', '{"full_name":"SPM88 Organiser","role":"event_organiser"}'::jsonb);

-- Hall: changed through update_venue (AC02). Room: re-checked by hand (AC01).
insert into public.venues (id, name, location, area_tags, capacity, operating_hours, setup_time_minutes, turnaround_time_minutes) values
  ('f8800000-0000-0000-0000-000000000010', 'SPM88 Hall', 'Block 88', array['Central Area'], 200,
   '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}]'::jsonb, 0, 0),
  ('f8800000-0000-0000-0000-000000000011', 'SPM88 Room', 'Block 88', array['Central Area'], 200,
   '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}]'::jsonb, 0, 0);
insert into public.venue_layouts (venue_id, layout_name) values
  ('f8800000-0000-0000-0000-000000000010', 'Theatre'), ('f8800000-0000-0000-0000-000000000011', 'Theatre');

insert into public.events (id, organiser_id, assigned_coordinator_id, title, expected_attendance, status, starts_at, ends_at) values
  ('f8800000-0000-0000-0000-0000000000e1', 'f8800000-0000-0000-0000-000000000004', 'f8800000-0000-0000-0000-000000000002',
   'SPM88 Morning Talk', 50, 'planning', '2099-06-01T10:00:00+08:00', '2099-06-01T12:00:00+08:00'),
  ('f8800000-0000-0000-0000-0000000000e2', 'f8800000-0000-0000-0000-000000000004', 'f8800000-0000-0000-0000-000000000003',
   'SPM88 Afternoon Talk', 50, 'planning', '2099-06-01T13:00:00+08:00', '2099-06-01T15:00:00+08:00'),
  ('f8800000-0000-0000-0000-0000000000e3', 'f8800000-0000-0000-0000-000000000004', 'f8800000-0000-0000-0000-000000000002',
   'SPM88 Room Morning', 50, 'planning', '2099-06-02T10:00:00+08:00', '2099-06-02T12:00:00+08:00'),
  ('f8800000-0000-0000-0000-0000000000e4', 'f8800000-0000-0000-0000-000000000004', 'f8800000-0000-0000-0000-000000000003',
   'SPM88 Room Afternoon', 50, 'planning', '2099-06-02T13:00:00+08:00', '2099-06-02T15:00:00+08:00');

-- Hall: an Approved booking 10:00-12:00 and a later-requested Pending one 13:00-15:00.
-- Room: the same pair the next day.
insert into public.venue_bookings (id, event_id, venue_id, requested_by, requested_at, starts_at, ends_at, status) values
  ('f8800000-0000-0000-0000-0000000000b1', 'f8800000-0000-0000-0000-0000000000e1', 'f8800000-0000-0000-0000-000000000010',
   'f8800000-0000-0000-0000-000000000002', '2099-05-01T09:00:00+08:00', '2099-06-01T10:00:00+08:00', '2099-06-01T12:00:00+08:00', 'approved'),
  ('f8800000-0000-0000-0000-0000000000b2', 'f8800000-0000-0000-0000-0000000000e2', 'f8800000-0000-0000-0000-000000000010',
   'f8800000-0000-0000-0000-000000000003', '2099-05-02T09:00:00+08:00', '2099-06-01T13:00:00+08:00', '2099-06-01T15:00:00+08:00', 'pending'),
  ('f8800000-0000-0000-0000-0000000000b3', 'f8800000-0000-0000-0000-0000000000e3', 'f8800000-0000-0000-0000-000000000011',
   'f8800000-0000-0000-0000-000000000002', '2099-05-01T09:00:00+08:00', '2099-06-02T10:00:00+08:00', '2099-06-02T12:00:00+08:00', 'approved'),
  ('f8800000-0000-0000-0000-0000000000b4', 'f8800000-0000-0000-0000-0000000000e4', 'f8800000-0000-0000-0000-000000000011',
   'f8800000-0000-0000-0000-000000000003', '2099-05-02T09:00:00+08:00', '2099-06-02T13:00:00+08:00', '2099-06-02T15:00:00+08:00', 'pending');

-- The full update_venue payload for a venue, with the values a test changes.
create function pg_temp.venue_payload(p_name text, p_capacity integer, p_setup integer, p_turnaround integer)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'name', p_name, 'location', 'Block 88', 'area_tags', jsonb_build_array('Central Area'),
    'capacity', p_capacity,
    'operating_hours', '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}]'::jsonb,
    'facilities', '[]'::jsonb, 'layouts', jsonb_build_array('Theatre'),
    'setup_time_minutes', p_setup, 'turnaround_time_minutes', p_turnaround);
$$;

create function pg_temp.active_flags(p_venue_id uuid)
returns integer
language sql
as $$
  select count(*)::int from public.venue_booking_conflicts c
  join public.venue_bookings b on b.id = c.booking_id
  where b.venue_id = p_venue_id and c.resolved_at is null;
$$;

create temporary table spm88_result (label text primary key, result jsonb);
grant all on spm88_result to authenticated;

-- AC01: only Venue Staff can re-check.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8800000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$select public.recheck_venue_conflicts('f8800000-0000-0000-0000-000000000010')$$,
  '42501', 'Only Venue Staff can re-check conflicts', 'AC01: a coordinator cannot re-check a venue');
select throws_ok($$select public.recheck_all_venue_conflicts()$$,
  '42501', null, 'AC01: a coordinator cannot re-check all venues');

-- AC04: with no buffers the two bookings do not overlap, so nothing is flagged.
select set_config('request.jwt.claims', '{"sub":"f8800000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((public.recheck_venue_conflicts('f8800000-0000-0000-0000-000000000010') ->> 'flaggedCount')::int,
  0, 'AC04: bookings whose effective windows do not overlap are not flagged');

-- AC02/AC04: a 60-minute turnaround ends 10:00-12:00 exactly at 13:00 — touching, not overlapping.
select lives_ok($$select public.update_venue('f8800000-0000-0000-0000-000000000010',
  pg_temp.venue_payload('SPM88 Hall', 200, 0, 60))$$, 'Venue Staff set the Hall turnaround to 60 minutes');
reset role;
select is(pg_temp.active_flags('f8800000-0000-0000-0000-000000000010'), 0,
  'AC04: windows that only touch (12:00 + 60 min = 13:00) are not a conflict');

-- AC02: raising the turnaround to 90 minutes re-checks the venue automatically and flags both bookings.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8800000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$select public.update_venue('f8800000-0000-0000-0000-000000000010',
  pg_temp.venue_payload('SPM88 Hall', 200, 0, 90))$$, 'Venue Staff set the Hall turnaround to 90 minutes');
reset role;
select is(pg_temp.active_flags('f8800000-0000-0000-0000-000000000010'), 2,
  'AC02/AC04: saving the new turnaround flags both overlapping bookings, with no manual re-check');
select is((select string_agg(booking_id::text || '>' || conflicting_booking_id::text || ':' || is_responsible, ', ' order by booking_id)
  from public.venue_booking_conflicts where booking_id in ('f8800000-0000-0000-0000-0000000000b1', 'f8800000-0000-0000-0000-0000000000b2')),
  'f8800000-0000-0000-0000-0000000000b1>f8800000-0000-0000-0000-0000000000b2:false, '
    || 'f8800000-0000-0000-0000-0000000000b2>f8800000-0000-0000-0000-0000000000b1:true',
  'AC04: each booking names the other, and the later request is the one responsible');
select is((select count(*)::int from public.notifications
  where recipient_id = 'f8800000-0000-0000-0000-000000000001' and type = 'venue_conflict_flagged'
    and message like '%SPM88 Morning Talk%SPM88 Afternoon Talk%'),
  1, 'AC04: Venue Staff are told the two bookings now conflict');

-- AC03: flagging never deletes, cancels or changes the bookings.
select is((select string_agg(id::text || ':' || status::text, ', ' order by id) from public.venue_bookings
  where id in ('f8800000-0000-0000-0000-0000000000b1', 'f8800000-0000-0000-0000-0000000000b2')),
  'f8800000-0000-0000-0000-0000000000b1:approved, f8800000-0000-0000-0000-0000000000b2:pending',
  'AC03: both flagged bookings still exist with their status unchanged (Approved, Pending)');

-- AC04: a second check adds no duplicate flags.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8800000-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into spm88_result select 'hall-again', public.recheck_venue_conflicts('f8800000-0000-0000-0000-000000000010');
reset role;
select is((select (result ->> 'flaggedCount')::int || '/' || (result ->> 'activeCount')::int from spm88_result where label = 'hall-again'),
  '0/2', 'AC04: re-checking again flags nothing new and keeps the two active flags');
select is(pg_temp.active_flags('f8800000-0000-0000-0000-000000000010'), 2, 'AC04: no duplicate flags are created');

-- AC02: saving a change that is not to setup or turnaround does not re-check.
-- Test setup: the Room's turnaround is raised directly, so it has an overlap nobody has checked yet.
update public.venues set turnaround_time_minutes = 90 where id = 'f8800000-0000-0000-0000-000000000011';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8800000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$select public.update_venue('f8800000-0000-0000-0000-000000000011',
  pg_temp.venue_payload('SPM88 Room', 150, 0, 90))$$, 'Venue Staff change only the Room''s capacity');
reset role;
select is(pg_temp.active_flags('f8800000-0000-0000-0000-000000000011'), 0,
  'AC02: a save that leaves setup and turnaround unchanged does not run the conflict check');

-- AC01: Venue Staff re-check a single venue by hand.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8800000-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into spm88_result select 'room', public.recheck_venue_conflicts('f8800000-0000-0000-0000-000000000011');
reset role;
select is((select (result ->> 'flaggedCount')::int || '/' || (result ->> 'activeCount')::int from spm88_result where label = 'room'),
  '1/2', 'AC01: re-checking the Room flags its overlapping pair (one pair, two flagged bookings)');
select is(pg_temp.active_flags('f8800000-0000-0000-0000-000000000010'), 2,
  'AC01: re-checking one venue leaves other venues'' flags as they were');

-- AC04: a booking whose effective window overlaps a venue block is flagged too.
insert into public.venue_unavailability (id, venue_id, starts_at, ends_at, reason) values
  ('f8800000-0000-0000-0000-0000000000c1', 'f8800000-0000-0000-0000-000000000011',
   '2099-06-02T15:00:00+08:00', '2099-06-02T16:00:00+08:00', 'Aircon servicing');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8800000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$select public.recheck_venue_conflicts('f8800000-0000-0000-0000-000000000011')$$,
  'Venue Staff re-check the Room after a block is added');
reset role;
select is((select count(*)::int from public.venue_booking_conflicts
  where booking_id = 'f8800000-0000-0000-0000-0000000000b4' and conflicting_block_id = 'f8800000-0000-0000-0000-0000000000c1'
    and resolved_at is null and is_responsible),
  1, 'AC04: the booking whose turnaround runs into the block (15:00-16:30 vs 15:00-16:00) is flagged against it');
select is((select count(*)::int from public.venue_booking_conflicts
  where booking_id = 'f8800000-0000-0000-0000-0000000000b3' and conflicting_block_id is not null),
  0, 'AC04: a booking clear of the block is not flagged against it');

-- AC01: re-checking all venues covers every venue and adds no duplicates.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8800000-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into spm88_result select 'all', public.recheck_all_venue_conflicts();
reset role;
select is((select (result ->> 'flaggedCount')::int from spm88_result where label = 'all'),
  0, 'AC01: re-checking all venues finds nothing new once each venue is checked');
select is(pg_temp.active_flags('f8800000-0000-0000-0000-000000000010') + pg_temp.active_flags('f8800000-0000-0000-0000-000000000011'),
  5, 'AC01: every venue''s flags are still active after re-checking all venues (2 Hall + 3 Room)');

-- AC05: who can see the flagged bookings list. The page reads venue_booking_conflicts
-- directly through Supabase, so RLS is what scopes it.
-- Coordinator A requested the two morning bookings; Coordinator B the two afternoon ones.
create function pg_temp.visible_flags()
returns integer
language sql
as $$
  select count(*)::int from public.venue_booking_conflicts where booking_id::text like 'f8800000-%';
$$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8800000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(pg_temp.visible_flags(), 5, 'AC05: Venue Staff see every flagged booking');
select set_config('request.jwt.claims', '{"sub":"f8800000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is(pg_temp.visible_flags(), 2, 'AC05: a coordinator sees only the flags on their own bookings (two morning bookings)');
select set_config('request.jwt.claims', '{"sub":"f8800000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is(pg_temp.visible_flags(), 3, 'AC05: the other coordinator sees only theirs (two booking flags and one block flag)');
select set_config('request.jwt.claims', '{"sub":"f8800000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select is(pg_temp.visible_flags(), 0, 'AC05: an organiser sees no flagged bookings');

-- AC03/AC04: only the conflict check writes flags; a user cannot add or remove one directly.
select set_config('request.jwt.claims', '{"sub":"f8800000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$insert into public.venue_booking_conflicts (booking_id, conflicting_booking_id, cause)
  values ('f8800000-0000-0000-0000-0000000000b1', 'f8800000-0000-0000-0000-0000000000b3', 'Made up by hand')$$,
  '42501', null, 'a coordinator cannot add a flag directly');
-- Refused outright or silently matching no rows are both fine; the count below proves nothing went.
do $$
begin
  delete from public.venue_booking_conflicts where booking_id = 'f8800000-0000-0000-0000-0000000000b1';
exception when insufficient_privilege then
  null;
end $$;
reset role;
select is(pg_temp.active_flags('f8800000-0000-0000-0000-000000000010') + pg_temp.active_flags('f8800000-0000-0000-0000-000000000011'),
  5, 'a coordinator cannot remove a flag directly (their delete changes nothing)');

-- AC06: once the overlap is gone, the check clears the flags.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8800000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$select public.update_venue('f8800000-0000-0000-0000-000000000010',
  pg_temp.venue_payload('SPM88 Hall', 200, 0, 30))$$, 'Venue Staff reduce the Hall turnaround to 30 minutes');
reset role;
select is(pg_temp.active_flags('f8800000-0000-0000-0000-000000000010'), 0,
  'AC06: bookings that no longer overlap (12:00 + 30 min < 13:00) have their flags cleared');
select is((select count(*)::int from public.venue_booking_conflicts
  where booking_id in ('f8800000-0000-0000-0000-0000000000b1', 'f8800000-0000-0000-0000-0000000000b2')
    and resolved_at is not null and resolved_by = 'f8800000-0000-0000-0000-000000000001'),
  2, 'AC06: the cleared flags record when and by whom they were cleared');
select is((select count(*)::int from public.notifications
  where recipient_id = 'f8800000-0000-0000-0000-000000000001' and type = 'venue_conflict_resolved'
    and message like '%SPM88 Morning Talk%SPM88 Afternoon Talk%no longer active%'),
  1, 'AC06: Venue Staff are told the conflict was cleared, once per pair');
select is((select string_agg(status::text, ', ' order by id) from public.venue_bookings
  where id in ('f8800000-0000-0000-0000-0000000000b1', 'f8800000-0000-0000-0000-0000000000b2')),
  'approved, pending', 'AC03: clearing a flag does not change the bookings either');

-- AC06: removing the block clears the booking's flag against it.
update public.venue_unavailability set removed_at = now() where id = 'f8800000-0000-0000-0000-0000000000c1';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8800000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$select public.recheck_venue_conflicts('f8800000-0000-0000-0000-000000000011')$$,
  'Venue Staff re-check the Room after the block is removed');
reset role;
select is((select count(*)::int from public.venue_booking_conflicts
  where conflicting_block_id = 'f8800000-0000-0000-0000-0000000000c1' and resolved_at is null),
  0, 'AC06: the flag against the removed block is cleared');
select is(pg_temp.active_flags('f8800000-0000-0000-0000-000000000011'), 2,
  'AC06: the Room''s booking-vs-booking flags stay, since that overlap remains');

select * from finish();
rollback;
