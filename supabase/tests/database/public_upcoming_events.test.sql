begin;

select plan(8);

-- Upcoming events on the public main page (202610310001_public_upcoming_events.sql).

insert into auth.users (id, email, raw_user_meta_data)
values
  ('bb000000-0000-0000-0000-000000000001', 'public-organiser@example.test', '{"full_name":"Public Organiser","role":"event_organiser"}'::jsonb),
  ('bb000000-0000-0000-0000-000000000002', 'public-attendee@example.test', '{"full_name":"Public Attendee","role":"attendee"}'::jsonb),
  ('bb000000-0000-0000-0000-000000000003', 'public-coordinator@example.test', '{"full_name":"Public Coordinator","role":"event_coordinator"}'::jsonb);

insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at, banner_path)
values
  ('bb000000-0000-0000-0000-0000000000e1', 'bb000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000003', 'Public Upcoming', 'confirmed', '2099-01-02T10:00:00+08:00', '2099-01-02T14:00:00+08:00', 'bb000000-0000-0000-0000-000000000001/banner.png'),
  ('bb000000-0000-0000-0000-0000000000e2', 'bb000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000003', 'Public Full', 'confirmed', '2099-01-01T10:00:00+08:00', '2099-01-01T14:00:00+08:00', null),
  ('bb000000-0000-0000-0000-0000000000e3', 'bb000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000003', 'Public Planning', 'planning', '2099-01-03T10:00:00+08:00', '2099-01-03T14:00:00+08:00', null),
  ('bb000000-0000-0000-0000-0000000000e4', 'bb000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000003', 'Public No Registration', 'confirmed', '2099-01-04T10:00:00+08:00', '2099-01-04T14:00:00+08:00', null),
  ('bb000000-0000-0000-0000-0000000000e5', 'bb000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000003', 'Public Ended', 'confirmed', '2000-01-01T10:00:00+08:00', '2000-01-01T14:00:00+08:00', null);

insert into public.event_registration_requirements (event_id, registration_required, registration_opens_at, registration_closes_at, attendee_capacity)
values
  ('bb000000-0000-0000-0000-0000000000e1', true, '2098-12-01T00:00:00+08:00', '2099-01-01T00:00:00+08:00', 100),
  ('bb000000-0000-0000-0000-0000000000e2', true, null, null, 1),
  ('bb000000-0000-0000-0000-0000000000e3', true, null, null, 100),
  ('bb000000-0000-0000-0000-0000000000e4', false, null, null, null),
  ('bb000000-0000-0000-0000-0000000000e5', true, null, null, 100)
on conflict (event_id) do update set
  registration_required = excluded.registration_required,
  registration_opens_at = excluded.registration_opens_at,
  registration_closes_at = excluded.registration_closes_at,
  attendee_capacity = excluded.attendee_capacity;

insert into public.event_venue_requirements (event_id, preferred_location)
values ('bb000000-0000-0000-0000-0000000000e1', 'Main Hall')
on conflict (event_id) do update set preferred_location = excluded.preferred_location;

insert into public.event_registrations (event_id, attendee_id, status)
values ('bb000000-0000-0000-0000-0000000000e2', 'bb000000-0000-0000-0000-000000000002', 'registered');

-- A visitor who has not signed in.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

create temporary table v_listed as
select * from public.list_public_events(50) where title like 'Public %';

select is(
  (select array_agg(title order by starts_at) from v_listed),
  array['Public Full', 'Public Upcoming'],
  'a signed-out visitor sees upcoming confirmed events that take registrations, soonest first'
);
select is(
  (select row(location, banner_path) from v_listed where title = 'Public Upcoming'),
  row('Main Hall'::text, 'bb000000-0000-0000-0000-000000000001/banner.png'::text),
  'with the location and banner'
);
select is(
  (select is_full from v_listed where title = 'Public Full'),
  true,
  'a full event says so'
);
select is(
  (select is_full from v_listed where title = 'Public Upcoming'),
  false,
  'an event with places left is not full'
);
select is(
  (select count(*)::int from public.list_public_events(1)),
  1,
  'the number of events can be limited'
);
select is(
  (select count(*)::int from public.events where id = 'bb000000-0000-0000-0000-0000000000e1'),
  0,
  'the events table itself stays closed to signed-out visitors'
);
select hasnt_column(
  'pg_temp', 'v_listed', 'organiser_id',
  'no organiser is returned'
);
select hasnt_column(
  'pg_temp', 'v_listed', 'attendee_capacity',
  'no capacity or registration numbers are returned'
);

select * from finish();
rollback;
