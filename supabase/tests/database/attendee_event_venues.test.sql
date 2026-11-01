begin;

select plan(6);

-- Attendees see a Confirmed event's booked venues, and nothing more about
-- them (202611010012_attendee_event_venues.sql).

insert into auth.users (id, email, raw_user_meta_data) values
  ('ac000000-0000-0000-0000-000000000001', 'aev-organiser@example.test', '{"full_name":"AEV Organiser","role":"event_organiser"}'::jsonb),
  ('ac000000-0000-0000-0000-000000000002', 'aev-coordinator@example.test', '{"full_name":"AEV Coordinator","role":"event_coordinator"}'::jsonb),
  ('ac000000-0000-0000-0000-000000000003', 'aev-attendee@example.test', '{"full_name":"AEV Attendee","role":"attendee"}'::jsonb);

insert into public.venues (id, name, location, capacity) values
  ('ac000000-0000-0000-0000-000000000010', 'AEV Willow Room', 'Marina Bay', 100),
  ('ac000000-0000-0000-0000-000000000011', 'AEV Room 2.01', 'Block A', 30),
  ('ac000000-0000-0000-0000-000000000012', 'AEV Pending Hall', 'Orchard', 200);

-- E1 Confirmed with a main venue, a breakout room and a still-pending request.
-- E2 in Planning (not visible to attendees, so no venues either).
insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at)
values
  ('ac000000-0000-0000-0000-0000000000e1', 'ac000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000002',
   'AEV Conference', 'confirmed', '2099-12-05T10:00:00+08:00', '2099-12-05T14:00:00+08:00'),
  ('ac000000-0000-0000-0000-0000000000e2', 'ac000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000002',
   'AEV Planning', 'planning', '2099-12-06T10:00:00+08:00', '2099-12-06T14:00:00+08:00');

insert into public.venue_bookings (event_id, venue_id, requested_by, starts_at, ends_at, status, is_main_venue, label)
values
  ('ac000000-0000-0000-0000-0000000000e1', 'ac000000-0000-0000-0000-000000000010', 'ac000000-0000-0000-0000-000000000002',
   '2099-12-05T10:00:00+08:00', '2099-12-05T14:00:00+08:00', 'approved', true, 'Main programme'),
  ('ac000000-0000-0000-0000-0000000000e1', 'ac000000-0000-0000-0000-000000000011', 'ac000000-0000-0000-0000-000000000002',
   '2099-12-05T10:00:00+08:00', '2099-12-05T14:00:00+08:00', 'approved', false, 'Breakout A'),
  ('ac000000-0000-0000-0000-0000000000e1', 'ac000000-0000-0000-0000-000000000012', 'ac000000-0000-0000-0000-000000000002',
   '2099-12-05T10:00:00+08:00', '2099-12-05T14:00:00+08:00', 'pending', false, 'Overflow'),
  ('ac000000-0000-0000-0000-0000000000e2', 'ac000000-0000-0000-0000-000000000010', 'ac000000-0000-0000-0000-000000000002',
   '2099-12-06T10:00:00+08:00', '2099-12-06T14:00:00+08:00', 'approved', true, 'Main programme');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ac000000-0000-0000-0000-000000000003","role":"authenticated"}', true);

create temporary table v_venues as
select * from public.attendee_event_venues(array['ac000000-0000-0000-0000-0000000000e1', 'ac000000-0000-0000-0000-0000000000e2']::uuid[]);

select is(
  (select array_agg(venue_name || ' | ' || coalesce(label, '') order by is_main_venue desc, venue_name)
   from v_venues where event_id = 'ac000000-0000-0000-0000-0000000000e1'),
  array['AEV Willow Room | Main programme', 'AEV Room 2.01 | Breakout A'],
  'an attendee sees a Confirmed event''s approved venues, main first, with labels'
);
select is(
  (select venue_location from v_venues where is_main_venue),
  'Marina Bay',
  'with each venue''s location'
);
select is(
  (select count(*)::int from v_venues where venue_name = 'AEV Pending Hall'),
  0,
  'a venue request that isn''t approved is left out'
);
select is(
  (select count(*)::int from v_venues where event_id = 'ac000000-0000-0000-0000-0000000000e2'),
  0,
  'an event that isn''t Confirmed shows no venues'
);
select hasnt_column('pg_temp', 'v_venues', 'status', 'no booking status or other booking details are returned');

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(
  (select row(venue_name, venue_location) from public.list_public_events(50) where title = 'AEV Conference'),
  row('AEV Willow Room'::text, 'Marina Bay'::text),
  'the public main page shows the main venue'
);

select * from finish();
rollback;
