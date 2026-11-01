begin;
select plan(12);

-- The coordinator side of a venue conflict (202611010010_coordinator_venue_conflicts.sql):
-- only the later-requested booking needs review, the reason says why, and
-- the Venue step can read the other booking's event and times.
insert into auth.users (id, email, raw_user_meta_data) values
  ('fa100000-0000-0000-0000-000000000001', 'vc-first@example.test', '{"full_name":"First Coordinator","role":"event_coordinator"}'::jsonb),
  ('fa100000-0000-0000-0000-000000000002', 'vc-later@example.test', '{"full_name":"Later Coordinator","role":"event_coordinator"}'::jsonb),
  ('fa100000-0000-0000-0000-000000000003', 'vc-other@example.test', '{"full_name":"Other Coordinator","role":"event_coordinator"}'::jsonb),
  ('fa100000-0000-0000-0000-000000000004', 'vc-lead@example.test', '{"full_name":"Conflict Lead","role":"event_coordinator_lead"}'::jsonb),
  ('fa100000-0000-0000-0000-000000000005', 'vc-organiser@example.test', '{"full_name":"Conflict Organiser","role":"event_organiser"}'::jsonb),
  ('fa100000-0000-0000-0000-000000000006', 'vc-staff@example.test', '{"full_name":"Conflict Staff","role":"venue_staff"}'::jsonb);

insert into public.venues (id, name, location, area_tags, capacity, operating_hours, setup_time_minutes, turnaround_time_minutes) values
  ('fa100000-0000-0000-0000-000000000010', 'Conflict Hall', 'Block 10', array['Central Area'], 200,
   '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}]'::jsonb, 30, 30);

insert into public.events (id, organiser_id, assigned_coordinator_id, title, expected_attendance, status, starts_at, ends_at) values
  ('fa100000-0000-0000-0000-0000000000e1', 'fa100000-0000-0000-0000-000000000005', 'fa100000-0000-0000-0000-000000000001',
   'First Event', 50, 'planning', '2099-08-01T10:00:00+08:00', '2099-08-01T12:00:00+08:00'),
  ('fa100000-0000-0000-0000-0000000000e2', 'fa100000-0000-0000-0000-000000000005', 'fa100000-0000-0000-0000-000000000002',
   'Second Event', 50, 'planning', '2099-08-01T12:15:00+08:00', '2099-08-01T13:00:00+08:00'),
  ('fa100000-0000-0000-0000-0000000000e3', 'fa100000-0000-0000-0000-000000000005', 'fa100000-0000-0000-0000-000000000002',
   'Blocked Event', 50, 'planning', '2099-08-02T10:00:00+08:00', '2099-08-02T12:00:00+08:00'),
  ('fa100000-0000-0000-0000-0000000000e4', 'fa100000-0000-0000-0000-000000000005', 'fa100000-0000-0000-0000-000000000002',
   'Changed Event', 50, 'planning', '2099-08-03T10:00:00+08:00', '2099-08-03T12:00:00+08:00');

insert into public.venue_bookings (id, event_id, venue_id, requested_by, requested_at, starts_at, ends_at, status, is_main_venue, needs_review, needs_review_reason) values
  ('fa100000-0000-0000-0000-0000000000b1', 'fa100000-0000-0000-0000-0000000000e1', 'fa100000-0000-0000-0000-000000000010',
   'fa100000-0000-0000-0000-000000000001', '2099-06-01T09:00:00+08:00', '2099-08-01T10:00:00+08:00', '2099-08-01T12:00:00+08:00', 'approved', true, false, null),
  ('fa100000-0000-0000-0000-0000000000b2', 'fa100000-0000-0000-0000-0000000000e2', 'fa100000-0000-0000-0000-000000000010',
   'fa100000-0000-0000-0000-000000000002', '2099-06-02T09:00:00+08:00', '2099-08-01T12:15:00+08:00', '2099-08-01T13:00:00+08:00', 'approved', true, false, null),
  ('fa100000-0000-0000-0000-0000000000b3', 'fa100000-0000-0000-0000-0000000000e3', 'fa100000-0000-0000-0000-000000000010',
   'fa100000-0000-0000-0000-000000000002', '2099-06-03T09:00:00+08:00', '2099-08-02T10:00:00+08:00', '2099-08-02T12:00:00+08:00', 'approved', true, false, null),
  ('fa100000-0000-0000-0000-0000000000b4', 'fa100000-0000-0000-0000-0000000000e4', 'fa100000-0000-0000-0000-000000000010',
   'fa100000-0000-0000-0000-000000000002', '2099-06-04T09:00:00+08:00', '2099-08-03T10:00:00+08:00', '2099-08-03T12:00:00+08:00', 'approved', true,
   true, 'The Safety Officer asked for this venue to be changed.');

insert into public.venue_unavailability (id, venue_id, reason, starts_at, ends_at) values
  ('fa100000-0000-0000-0000-0000000000a1', 'fa100000-0000-0000-0000-000000000010', 'Fire drill',
   '2099-08-02T09:40:00+08:00', '2099-08-02T09:50:00+08:00');

