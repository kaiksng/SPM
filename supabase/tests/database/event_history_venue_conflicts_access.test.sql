begin;
select plan(7);

-- SPM-9: who can read the venue conflicts on an event's bookings, for its
-- change history (202611010005_event_history_venue_conflicts_access.sql).
insert into auth.users (id, email, raw_user_meta_data) values
  ('f9100000-0000-0000-0000-000000000001', 'hist-staff@example.test', '{"full_name":"Hist Staff","role":"venue_staff"}'::jsonb),
  ('f9100000-0000-0000-0000-000000000002', 'hist-assigned@example.test', '{"full_name":"Hist Assigned","role":"event_coordinator"}'::jsonb),
  ('f9100000-0000-0000-0000-000000000003', 'hist-requester@example.test', '{"full_name":"Hist Requester","role":"event_coordinator"}'::jsonb),
  ('f9100000-0000-0000-0000-000000000004', 'hist-other@example.test', '{"full_name":"Hist Other","role":"event_coordinator"}'::jsonb),
  ('f9100000-0000-0000-0000-000000000005', 'hist-lead@example.test', '{"full_name":"Hist Lead","role":"event_coordinator_lead"}'::jsonb),
  ('f9100000-0000-0000-0000-000000000006', 'hist-organiser@example.test', '{"full_name":"Hist Organiser","role":"event_organiser"}'::jsonb);

insert into public.venues (id, name, location, area_tags, capacity, operating_hours, setup_time_minutes, turnaround_time_minutes) values
  ('f9100000-0000-0000-0000-000000000010', 'Hist Hall', 'Block 91', array['Central Area'], 200,
   '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}]'::jsonb, 30, 0);

-- The booking was made by one coordinator; the event has since been
-- reassigned to another.
insert into public.events (id, organiser_id, assigned_coordinator_id, title, expected_attendance, status, starts_at, ends_at) values
  ('f9100000-0000-0000-0000-0000000000e1', 'f9100000-0000-0000-0000-000000000006', 'f9100000-0000-0000-0000-000000000002',
   'Hist Reassigned Talk', 50, 'planning', '2099-07-01T10:00:00+08:00', '2099-07-01T12:00:00+08:00');

insert into public.venue_bookings (id, event_id, venue_id, requested_by, requested_at, starts_at, ends_at, status) values
  ('f9100000-0000-0000-0000-0000000000b1', 'f9100000-0000-0000-0000-0000000000e1', 'f9100000-0000-0000-0000-000000000010',
   'f9100000-0000-0000-0000-000000000003', '2099-06-01T09:00:00+08:00', '2099-07-01T10:00:00+08:00', '2099-07-01T12:00:00+08:00', 'approved');

insert into public.venue_unavailability (id, venue_id, reason, starts_at, ends_at) values
  ('f9100000-0000-0000-0000-0000000000a1', 'f9100000-0000-0000-0000-000000000010', 'Hist block',
   '2099-07-01T09:40:00+08:00', '2099-07-01T09:50:00+08:00');

insert into public.venue_booking_conflicts (booking_id, conflicting_block_id, cause, flagged_by)
values ('f9100000-0000-0000-0000-0000000000b1', 'f9100000-0000-0000-0000-0000000000a1',
        'Overlaps a venue block once setup/turnaround time is applied', 'f9100000-0000-0000-0000-000000000001');

create function pg_temp.visible_conflicts() returns integer language sql as $$
  select count(*)::integer from public.venue_booking_conflicts
  where booking_id = 'f9100000-0000-0000-0000-0000000000b1'
$$;

set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"f9100000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is(pg_temp.visible_conflicts(), 1, 'the event''s assigned coordinator sees its conflicts, even on a booking someone else made');

select set_config('request.jwt.claims', '{"sub":"f9100000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select is(pg_temp.visible_conflicts(), 1, 'the Event Coordinator Lead sees the conflicts');

select set_config('request.jwt.claims', '{"sub":"f9100000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is(pg_temp.visible_conflicts(), 1, 'the coordinator who made the booking still sees them (202610090004)');

select set_config('request.jwt.claims', '{"sub":"f9100000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(pg_temp.visible_conflicts(), 1, 'Venue Staff still see them');

select set_config('request.jwt.claims', '{"sub":"f9100000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select is(pg_temp.visible_conflicts(), 0, 'a coordinator with no part in the event sees none');

select set_config('request.jwt.claims', '{"sub":"f9100000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select is(pg_temp.visible_conflicts(), 0, 'the organiser sees none, as for disruptions');

select set_config('request.jwt.claims', '{"sub":"f9100000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$insert into public.venue_booking_conflicts (booking_id, conflicting_block_id, cause)
    values ('f9100000-0000-0000-0000-0000000000b1', 'f9100000-0000-0000-0000-0000000000a1', 'made up')$$,
  '42501', null,
  'reading is all the assigned coordinator gains: conflicts are still written by the re-check alone'
);

reset role;
select * from finish();
rollback;
