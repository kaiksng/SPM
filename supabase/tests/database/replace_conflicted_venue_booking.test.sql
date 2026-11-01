begin;
select plan(10);

-- A booking that has to move because of a conflict is replaced like a
-- disrupted one (202611010015_replace_conflicted_venue_booking.sql).
insert into auth.users (id, email, raw_user_meta_data) values
  ('fa200000-0000-0000-0000-000000000001', 'rc-first@example.test', '{"full_name":"First Coordinator","role":"event_coordinator"}'::jsonb),
  ('fa200000-0000-0000-0000-000000000002', 'rc-later@example.test', '{"full_name":"Later Coordinator","role":"event_coordinator"}'::jsonb),
  ('fa200000-0000-0000-0000-000000000005', 'rc-organiser@example.test', '{"full_name":"RC Organiser","role":"event_organiser"}'::jsonb),
  ('fa200000-0000-0000-0000-000000000006', 'rc-staff@example.test', '{"full_name":"RC Staff","role":"venue_staff"}'::jsonb);

insert into public.venues (id, name, location, area_tags, capacity, operating_hours, setup_time_minutes, turnaround_time_minutes) values
  ('fa200000-0000-0000-0000-000000000010', 'RC Hall', 'Block 20', array['Central Area'], 200,
   '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}]'::jsonb, 30, 30),
  ('fa200000-0000-0000-0000-000000000011', 'RC Annex', 'Block 21', array['Central Area'], 200,
   '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}]'::jsonb, 0, 0),
  ('fa200000-0000-0000-0000-000000000012', 'RC Loft', 'Block 22', array['Central Area'], 200,
   '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}]'::jsonb, 0, 0);

insert into public.events (id, organiser_id, assigned_coordinator_id, title, expected_attendance, status, starts_at, ends_at) values
  ('fa200000-0000-0000-0000-0000000000e1', 'fa200000-0000-0000-0000-000000000005', 'fa200000-0000-0000-0000-000000000001',
   'RC First Event', 50, 'planning', '2099-09-01T10:00:00+08:00', '2099-09-01T12:00:00+08:00'),
  ('fa200000-0000-0000-0000-0000000000e2', 'fa200000-0000-0000-0000-000000000005', 'fa200000-0000-0000-0000-000000000002',
   'RC Later Event', 50, 'planning', '2099-09-01T12:15:00+08:00', '2099-09-01T13:00:00+08:00');

insert into public.venue_bookings (id, event_id, venue_id, requested_by, requested_at, starts_at, ends_at, status, is_main_venue, expected_headcount) values
  ('fa200000-0000-0000-0000-0000000000b1', 'fa200000-0000-0000-0000-0000000000e1', 'fa200000-0000-0000-0000-000000000010',
   'fa200000-0000-0000-0000-000000000001', '2099-07-01T09:00:00+08:00', '2099-09-01T10:00:00+08:00', '2099-09-01T12:00:00+08:00', 'approved', true, 50),
  ('fa200000-0000-0000-0000-0000000000b2', 'fa200000-0000-0000-0000-0000000000e2', 'fa200000-0000-0000-0000-000000000010',
   'fa200000-0000-0000-0000-000000000002', '2099-07-02T09:00:00+08:00', '2099-09-01T12:15:00+08:00', '2099-09-01T13:00:00+08:00', 'approved', true, 50);

-- What recheck_venue_conflicts records: the later request is responsible.
insert into public.venue_booking_conflicts (booking_id, conflicting_booking_id, cause, is_responsible, flagged_by) values
  ('fa200000-0000-0000-0000-0000000000b1', 'fa200000-0000-0000-0000-0000000000b2',
   'Overlaps another booking once setup/turnaround time is applied', false, 'fa200000-0000-0000-0000-000000000006'),
  ('fa200000-0000-0000-0000-0000000000b2', 'fa200000-0000-0000-0000-0000000000b1',
   'Overlaps another booking once setup/turnaround time is applied', true, 'fa200000-0000-0000-0000-000000000006');

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

set local role authenticated;

-- The coordinator booked first has nothing to replace.
select set_config('request.jwt.claims', '{"sub":"fa200000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select public.request_replacement_venue('fa200000-0000-0000-0000-0000000000b1', 'fa200000-0000-0000-0000-000000000011')$$,
  '23514', 'This venue booking is not disrupted, so it does not need a replacement',
  'the booking made first stays, so it cannot be replaced'
);

-- The later coordinator replaces theirs; a rejected try leaves it clashing.
select set_config('request.jwt.claims', '{"sub":"fa200000-0000-0000-0000-000000000002","role":"authenticated"}', true);
insert into ids select 'rejected', public.request_replacement_venue('fa200000-0000-0000-0000-0000000000b2', 'fa200000-0000-0000-0000-000000000012');
reset role;

select ok(
  (select message like '%replacing its conflicting booking at RC Hall%' from public.notifications
   where recipient_id = 'fa200000-0000-0000-0000-000000000006' and booking_id = (select id from ids where name = 'rejected')),
  'Venue Staff are told the request replaces a conflicting booking'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"fa200000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select public.decide_venue_booking_request((select id from ids where name = 'rejected'), 'rejected', 'Loft is closed', 'fa200000-0000-0000-0000-000000000006');
reset role;
select ok(
  (select message like '%still clashes with another booking; you can request another venue.' from public.notifications
   where recipient_id = 'fa200000-0000-0000-0000-000000000002' and title = 'Replacement venue rejected'),
  'a rejected replacement tells the coordinator the booking still clashes'
);
select is((select status::text from public.venue_bookings where id = 'fa200000-0000-0000-0000-0000000000b2'), 'approved',
  'the clashing booking stays until a replacement is approved');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"fa200000-0000-0000-0000-000000000002","role":"authenticated"}', true);
insert into ids select 'approved', public.request_replacement_venue('fa200000-0000-0000-0000-0000000000b2', 'fa200000-0000-0000-0000-000000000011');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"fa200000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select public.decide_venue_booking_request((select id from ids where name = 'approved'), 'approved', null, 'fa200000-0000-0000-0000-000000000006');
reset role;

select is((select status::text from public.venue_bookings where id = 'fa200000-0000-0000-0000-0000000000b2'), 'cancelled',
  'approving the replacement releases the clashing booking');
select is(
  (select is_main_venue from public.venue_bookings where id = (select id from ids where name = 'approved')), true,
  'the replacement is the event''s main venue now');
select is(
  (select count(*)::int from public.venue_booking_conflicts
   where 'fa200000-0000-0000-0000-0000000000b2' in (booking_id, conflicting_booking_id) and resolved_at is null), 0,
  'the conflict is resolved on both sides');
select is(
  public.event_readiness('fa200000-0000-0000-0000-0000000000e2', 'fa200000-0000-0000-0000-000000000002') -> 'venues' -> 0 ->> 'venueName',
  'RC Annex', 'the later event''s checklist now shows the new venue');
select is(
  public.event_readiness('fa200000-0000-0000-0000-0000000000e1', 'fa200000-0000-0000-0000-000000000001') -> 'venues' -> 0 ->> 'status',
  'complete', 'the event booked first is unaffected');
select ok(
  (select message like '%has been approved. The earlier booking at RC Hall has been cancelled.' from public.notifications
   where recipient_id = 'fa200000-0000-0000-0000-000000000002' and title = 'Replacement venue approved'),
  'the coordinator is told the replacement was approved and the clashing booking cancelled'
);

select * from finish();
rollback;