-- What recheck_venue_conflicts records: both sides of the pair, the later
-- request responsible; a block conflict is always responsible.
insert into public.venue_booking_conflicts (booking_id, conflicting_booking_id, conflicting_block_id, cause, is_responsible, flagged_by) values
  ('fa100000-0000-0000-0000-0000000000b1', 'fa100000-0000-0000-0000-0000000000b2', null,
   'Overlaps another booking once setup/turnaround time is applied', false, 'fa100000-0000-0000-0000-000000000006'),
  ('fa100000-0000-0000-0000-0000000000b2', 'fa100000-0000-0000-0000-0000000000b1', null,
   'Overlaps another booking once setup/turnaround time is applied', true, 'fa100000-0000-0000-0000-000000000006'),
  ('fa100000-0000-0000-0000-0000000000b3', null, 'fa100000-0000-0000-0000-0000000000a1',
   'Overlaps a venue block once setup/turnaround time is applied', true, 'fa100000-0000-0000-0000-000000000006');

create function pg_temp.venue_item(p_event uuid, p_actor uuid) returns jsonb language sql as $$
  select public.event_readiness(p_event, p_actor) -> 'venues' -> 0
$$;

select is(pg_temp.venue_item('fa100000-0000-0000-0000-0000000000e1', 'fa100000-0000-0000-0000-000000000001') ->> 'status', 'complete',
  'the booking made first stays booked and is not held up by the conflict');
select is(pg_temp.venue_item('fa100000-0000-0000-0000-0000000000e2', 'fa100000-0000-0000-0000-000000000002') ->> 'status', 'needs_review',
  'the booking made later needs review');
select is(pg_temp.venue_item('fa100000-0000-0000-0000-0000000000e2', 'fa100000-0000-0000-0000-000000000002') ->> 'needsReviewReason',
  'Clashes with "First Event", which was booked first, once the venue''s setup and turnaround time is applied. Move or cancel this booking on the Venue step.',
  'the later booking says what it clashes with and what to do');
select is((pg_temp.venue_item('fa100000-0000-0000-0000-0000000000e2', 'fa100000-0000-0000-0000-000000000002') ->> 'canMarkResolved')::boolean, false,
  'a conflict cannot be marked resolved; it clears once the booking moves');
select is(pg_temp.venue_item('fa100000-0000-0000-0000-0000000000e3', 'fa100000-0000-0000-0000-000000000002') ->> 'needsReviewReason',
  'Overlaps the venue block "Fire drill" once the venue''s setup and turnaround time is applied. Move or cancel this booking on the Venue step.',
  'a booking overlapping a venue block needs review with the block''s reason');
select is(pg_temp.venue_item('fa100000-0000-0000-0000-0000000000e4', 'fa100000-0000-0000-0000-000000000002') - 'bookingId',
  jsonb_build_object('venueName', 'Conflict Hall', 'isMainVenue', true, 'status', 'needs_review',
    'needsReviewReason', 'The Safety Officer asked for this venue to be changed.', 'canMarkResolved', true),
  'a flagged booking keeps its own reason and can be marked resolved');

set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"fa100000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select results_eq(
  $$select must_move, conflicting_event_title, conflicting_starts_at, conflicting_ends_at
    from public.event_venue_conflicts('fa100000-0000-0000-0000-0000000000e2')$$,
  $$values (true, 'First Event'::text, '2099-08-01T10:00:00+08:00'::timestamptz, '2099-08-01T12:00:00+08:00'::timestamptz)$$,
  'the later coordinator sees the event booked first and its times, and that they must move'
);
select results_eq(
  $$select block_reason, block_starts_at from public.event_venue_conflicts('fa100000-0000-0000-0000-0000000000e3')$$,
  $$values ('Fire drill'::text, '2099-08-02T09:40:00+08:00'::timestamptz)$$,
  'a block conflict comes with the block''s reason and time'
);

select set_config('request.jwt.claims', '{"sub":"fa100000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select results_eq(
  $$select must_move, conflicting_event_title from public.event_venue_conflicts('fa100000-0000-0000-0000-0000000000e1')$$,
  $$values (false, 'Second Event'::text)$$,
  'the first coordinator sees the later booking and that they need not move'
);

select set_config('request.jwt.claims', '{"sub":"fa100000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select is((select count(*)::int from public.event_venue_conflicts('fa100000-0000-0000-0000-0000000000e1')), 1,
  'the Event Coordinator Lead sees the conflict');

select set_config('request.jwt.claims', '{"sub":"fa100000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is((select count(*)::int from public.event_venue_conflicts('fa100000-0000-0000-0000-0000000000e1')), 0,
  'a coordinator with no part in the event sees nothing');

select set_config('request.jwt.claims', '{"sub":"fa100000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select is((select count(*)::int from public.event_venue_conflicts('fa100000-0000-0000-0000-0000000000e1')), 0,
  'the organiser sees nothing, as for the conflicts themselves');

reset role;
select * from finish();
rollback;
